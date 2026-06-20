---
name: proma-dev-context
description: 通用「开发上下文 / 项目骨架」Skill，为 Proma 工作区里的任意开发项目初始化并持续维护一套清晰、可接手的开发记忆，确保开发全程都清楚——目标是什么、现在做到哪、这次该做什么、什么不该碰、产出该放哪。触发要宽：开始一个新的开发项目、想给当前项目搭/刷新骨架、初始化开发上下文、记开发日志(devlog)、给长任务打 checkpoint、收尾交接、想让 Proma Agent「每次都知道该做什么不该做什么」、刚进会话想快速搞清开发到哪了、把零散进展归位到正确文件时，都应触发。不限定具体项目，任何软件/交付类开发任务都适用。一次性纯问答、与开发无关的任务不必触发。
group: proma
version: "2.0.0"
---

# 开发上下文 / 项目骨架 (proma-dev-context)

为 Proma 工作区里的**任意开发项目**铺一套轻量「开发记忆层」，让人和 Agent 都能快速看懂开发流：当前状态、怎么走到这一步、关键决策、踩过的坑、环境事实、重要文档在哪、怎么接手。

**目标**：每次会话，Agent 一上来就知道——项目目标是什么、现在做到哪了、这次该做什么、什么不该碰、产出该放哪。

> 这是一个**可复用的工具**。Skill 本身保持通用；项目专属的事实（仓库路径、远程关系、技术选型、同步策略等）写进各项目自己的 `PROJECT.md`，不要写进本 Skill。

## 核心原则

1. **标准化记忆，不标准化项目。** 不强加 API / 架构 / 部署 / 任务模板。只在项目已经在用、或用户明确要求时才动那些结构。
2. **复用 Proma 工作区记忆，不另起炉灶。** 落到 Proma 已有约定上（`PROJECT.md` / `PITFALLS.md` / `devlogs/` / `notes/`），只补两层 Proma 默认缺的：跨会话工作日志 `dev.md` 和环境参考 `env.md`。
3. **默认只写工作区，不动代码仓库。** 代码仓库可能已有自己的入口文档（`AGENTS.md` / `CLAUDE.md`）、可能是只读 / fork / 会同步上游——往里塞追踪文件会打架、制造合并噪音，仓库目录还可能不可用（如外接盘）。所有开发上下文默认写在 `workspace-files/`，除非用户明确要把它沉淀进代码库。
4. **根文件是导航层，详细证据进 devlog / notes。**

## 为什么这套骨架能让 Agent「每次都知道该做什么」

Proma 里**只有 `PROJECT.md` 每次会话会被自动注入上下文**（Skill 本身、`dev.md`、`env.md` 都不会自动加载）。所以常驻指引必须挂在 `PROJECT.md` 上：

```text
PROJECT.md（每次自动注入）
  └─ 写着「开发纪律」+「开发任务开始前先读 workspace-files/dev.md」
       └─ Agent 读 dev.md → 知道当前线 / Doing / 下一步
            └─ 按纪律干活，过程写 devlog
                 └─ 收尾更新 dev.md（必要时 PROJECT.md / PITFALLS.md / notes/）
```

`PROJECT.md` 是常驻入口（精简、导航层），`dev.md` 是会变的实时工作日志（跨会话）。分工：方向 / 长期决策进 `PROJECT.md`，在途任务状态进 `dev.md`。

## 文件骨架（全部在 `workspace-files/`）

| 文件 | 角色 | 注入方式 |
|---|---|---|
| `PROJECT.md` | 常驻导航 + 开发纪律（每个 Proma 工作区已自动存在） | **每次自动注入** |
| `dev.md` | 实时工作日志：当前线 / TODO / Doing / Done / Blocked / 下一步 | 任务开始时手动读（PROJECT.md 指示） |
| `env.md` | 环境参考：本地/远程机器、依赖版本、setup/start/test/build/deploy 命令、端口、路径、环境坑 | 按需读 |
| `devlogs/YYYY-MM-DD-简述.md` | 重要开发事件的详细过程记录 | 按需读 |
| `PITFALLS.md` | 短踩坑（symptom→cause→fix），首次遇到才建 | 按需读 |
| `notes/YYYY-MM-DD-主题.md` | 调研 / 分析 / 方案对比 | 按需读，在 PROJECT.md 知识索引登记 |

> `env.md` 不写明文密码 / API key / token / 客户机密。
> 路径提醒：`workspace-files/` 是工作区根目录下的子目录，写入用绝对路径 `<工作区根>/workspace-files/...`，别落到会话 cwd。

## 初始化（首次给某项目搭骨架时）

可以用脚本一键铺，也可以手动建。脚本只创建缺失的文件，绝不覆盖已有内容。

1. **先看现状**：`Read` `workspace-files/PROJECT.md`，并 `ls` `workspace-files/`，了解已有什么。
2. **预览脚本动作**（dry-run，把 `<工作区根>` 换成实际绝对路径）：

   ```bash
   PYTHONDONTWRITEBYTECODE=1 python3 <skill目录>/scripts/init_dev_context.py --root <工作区根>/workspace-files --dry-run
   ```

3. **确认无误后实际执行**（去掉 `--dry-run`）。脚本会创建缺失的 `dev.md` / `env.md` / `devlogs/README.md` / `notes/`，并对 `PROJECT.md` 给出提示（见下条）。
4. **补 PROJECT.md 纪律块**：`PROJECT.md` 在每个 Proma 工作区都已存在，脚本不会改它。手动确保它有 **`## 开发工作流与纪律（每次开发前必读）`** 这一块（按下方模板，放在「关键约定与决策」之后、「知识索引」之前）。这是常驻入口的核心。
5. **填项目实际信息**：把 `dev.md` / `env.md` / `PROJECT.md` 里的 `TODO` 占位换成项目真实状态（目标、当前线、命令、路径等）。
6. 向用户报告建了 / 改了哪些文件。

不用脚本时，按上表手动 `Write` 对应文件即可，逻辑相同：只补缺失、不覆盖已有。

## 每次开发任务的纪律（该做）

- **开始**：读 `dev.md` → 在 `Doing` 登记本次任务（一句话 + 开始时间）。多步 / 长任务 / 可能跨会话的，立即在 `devlogs/` 建活跃 devlog（任务开始就建，不是做完才补）。
- **过程**：每个有意义的阶段、失败的尝试、验证过的事实、改变的方案、遇到的阻塞，往活跃 devlog 追加一条 checkpoint。
- **路由**（产出归位）：
  - 项目方向 / 长期决策 → `PROJECT.md`（精炼登记）
  - 在途任务状态 / 下一步 → `dev.md`
  - 命令 / 端口 / 路径 / 版本 / 环境坑 → `env.md`
  - 短踩坑 → `PITFALLS.md`
  - 调研 / 分析 / 方案 → `notes/YYYY-MM-DD-主题.md`，并在 `PROJECT.md` 知识索引登记链接
  - 详细过程证据 → `devlogs/`
- **收尾 / 交接**：更新 `dev.md`（`Doing` → `Done` 或 `Blocked`，写清下一步）；给活跃 devlog 收尾（状态、产出、验证、遗留）；**只有项目方向变了**才动 `PROJECT.md`。

## 不该做

- 默认不往代码仓库写这些追踪文件（除非用户明确要沉淀进代码库并接受其入口文档约定）。
- `PROJECT.md` 不堆流水账（保持 < 200 行、导航层）；流水和实时状态进 `dev.md`。
- 不编造进度 / 决策 / 验证结果；不确定的标 `待验证`。
- 不在 `env.md` 写明文密钥 / 密码 / token。
- 不堆黑话——术语当场用大白话解释。

## 刷新 / 同步（后续每次调用）

- `Read` `dev.md` + `PROJECT.md`，对照实际进度更新状态、清掉已完成 / 过时条目（滚动维护，别让 dev.md 无限膨胀）。
- 检查 `devlogs/` 有没有该收尾的活跃记录。
- 若 `PROJECT.md` 与现状不符（方向 / 阶段 / 决策变了），更新导航；只补不删历史，除非用户要求清理。

---

## PROJECT.md 纪律块模板

> 初始化时补进 `workspace-files/PROJECT.md`。这是常驻入口，每次会话自动注入。方括号内按项目替换。

```markdown
## 开发工作流与纪律（每次开发前必读）

- **开始开发任务前**：先读 `workspace-files/dev.md`，搞清当前在做什么、下一步是什么。
- **该做**：在 dev.md 的 Doing 登记任务；多步/长任务建 `devlogs/YYYY-MM-DD-简述.md` 并随进度 checkpoint；产出按归宿路由（方向→PROJECT.md，状态→dev.md，命令/路径→env.md，踩坑→PITFALLS.md，调研→notes/，过程→devlogs/）；收尾更新 dev.md 与 devlog。
- **不该做**：[项目专属红线，如：不往某代码仓库写追踪文件 / 不自动 push 某分支]；PROJECT.md 不堆流水账；不编造结论。
- 详细工作流见 `proma-dev-context` Skill。
```

## dev.md 模板

```markdown
# dev.md — [项目名] 实时工作日志

> 跨会话的开发现状与待办。保持精简、滚动维护；详细过程进 devlogs/。
> 开发任务开始前先读这里，收尾前更新这里。

## 当前状态

- **当前线**：TODO
- **正在做 (Doing)**：TODO
- **活跃 devlog**：TODO（无则留空）
- **下一步**：TODO
- **最后更新**：YYYY-MM-DD

## 任务板

### TODO
- [ ] TODO

### Doing
- [ ] TODO（负责人 / 开始时间）

### Done
- [ ] TODO

### Blocked
- TODO（卡在哪、需要什么）

## 最近开发记录
- 链接到 devlogs/ 下的重要记录
```

## env.md 模板

```markdown
# env.md — [项目名] 环境参考

> 私有开发环境参考。不写明文密码 / API key / token / 客户机密。

## 项目路径
- 代码根目录：TODO
- 本地/远程机器：TODO

## 命令
- Setup：TODO
- Start：TODO
- Test：TODO
- Build：TODO
- Deploy/打包：TODO

## 运行时
- 端口：TODO
- 环境变量：TODO
- 数据/模型/日志/缓存路径：TODO

## 环境坑
- TODO：症状 / 原因 / 修复 / 恢复命令
```

## Guardrails

- 复用已有项目上下文，不造重复文件。
- 追加而非覆盖，保留历史，除非用户要求清理。
- 不编造进度、决策、测试结果或环境事实；未验证的标 `待验证`。
- 不强加 `docs/api`、`architecture.md` 之类目录。
- 默认不把生成的个人开发上下文提交进代码库，除非用户明确要求或项目已把这些文件当共享产物。
