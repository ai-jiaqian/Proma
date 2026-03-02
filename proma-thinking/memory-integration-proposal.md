# Proma 记忆系统集成方案

> 版本：v3.0 | 日期：2026-02-20 | 作者：jiaqian

---

## 一、为什么 Proma 需要记忆

### 1.1 问题现状

Proma 是一款本地优先、多供应商支持的 AI 桌面应用，集成了 Chat 模式和基于 Claude Agent SDK 的通用 Agent 模式。当前 Proma 的对话是**无状态**的——每次新会话都从零开始，Agent 不了解用户是谁、偏好什么、之前做过什么。

这带来了几个实际痛点：

- **重复表达成本高**：用户每次都需要重新说明自己的偏好（如"用中文回复"、"我喜欢简洁风格"、"我的项目用 TypeScript"），Agent 无法跨会话积累对用户的理解。
- **上下文断裂**：Agent 模式下的工作区任务（代码编辑、MCP 工具调用、Skill 执行）产生的经验无法沉淀，下次遇到类似问题仍然从头摸索。
- **个性化缺失**：Proma 有 `user-profile-service.ts` 管理用户名和头像，但这只是静态标签，不是动态的认知模型。真正的个性化需要 Agent 能够从交互中持续学习用户的行为模式、技术栈偏好、工作习惯等。

### 1.2 Proma 对记忆的定位

Proma 的 README 明确提到了未来方向：**"利用对用户的理解和记忆实现主动提供软件和建议的能力"**。这不是一个可选的增强功能，而是 Proma 从"工具"进化为"伙伴"的关键能力。

我们将记忆定位为 Proma 的**基础设施层能力**，而非上层应用功能。具体而言：

- **第一阶段（本方案）**：实现用户偏好和事实记忆的自动捕获与注入，让 Agent 跨会话"认识"用户
- **第二阶段**：本地化记忆存储与检索，摆脱对云端的依赖
- **第三阶段**：完整的记忆生命周期管理，实现记忆驱动的主动建议

---

## 二、为什么选择 MemOS

### 2.1 从记忆核心能力出发

Proma 需要的记忆系统必须覆盖四个核心维度：**存储、检索、调度、生命周期管理**。

| 核心维度 | 具体需求 | MemOS 的能力 |
|:---:|:---:|:---:|
| **存储** | 结构化存储事实和偏好，支持关联关系 | MemCube 统一封装，Neo4j 图数据库 + Qdrant 向量库，树-图混合结构 |
| **检索** | 语义检索 + 关系检索，区分 fact/preference | 语义+图混合检索，条目级粒度，带 confidence 评分和来源溯源 |
| **调度** | 异步写入不阻塞主流程，支持优先级 | MemScheduler（Redis Streams 异步队列，优先级/配额/自动恢复） |
| **生命周期** | 提取→去重→矛盾检测→重组→淘汰→修正 | MemLifecycle 完整覆盖，含 KMeans 聚类重组、FIFO 淘汰、自然语言反馈修正 |

MemOS 是目前开源社区中**唯一在这四个维度上都提供成熟方案**的记忆系统。

### 2.2 从企业专业度出发

**记忆张量（MemTensor）是一家专注于 AI 记忆系统的公司**，记忆是其核心产品而非副业。这意味着：

- **深度积累**：团队在记忆提取、去重、矛盾检测、重组等细分问题上有深度积累，这些是自研需要大量时间才能达到的水平
- **快速迭代**：从 v1.0 Stellar 到 v2.0 Stardust，半年内完成了 KB 支持、多模态记忆、工具记忆、反馈修正等重大特性
- **学术背书**：联合上海交大、人大发表 arXiv 论文（2507.03724），在 LoCoMo 基准上相较 OpenAI Memory 实现 +43.70% 准确率提升
- **社区生态**：已有 OpenClaw 插件、MCP Server、Coze 插件、Python SDK 等成熟集成案例

**借助 MemOS 社区的东风，Proma 可以专注于自身的记忆应用层创新，而将记忆基础设施的演进交给专业团队。** 随着 MemOS 版本迭代，Proma 的记忆能力也会自然增强。

### 2.3 关于 OpenViking

此前调研的 OpenViking（字节跳动火山引擎）定位为通用上下文数据库，更适合 Agent 的资源检索和技能管理场景。在记忆的调度和生命周期管理上缺乏对应能力，且作为 Python SDK 与 Proma 的 TypeScript 技术栈存在桥接成本。

**结论：不再将 OpenViking 纳入集成计划。** 如果未来 Proma 需要工作区级知识管理能力，可以基于 MemOS 的 KB（知识库）功能实现，无需引入额外系统。

---

## 三、分阶段集成设计

### 核心原则

Proma 是桌面客户端，不是 Web 服务。集成方案必须遵循：

- **轻量优先**：不要求用户安装 Docker、Neo4j、Qdrant 等重型依赖
- **渐进增强**：从最简单的方案开始，逐步增加能力
- **静默降级**：记忆系统不可用时，Proma 一切正常

### 阶段总览

```
Phase 1: MemOS Cloud API 集成（最轻量，快速验证）
   ↓  验证记忆能力对用户体验的提升
Phase 2: Proma 内置轻量记忆层（本地化，零外部依赖）
   ↓  借鉴 MemOS 的记忆提取和去重算法
Phase 3: MemOS 本地部署（完整能力，可选升级）
   ↓  面向高级用户，提供完整的记忆生命周期管理
```

---

### Phase 1：MemOS Cloud API 集成

**目标**：用最小的代码改动，快速验证记忆能力对 Proma 用户体验的提升。

**为什么先用 Cloud API**：
- Proma 侧零依赖，纯 HTTP fetch 调用
- 代码改动量最小（新增 ~200 行，修改 ~50 行）
- 免费额度充足（50K add/月，20K search/月），足够验证阶段使用
- Cloud API 和 Self-hosted API 接口一致，后续切换只需改 baseUrl

**架构**：

```
┌──────────────────────────────────────────────────┐
│                 Proma Electron App                │
│                                                   │
│  agent-service.ts                                 │
│    ├─ ① searchMemory(query) ──→ memos-service.ts │
│    ├─ ② 注入 dynamic context                     │
│    ├─ ③ Agent SDK 执行                            │
│    └─ ④ addMessage(messages) ──→ memos-service.ts │
│                                                   │
│  memos-service.ts                                 │
│    └─ HTTP fetch ──→ MemOS Cloud API              │
└──────────────────────────────────────────────────┘
                        │
                        ▼
          https://memos.memtensor.cn/api/openmem/v1
          （记忆提取、存储、检索全部由云端完成）
```

**文件改动**：

| 文件 | 操作 | 说明 |
|:---:|:---:|:---:|
| `memos-service.ts` | 新建 | 封装 MemOS Cloud REST API（add/search/delete/feedback） |
| `agent-service.ts` | 修改 | runAgent() 中增加记忆检索和写入 hook |
| `agent-prompt-builder.ts` | 修改 | buildDynamicContext() 增加记忆注入段 |
| `config-paths.ts` | 修改 | 增加 MemOS 配置路径 |

**memos-service.ts 核心接口**：

```typescript
interface MemosConfig {
  enabled: boolean
  baseUrl: string        // Phase 1: MemOS Cloud URL
  apiKey: string         // Cloud API Token
  userId: string         // 用户标识
  timeoutMs: number      // 默认 5000
}

// 检索记忆
async function searchMemory(query: string): Promise<{
  facts: Array<{ memoryKey: string; memoryValue: string; confidence: number }>
  preferences: Array<{ preference: string; preferenceType: string }>
}>

// 写入对话（异步，不阻塞）
async function addMessage(messages: Message[], conversationId: string): Promise<void>

// 健康检查
async function healthCheck(): Promise<boolean>
```

**agent-service.ts 改动**：

```typescript
// runAgent() 中增加两个 hook

// Hook 1: Agent 执行前 —— 检索记忆
let memoryContext = ''
try {
  const result = await searchMemory(input.userMessage)
  memoryContext = formatMemoryContext(result)
} catch (err) {
  console.warn('[MemOS] 检索失败，跳过:', err)
}

// 注入到 dynamic context
const dynamicContext = buildDynamicContext({
  ...existingCtx,
  memoryContext,
})

// ... Agent SDK 执行 ...

// Hook 2: Agent 完成后 —— 写入记忆（fire-and-forget）
addMessage(lastTurnMessages, sessionId)
  .catch(err => console.warn('[MemOS] 写入失败，跳过:', err))
```

**记忆注入格式**（遵循 MemOS 官方推荐的 prompt 模板）：

```xml
<user_memory>
  <facts>
    - 用户的项目叫 Proma，是一个 Electron + React 的桌面应用
    - 用户使用 TypeScript 技术栈
  </facts>
  <preferences>
    - [明确偏好] 用户偏好用中文回复
    - [推测偏好] 用户可能偏好简洁的代码风格
  </preferences>
</user_memory>
注意：以上为用户历史记忆，仅供参考。如与用户当前表述冲突，以当前表述为准。
```

**静默降级**：

| 场景 | 行为 |
|:---:|:---:|
| 未配置 API Key | 完全跳过，零开销 |
| Cloud API 不可达 | 跳过本次操作，warn 日志 |
| 返回空结果 | 正常运行，不注入记忆 |
| 返回错误 | 捕获异常，不中断主流程 |

**预计工作量**：1-2 天

---

### Phase 2：Proma 内置轻量记忆层

**目标**：实现完全本地化的记忆存储和检索，摆脱对 MemOS Cloud 的依赖。

**核心思路**：借鉴 MemOS 的记忆提取算法（对话→fact/preference），但存储层用 Proma 内置的轻量方案替代 Neo4j + Qdrant。

**为什么不直接用 MemOS Self-hosted**：
- MemOS Self-hosted 需要 Docker + Neo4j + Qdrant，对桌面客户端用户来说太重
- 普通用户不会也不应该为了"记忆"功能去安装和维护数据库容器
- Proma 的记忆规模（单用户、数百到数千条记忆）远不需要图数据库和向量数据库的重型方案

**轻量存储方案**：

```
┌──────────────────────────────────────────────────┐
│                 Proma Electron App                │
│                                                   │
│  memos-service.ts（接口不变，切换后端实现）         │
│    │                                              │
│    ├─ Phase 1 后端: MemOS Cloud API               │
│    │                                              │
│    └─ Phase 2 后端: 本地记忆引擎 ──┐              │
│                                     │              │
│  local-memory-engine.ts             │              │
│    ├─ 记忆提取: LLM 调用（用户已配置的模型）       │
│    ├─ 记忆存储: SQLite（~/.proma/memory.db）      │
│    ├─ 语义检索: 本地 Embedding + 余弦相似度       │
│    └─ 去重决策: LLM 调用（CREATE/UPDATE/SKIP）    │
│                                                   │
└──────────────────────────────────────────────────┘
```

**关键设计**：

1. **存储**：SQLite 单文件数据库，存储在 `~/.proma/memory.db`
   - `memories` 表：id, type(fact/preference), key, value, embedding(BLOB), confidence, tags, created_at, updated_at
   - `conversations` 表：id, session_id, messages(JSON), created_at
   - 单文件，随 Proma 数据目录一起备份/迁移，零运维

2. **记忆提取**：借鉴 MemOS 的 MemReader 算法
   - 对话写入后，调用用户已配置的 LLM（Proma 本身就是多供应商 AI 应用，用户一定有可用的 LLM）
   - Prompt 参考 MemOS 的提取模板，从对话中提取 fact 和 preference
   - 提取结果经 LLM 去重决策后写入 SQLite

3. **语义检索**：
   - 使用轻量 Embedding 模型（如 Ollama 本地模型，或用户已有的 Embedding API）
   - 向量存储在 SQLite 的 BLOB 字段中
   - 检索时计算余弦相似度，取 top-k
   - 记忆规模小（数千条），暴力搜索即可，不需要向量数据库

4. **接口兼容**：`memos-service.ts` 的对外接口保持不变，通过配置切换后端
   ```typescript
   interface MemosConfig {
     enabled: boolean
     backend: 'cloud' | 'local'  // Phase 2 新增
     // cloud 模式配置
     cloudBaseUrl?: string
     apiKey?: string
     // local 模式配置（自动使用 Proma 已有的 LLM 配置）
     embeddingModel?: string
   }
   ```

**与 MemOS 的关系**：
- Phase 2 的记忆提取 Prompt 和去重逻辑参考 MemOS 的开源实现（Apache 2.0）
- 本质上是 MemOS 核心算法的 TypeScript 轻量移植，适配桌面客户端场景
- 随着 MemOS 社区的算法改进，Proma 可以同步更新提取和去重策略

**预计工作量**：3-5 天

---

### Phase 3：完整记忆生命周期管理

**目标**：实现记忆的矛盾检测、定期重组、淘汰策略、反馈修正等高级生命周期管理能力。

**核心内容**：

1. **矛盾检测**：新记忆写入时，检索相似记忆，用 LLM 判断是否矛盾，自动处理（更新/标记/询问用户）

2. **记忆重组**：定期（如每周）对碎片化记忆做聚类和摘要
   - 将多条相关的细粒度记忆合并为一条高质量摘要
   - 减少检索噪音，提升检索精度

3. **淘汰策略**：
   - 基于使用频率和时间衰减的淘汰算法
   - 长期未被检索命中的记忆逐步降低优先级
   - 用户可配置记忆容量上限

4. **反馈修正**：
   - 用户可以通过自然语言修正错误记忆（"你记错了，我现在用 Vue 了"）
   - Agent 识别修正意图后调用 feedback API

5. **记忆管理 UI**：
   - 设置页面增加记忆面板
   - 用户可查看、搜索、删除、修正已存储的记忆
   - 可视化记忆统计（总量、分类、最近活跃等）

6. **工作区级记忆隔离**：
   - 不同工作区使用不同的记忆空间
   - 全局记忆（用户偏好）跨工作区共享
   - 项目记忆（技术栈、架构决策）按工作区隔离

**可选：MemOS Self-hosted 升级路径**：
- 面向高级用户/团队用户，提供一键部署 MemOS 本地服务的选项
- 获得完整的 MemOS 能力（图数据库关系建模、Redis 调度、跨 Agent 记忆共享等）
- `memos-service.ts` 接口不变，只需切换 backend 配置

**预计工作量**：持续迭代

---

## 四、Phase 1 具体设计方案

> 以下为第一阶段的详细设计，Phase 2/3 在实施时再细化。

### 4.1 数据流

```
用户输入消息
    │
    ▼
① memos-service.searchMemory(query=用户消息)
    │  → POST https://memos.memtensor.cn/api/openmem/v1/search/memory
    ▼
② 返回 { facts: [...], preferences: [...] }
    │
    ▼
③ agent-prompt-builder 注入记忆到 dynamic context
    │
    ▼
④ Agent SDK 执行（带记忆上下文的 system prompt）
    │
    ▼
⑤ Agent 返回响应，流式推送给渲染进程
    │
    ▼
⑥ memos-service.addMessage(messages, conversationId)
    │  → POST https://memos.memtensor.cn/api/openmem/v1/add/message
    │  （异步，不阻塞）
    ▼
⑦ MemOS Cloud 自动提取记忆（fact/preference），存入云端
```

### 4.2 配置文件

`~/.proma/memos-config.json`：

```json
{
  "enabled": true,
  "backend": "cloud",
  "cloudBaseUrl": "https://memos.memtensor.cn/api/openmem/v1",
  "apiKey": "mpg-xxx",
  "userId": "proma-user-xxx",
  "timeoutMs": 5000,
  "memoryLimitNumber": 6,
  "preferenceLimitNumber": 6
}
```

### 4.3 静默降级策略

所有 MemOS 调用均包裹在 try/catch 中，超时 5 秒（可配置）。记忆系统作为增强能力，任何异常都不影响 Proma 核心功能。

### 4.4 技术指标预期

| 指标 | 预期值 |
|:---:|:---:|
| 记忆检索延迟 | < 500ms（Cloud API） |
| 记忆写入延迟 | 异步，不阻塞 Agent 响应 |
| 额外 token 开销 | ~200-500 tokens/次 |
| 代码改动量 | 新增 ~200 行，修改 ~50 行 |
| 新增 npm 依赖 | 0（纯 HTTP fetch） |
| 对现有功能影响 | 零（静默降级） |

---

## 五、预期呈现效果

### 5.1 用户视角

**偏好自动学习**：

```
[会话 A]
用户：帮我写一个 React 组件，用 TypeScript，我喜欢用 function component + hooks
Agent：好的，这是组件代码...

[会话 B — 一周后]
用户：帮我写一个表单组件
Agent：（自动检索到偏好，无需用户重复说明）
      这是用 TypeScript 编写的 function component 表单...
```

**事实记忆跨会话**：

```
[会话 A]
用户：我的项目叫 Proma，是一个 Electron + React 的桌面应用

[会话 B]
用户：帮我看看这个 bug
Agent：根据 Proma 的 Electron 架构，这个 bug 可能是主进程和渲染进程通信的问题...
```

**记忆修正**（Phase 3）：

```
用户：你记错了，我现在改用 Vue 了
Agent：好的，已更新。（后续不再推荐 React 方案）
```

### 5.2 阶段演进体验

| 阶段 | 用户需要做什么 | 获得的能力 |
|:---:|:---:|:---:|
| Phase 1 | 在设置中填入 MemOS API Key | 跨会话记忆（偏好+事实），Cloud 存储 |
| Phase 2 | 无需额外操作（自动使用本地存储） | 完全本地化记忆，断网可用，数据不出本地 |
| Phase 3 | 可选：查看/管理记忆面板 | 矛盾检测、记忆重组、反馈修正、工作区隔离 |

### 5.3 开发者视角

- **零侵入**：不修改现有对话存储格式（JSONL）、不修改 Agent SDK 调用方式、不引入新 npm 依赖
- **接口稳定**：`memos-service.ts` 的对外接口在三个阶段中保持一致，只是后端实现切换
- **透明可控**：开发者模式下可查看注入的记忆上下文，所有操作有 `[MemOS]` 前缀日志
