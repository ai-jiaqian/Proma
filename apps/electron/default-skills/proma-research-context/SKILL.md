---
name: proma-research-context
description: 通用「科研项目上下文 / 实验记忆」Skill，为 Proma 工作区里的科研项目初始化并维护一套清晰、可复现、结论可信的实验记忆，并随时把两条研究诚信纪律（实验运行纪律 + 主张与记忆纪律）带进上下文。触发要宽：开始或继续一个科研/实验项目、初始化或刷新科研骨架、要跑实验/冒烟测试/scale-up run、记录或检索实验结果、写实验记录(experiment_records)、整理实验结论、引用既往数字/结论、维护 exp.md 实验导航、判断某结论证据强度、想让 Agent「跑实验前知道该验证什么、引用结论前先核对原始记录」时，都应触发。任何论文/ML/Agent 实验类工作适用；与科研无关的纯软件开发用 proma-dev-context。
group: proma
version: "1.0.0"
---

# 科研项目上下文 / 实验记忆 (proma-research-context)

为 Proma 工作区里的**科研项目**铺一套实验记忆层，让结论**可复现、可追溯、可信**。两个目标：

1. **过程清晰**：项目目标、当前实验议程、详细实验记录、环境、踩坑，各就各位。
2. **结论可信**：把两条研究诚信纪律落到日常——产出结果时按实验运行纪律 gate，引用结果时按主张与记忆纪律核对。

> 这是一个**可复用工具**。Skill 保持通用；项目专属事实（服务器、数据集、baseline）写进各项目自己的 `PROJECT.md` / `env.md` / `exp.md`，不要写进本 Skill。

## 核心原则

1. **标准化记忆，不标准化项目。** 不强加实验框架结构。
2. **复用 Proma 工作区记忆，不另起炉灶。** 落到 `PROJECT.md` / `PITFALLS.md` / `notes/` 上，补科研专属的：`exp.md`、`env.md`、`experiment_records/`、`run-checklist.md`、`research-disciplines.md`。
3. **默认只写工作区，不动代码仓库。** 实验代码仓库通常已是 Python 包（`experiments/` 常被占用），且可能多人共享——所以记忆层住 `workspace-files/`，详细记录目录刻意叫 `experiment_records/` 避免和代码 `experiments/` 撞名。
4. **根文件是导航层，原始证据进 experiment_records / results / logs。**

## 两条纪律是这个 Skill 的核心资产

完整纪律是单一信源，放在本 Skill 的 `fragments/disciplines.md`，**原样保留、不要改写**：

- **Experiment Run Discipline（实验运行纪律）**：先说清这次 run 要*证明*什么；从项目初始就记**完整原始日志**（每个 stage 的 I/O、每次模型/API 调用清洗前的原始请求响应）；冒烟测试只有同时满足三条才算过——{① 干净跑通、② 在完整原始日志里读了**最难案例**的 I/O、③ 若想证明干预 X 有用就做 A/B 看效果**符号**}；大规模 run 也要设自检闸门自动中止；按成本 gate。
- **Claim & Memory Discipline（主张与记忆纪律）**：断言任何数字/结论前回到 `experiment_records/` 原始记录核对（导航文件和记忆索引只是**指针不是证据**）；每条量化结论标注证据强度（`[correlational]` vs `[causal]`、`[1-seed]` vs `[3-seed]`、`[prelim]` vs `[confirmed]`）；结论被推翻要**就地**标 ⚠️ SUPERSEDED 并链到新证据；相关 ≠ 因果。

跑实验或引用结果时，读 `fragments/disciplines.md` 全文。`run-checklist.md` 把第一条纪律变成每次 run 可勾选的闸门。

## 为什么 Agent「每次都会被提醒」

Proma 里**只有 `PROJECT.md` 每次会话自动注入**。所以把常驻提醒挂在 `PROJECT.md` 上：初始化时给它加一个精简「科研纪律（实验前必读）」指针块（两条纪律各一句 + 指向 `run-checklist.md` 和 `research-disciplines.md`）。完整纪律不塞进 PROJECT.md（会撑爆导航层），而是放工作区的 `research-disciplines.md`（由本 Skill 注入）和 Skill fragment 里。

```text
PROJECT.md（自动注入）
  └─ 科研纪律指针：实验前读 run-checklist.md / research-disciplines.md
       └─ 跑实验 → 按 run-checklist gate → 详细记录进 experiment_records/
            └─ 引用结论 → 回 experiment_records 核对 → 标注证据强度
```

## 文件骨架（全部在 `workspace-files/`）

| 文件 | 角色 |
|---|---|
| `PROJECT.md` | 常驻导航 + 科研纪律指针块（自动注入） |
| `exp.md` | 实验导航：当前议程 / 实验索引 / 稳定结论 / 参考 baseline |
| `env.md` | 实验环境：服务器、登录方式、数据/模型/结果/日志路径、GPU/调度约定 |
| `experiment_records/YYYY-MM-DD-简述.md` | 单个实验的详细记录（假设/设置/命令/证据/结论） |
| `run-checklist.md` | 每次 scale-up run 复制一份、逐项勾选的闸门 |
| `research-disciplines.md` | 两条纪律全文（由本 Skill 注入，受管，勿手改） |
| `PITFALLS.md` | 短踩坑（symptom→cause→fix），首次遇到才建 |
| `notes/` | 论文笔记 / 代码阅读 / 分析 / 里程碑报告 |

> `env.md` 不写明文密码 / API key / token。

## 初始化（首次给科研项目搭骨架）

1. **先看现状**：`Read` `workspace-files/PROJECT.md`，`ls` `workspace-files/`。
2. **预览脚本**（dry-run）：

   ```bash
   PYTHONDONTWRITEBYTECODE=1 python3 <skill目录>/scripts/init_research_context.py --root <工作区根>/workspace-files --dry-run
   ```

3. **执行**（去掉 `--dry-run`）：脚本创建缺失的 `exp.md` / `env.md` / `run-checklist.md` / `experiment_records/README.md` / `notes/`，并把 `fragments/disciplines.md` 注入为 `research-disciplines.md`（带版本号）。只补缺失、不覆盖已有。
4. **补 PROJECT.md 指针块**：脚本不改 PROJECT.md。手动确保它有 `## 科研纪律（实验前必读）` 块（模板见下），放在「关键约定与决策」之后。
5. **填真实信息**：把 `exp.md` / `env.md` 的 `TODO` 换成项目实际（目标、议程、服务器、数据/模型路径）。
6. **检查日志插桩**（重要）：按实验运行纪律，确认实验代码从第一天就记**完整原始日志**（每个 stage I/O + 每次模型/API 调用清洗前的原始请求响应），而不是只存后处理产物。没有就先补插桩——日志没法事后补。
7. 报告建了/改了哪些文件。

## 刷新（纪律改进后）

```bash
python3 <skill目录>/scripts/init_research_context.py --root <工作区根>/workspace-files --refresh
```

`--refresh` 只在 `fragments/disciplines.md` 版本号更新时，重写工作区的 `research-disciplines.md`，并补齐新增模板文件；不碰你的项目内容。

## 每次实验工作的纪律（该做）

- **跑 scale-up run 前**：复制 `run-checklist.md` 一个 Run 块，写清「这次要证明什么」，逐项过 Gate 0–3 + 成本 gate。未勾的框就是发现，别为了"通过"删掉它。
- **实验过程**：详细记录进 `experiment_records/YYYY-MM-DD-简述.md`（假设/设置/命令/config/seed/结果路径/观察/结论）。
- **更新导航**：实验改变了理解或计划时，才在 `exp.md` 加一条短索引 + 关键结论；别把整个实验粘进 `exp.md`。
- **引用既往结果前**：回 `experiment_records/` 原始记录核对，标注证据强度；结论被推翻就地标 SUPERSEDED。
- **踩坑**：丢过时间的失败模式记进 `PITFALLS.md`（symptom→cause→fix），若该改变以后怎么跑，反映到 `run-checklist.md`，必要时改 `fragments/disciplines.md` 并 `--refresh`。

## 不该做

- 默认不往实验代码仓库写这些记忆文件。
- 不编造实验结果/数字/结论；没证据就说没验证、指出要跑什么。
- `PROJECT.md` / `exp.md` 不堆原始日志和完整结果表（那是导航层）。
- 不在 `env.md` 写明文密钥。
- 不改写 `research-disciplines.md`（受管文件，要改去 Skill 的 fragment 再 `--refresh`）。

---

## PROJECT.md 指针块模板

> 初始化时补进 `workspace-files/PROJECT.md`。常驻入口，每次会话自动注入。

```markdown
## 科研纪律（实验前必读）

- **跑实验/scale-up run 前**：复制 `workspace-files/run-checklist.md` 逐项 gate；完整纪律见 `workspace-files/research-disciplines.md`。
- **实验运行纪律**：先说清要证明什么；从第一天记完整原始日志；冒烟只有 {跑通 + 读最难案例原始 I/O + 干预做 A/B 看符号} 全满足才算过；大规模 run 设自检闸门；按成本 gate。
- **主张与记忆纪律**：断言数字/结论前回 `experiment_records/` 核对（导航/索引只是指针不是证据）；量化结论标证据强度；结论被推翻就地标 SUPERSEDED；相关≠因果。
- 详细工作流见 `proma-research-context` Skill。
```

## exp.md 模板

```markdown
# exp.md — [项目名] 实验导航

> 实验导航层：当前议程、实验记录索引、稳定结论。不是完整实验簿，原始日志/结果表进 experiment_records/。

## 当前实验议程
- TODO

## 实验索引
> 格式：`experiment_records/YYYY-MM-DD-简述.md` — 一句话目的 + 结论
- （暂无）

## 当前稳定结论
- TODO（每条标证据强度：[correlational]/[causal]、[1-seed]/[3-seed]、[prelim]/[confirmed]）

## 参考 baseline / 已失效结果
- TODO
```

## env.md 模板

```markdown
# env.md — [项目名] 实验环境

> 私有实验环境参考。不写明文密码 / API key / token。

## 服务器 / 算力
- 机器 / SSH 别名 / 跳板：TODO
- GPU / 调度 / 容器：TODO

## 路径
- 项目/工作区路径：TODO
- 数据集 / 模型 / 缓存 / 结果 / 日志：TODO

## 运行约定
- 环境激活 / 启动命令：TODO
- 关键 config / 端点：TODO

## 环境坑
- TODO：症状 / 原因 / 修复
```

## Guardrails

- 复用已有项目上下文，不造重复文件。
- 追加而非覆盖，保留历史，除非用户要求清理。
- 不编造结果、结论、指标；未验证的标 `待验证` 或 `[prelim]`。
- 默认不把生成的科研上下文提交进代码库，除非用户明确要求。
