# Proma 工作区记忆设计（PROJECT.md + 内容路由）

- 日期：2026-06-19
- 状态：设计已与用户对齐，待写实现计划
- 关联代码：`agent-prompt-builder.ts`、`agent-orchestrator.ts`、`agent-workspace-manager.ts`、`config-paths.ts`

## 1. 背景与问题

当前 Proma Agent 在"产出落到哪个文件"上体验很差，根因在系统提示词层（非 bug）：

1. **会话 vs 工作区的判断标准模糊**。提示词要求 Agent 凭"只与当前任务相关 vs 跨会话有参考价值"做对称的主观预判（`agent-prompt-builder.ts:338-341`），写文件当下无法可靠判断，行为漂移。
2. **提示词自相矛盾**。抽象原则说调研报告该进工作区级，但最具体可执行的"典型工作流第 3 步"和"决策表"里写的都是**裸路径** `.context/note.md`（`agent-prompt-builder.ts:213 / :271 / :450`）。裸 `.context/` 永远解析到 cwd（会话级），于是几乎所有调研都落到会话级 `note.md`。
3. **单文件聚合**。`note.md` 被设计成"带日期条目、追加在顶部"的单一文件（`:432`），多个不相关研究话题全挤进同一个文件。
4. **缺少"项目级必读文件"**。提示词让 Agent 维护 `CLAUDE.md`（`:418`），但它指向的是 **cwd = 每会话独立的临时目录** `agent-workspaces/{slug}/{sessionId}/`（`agent-orchestrator.ts:1166`）。后果：① 不跨会话（会话 A 写的，会话 B 看不到）；② 靠提示词"让 Agent 自己记得去读"（`:472`），不是硬注入，经常漏读。工作区级目录 `workspace-files/` 虽通过 `additionalDirectories` 暴露（可读写），但没有一个每次会话开始保证被读到的项目文件。

## 2. 借鉴来源

借鉴用户自建并验证有效的两个 skill（`dev-context-log`、`research-project-context-init`）的核心理念：

- **标准化记忆，不标准化项目**：根文件是导航/索引层，详细证据放到按主题、带日期的独立文件。
- **入口文件承载规则 + Required Reading Order**：让未来的 Agent 真正读到规则。
- **按内容类型路由**，取代"会话 vs 项目"的模糊二分。
- **每个文件都有 "Use it for / Do NOT use it for"**，边界写死。
- **护栏**：append 不覆盖、绝不编造、未验证标 `待验证`、根文件保持精炼、链接而非复制、用 SubAgent 时导航文件只由主 Agent 维护。

Proma 的关键适配：用**编排层强制注入**替代原版"靠 entrypoint 自动加载"的机制（更可靠，且 Proma 的 cwd 是临时会话目录，自动加载不可行）；并按 Proma 的**通用受众**把 scaffold 砍到极简。

## 3. 已确认决策

| # | 决策点 | 选定方案 |
|---|--------|----------|
| 1 | 必读机制 | **编排层强制注入**：每次会话开始把 `PROJECT.md` 内容注入上下文，100% 被读到 |
| 2 | 维护方 | **Agent 自动维护 + 用户可改**，且必须保持精炼防膨胀 |
| 3 | 调研组织 | **不固定文件夹 schema**；废掉"默认写 note.md"；一次独立调研 = 一个语义化命名、带日期的独立文件；`PROJECT.md` 维护轻量索引 |
| 4 | 默认归属 | **默认项目级**；会话级是一个封闭的异常清单 |
| 5 | scaffold 重量 | **极简起步 + 按需生长** |
| 6 | 命名 | 项目必读文件命名为 **`PROJECT.md`** |
| 7 | 初始化 | **默认初始化**：新建工作区自动生成 `PROJECT.md` 模板；老工作区缺失时补建 |

## 4. 文件布局（极简默认）

### 工作区级 `~/.proma/agent-workspaces/{slug}/workspace-files/`（`getWorkspaceFilesDir(slug)`）

- `PROJECT.md` —— 唯一**默认存在、强制注入**的项目必读文件。Agent 维护 + 用户可改，保持精炼（建议 < 200 行）。
- 其余文件**按需生长，不预建**。约定（建议命名，非强制死目录）：
  - 调研 / 分析 / 方案对比 / 报告 / 决策 → `notes/YYYY-MM-DD-主题.md`（一主题一文件，语义化命名）
  - 短踩坑 → `PITFALLS.md`（symptom → cause → fix 索引，首次遇到才建）
  - 详细调试 / 排查路径 → `devlogs/YYYY-MM-DD-事件.md`（可选，重度场景才用）
- 所有详细文件**从 `PROJECT.md` 的"知识索引"区链接** —— 这是防"全堆一处"、保证事后可发现的关键。

### 会话级 `~/.proma/agent-workspaces/{slug}/{sessionId}/`（cwd）

- 只放"仅本次任务"的临时草稿、进度 todo、计划模式 plan 草稿。
- 任务结束即弃，不跨会话。这是**唯一**的临时归宿。

> 说明：`notes/` `devlogs/` 是建议命名，Agent 可按内容合理安置；约束的是"一主题一文件 + 带日期 + 进索引"的原则，而非死目录结构。

## 5. PROJECT.md 模板与维护规则

默认模板（导航层）包含：

- **项目目标 / 当前阶段**
- **关键约定与持久决策**
- **踩坑要点**（高频要点；详细的链到 `PITFALLS.md` / devlog）
- **知识索引**：链接到各 `notes/` 调研文件（防"全堆一处"）
- 内嵌 **Use it for / Do NOT use it for**：不写流水账、不贴长正文、不放一次性调试过程
- 内嵌 **Update Policy**：只在项目方向 / 阶段 / 持久决策 / 新增重要文档时更新

模板带占位提示（如"暂无 / 待补充"），新建空工作区时即为静态模板；Agent 在后续工作中逐步填充与维护。

## 6. 强制注入机制（orchestrator）

- 读盘与注入**统一在 `buildDynamicContext()` 内完成**（`agent-prompt-builder.ts:498`，已是每条消息实时读盘、注入 `<workspace_state>` / `<working_directory>` 的地方）：它已持有 `workspaceSlug`，据此 `getWorkspaceFilesDir(slug)` 拼出 `PROJECT.md` 路径，读取后作为独立上下文块（如 `<project_memory>...</project_memory>`）注入。保证内容变更后下一条消息即可感知。
- orchestrator 侧无新增读盘逻辑，只需确认 `workspaceSlug` 已传入 `buildDynamicContext`（现状已传）。
- 文件存在 → 注入其内容；不存在 → 因决策 7 默认会初始化，正常不会发生；作为兜底仍注入一句引导（"本工作区暂无项目记忆，产生持久知识时请创建并维护 `workspace-files/PROJECT.md`"）。
- 这替代当前躺在临时 cwd、靠自觉去读的 `CLAUDE.md` 项目知识用途。

## 7. 系统提示词改造（agent-prompt-builder）

**删除：**
- "典型工作流第 3 步"中的裸 `.context/note.md`（`:213` / `:271`）
- "文档输出与知识管理"决策表里"技术调研、方案对比、代码分析 → 输出到 .context/note.md"（`:450`）等"默认写 note.md"指令
- "## 工作区 / .context 目录层级"中对称模糊的会话 vs 工作区判断（`:332-342`）

**加入：**
- **内容路由表**（按类型路由，取代二分）：

  | 内容类型 | 归宿 |
  |---------|------|
  | 项目方向 / 持久决策 / 约定 | `PROJECT.md`（注入必读） |
  | 调研 / 分析 / 方案对比 / 报告 / 详细决策 | `notes/YYYY-MM-DD-主题.md`，并在 `PROJECT.md` 索引登记 |
  | 短踩坑（symptom→cause→fix） | `PITFALLS.md` |
  | 详细调试 / 排查路径 | `devlogs/YYYY-MM-DD-事件.md` |
  | 仅本次任务的临时草稿 / 进度 todo / plan 草稿 | 会话级 cwd（唯一临时归宿） |

- **强默认规则**：默认一律写项目级；会话级只命中上表最后一行那个封闭异常。心法："关掉会话、过一周还想找回来吗？会→项目级，不会→会话级"。
- **产出组织原则**：一主题一文件、带日期、语义化命名、从 `PROJECT.md` 索引链接；不再 append 到单一 `note.md`。
- **护栏**：append 不覆盖、不编造、未验证标 `待验证`、根文件精炼、链接非复制、SubAgent 调研结果由主 Agent 整理后写入并更新索引。
- `note.md` 从"默认垃圾桶"降级为会话级临时随手记的可选项，不再是调研默认归宿。

## 8. 初始化与老工作区迁移

- **新建工作区**：在创建流程（`agent-workspace-manager.ts`）中，于 `getWorkspaceFilesDir(slug)` 下写入 `PROJECT.md` 模板（仅当不存在时）。
- **老工作区补建**：参照现有 `upgradeDefaultSkillsInWorkspaces()`（`agent-workspace-manager.ts:322`）的"遍历工作区 + 缺失即注入"模式，增加一个 seed-if-missing 步骤，给所有已存在工作区补 `PROJECT.md`。**只在缺失时写，绝不覆盖用户已有内容。**
- 模板文本作为 bundle 资源随包分发（沿用 default-skills 的分发思路）。

## 9. 不做什么（YAGNI）

- 不预建研究/开发那套 7 文件全套（project/dev/env/context/{docs,pitfalls,decisions,notes,reports}/devlogs）。
- 不固定目录 schema（`notes/` `devlogs/` 仅为建议命名）。
- 不引入 Proma 通用受众用不上的 `dev.md` / `env.md`（真有重度需求可后续按工作区类型扩展）。
- 不做 stop-hook 式强制（Proma 是产品，靠强制注入 + 提示词路由 + 任务完成标准即可）。

## 10. 受影响文件清单

| 文件 | 改动 |
|------|------|
| `apps/electron/src/main/lib/agent-prompt-builder.ts` | 删旧 note.md 指令；改写"工作区/文档输出"段为路由表 + 强默认 + 护栏；`buildDynamicContext` 内读盘并注入 `<project_memory>` |
| `apps/electron/src/main/lib/agent-orchestrator.ts` | 无新增读盘逻辑，确认 `workspaceSlug` 已传入 `buildDynamicContext`（现状已传） |
| `apps/electron/src/main/lib/agent-workspace-manager.ts` | 新建工作区 seed `PROJECT.md`；新增老工作区 seed-if-missing |
| `apps/electron/src/main/lib/config-paths.ts` | （可选）新增 `getWorkspaceProjectFilePath(slug)` 辅助函数 |
| bundle 资源 | 新增 `PROJECT.md` 模板文件 |

## 11. 验收标准（BDD）

- **场景：新建工作区**
  - 假设 用户新建一个 Agent 工作区
  - 那么 `workspace-files/PROJECT.md` 被自动创建，且含模板章节（目标/阶段/约定决策/知识索引/Use-it-for/Update Policy）
- **场景：老工作区补建**
  - 假设 一个已存在、无 `PROJECT.md` 的工作区
  - 当 应用启动或进入该工作区
  - 那么 `PROJECT.md` 被补建；已存在的 `PROJECT.md` 不被覆盖
- **场景：每次会话开始必读**
  - 假设 工作区存在 `PROJECT.md`
  - 当 该工作区任一会话发起请求
  - 那么 `PROJECT.md` 内容出现在 Agent 的上下文中（强制注入，无需 Agent 主动读）
- **场景：调研产出不再堆进 note.md**
  - 当 Agent 完成一次技术调研
  - 那么 产出写入 `notes/YYYY-MM-DD-主题.md` 独立文件，且 `PROJECT.md` 索引区追加一条链接；不写入单一 `note.md`
- **场景：临时草稿留在会话级**
  - 当 Agent 产生仅本次任务的进度 todo
  - 那么 写入会话级 cwd，不进工作区级
- **场景：提示词清理**
  - 那么 系统提示词中不再出现"默认写 `.context/note.md`"类指令，改为内容路由表

## 12. 开放问题

- `<project_memory>` 注入是否设上限（如超过 N 行时截断并提示 Agent 精简）？倾向：先不截断，靠"保持精炼"的提示词约束 + Update Policy；观察后再定。
- `notes/` 等详细文件是否需要在文件浏览器侧栏有专门分组展示？属后续 UI 增强，不阻塞本设计。
