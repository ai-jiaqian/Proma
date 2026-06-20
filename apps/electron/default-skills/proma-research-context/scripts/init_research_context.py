#!/usr/bin/env python3
"""为 Proma 工作区的科研项目初始化（或刷新）「实验记忆骨架」。

自包含：脚本读取同一 skill 目录下的 ../fragments/disciplines.md，把骨架写进
--root 指定的 workspace-files 目录。只创建缺失文件，绝不覆盖已有内容。

init（默认）：创建 exp.md / env.md / run-checklist.md / experiment_records/README.md /
              notes/，并把纪律全文注入为 research-disciplines.md（带版本号）。
--refresh   ：仅当 fragment 版本号更新时重写 research-disciplines.md，并补齐缺失的
              模板文件；不碰已有项目内容。PROJECT.md 永不修改（由 Agent 手动补指针块）。

用法：
    python3 init_research_context.py --root <工作区根>/workspace-files [--dry-run] [--refresh] [--project-name 名字]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
DISCIPLINES_FRAGMENT = SKILL_DIR / "fragments" / "disciplines.md"

FRAGMENT_VERSION_RE = re.compile(r"disciplines-version:\s*(\d+)")
MANAGED_VERSION_RE = re.compile(r"research-disciplines-version:\s*(\d+)")
LEADING_COMMENTS_RE = re.compile(r"\A(?:\s*<!--.*?-->\s*)+", re.DOTALL)


def load_disciplines() -> tuple[int, str]:
    raw = DISCIPLINES_FRAGMENT.read_text(encoding="utf-8")
    m = FRAGMENT_VERSION_RE.search(raw)
    version = int(m.group(1)) if m else 1
    body = LEADING_COMMENTS_RE.sub("", raw).strip()
    return version, body


def render_disciplines_file(version: int, body: str) -> str:
    return (
        f"<!-- research-disciplines-version: {version} -->\n"
        "<!-- 受管文件：由 proma-research-context Skill 的 fragments/disciplines.md 注入。\n"
        "     不要在这里改；要改去 Skill 的 fragment 改正文并 +1 版本号，再 --refresh。 -->\n\n"
        "# 研究诚信纪律（两条）\n\n"
        "> 产出结果时按第一条 gate，引用结果时按第二条核对。run-checklist.md 把第一条变成每次 run 的可勾选闸门。\n\n"
        f"{body}\n"
    )


def exp_md(project: str) -> str:
    return f"""# exp.md — {project} 实验导航

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
"""


def env_md(project: str) -> str:
    return f"""# env.md — {project} 实验环境

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
"""


def run_checklist() -> str:
    return """# Run Checklist

把 **实验运行纪律** 变成每次 scale-up run 都用得上的闸门（完整纪律见 research-disciplines.md）。
每次 run 复制下面一块、逐项勾选。别为了"通过"删掉没勾的框——没勾的框就是发现。

---

## Run: <YYYY-MM-DD 简述>

**这次 run 要证明什么（一句话）：**
> ...

### Gate 0 — 日志插桩到位（项目初始就该有，这里确认）
- [ ] 每个 stage 的输入/输出都持久化了。
- [ ] 每次模型/API 调用的**原始**请求和响应都记了（在任何清洗/解析/sanitize 之前）。
- [ ] 实际喂给每个组件的完整拼接输入记了。

### Gate 1 — 干净跑通
- [ ] 真实管线小规模（几条/几步）跑通，同一 code/config/endpoint，无报错。
- [ ] 确认 endpoint 真的在服务请求的 model/version/dataset。
- [ ] config 字段确认**已生效**于产出（写在配置里不等于生效）。

### Gate 2 — I/O 在完整日志里符合预期
- [ ] 打开了**最难/最长**案例的完整记录（不是抽样、不是摘要、不是 `--limit` 取的简单前缀）。
- [ ] 以**原始**（清洗前）形式读过；无泄漏推理、重复/畸形调用、截断、垃圾填充的 prompt。

### Gate 3 — 效果方向（仅当这次 run 要证明 X 有用）
- [ ] 同一批样本 X 开 vs X 关做了 A/B。
- [ ] 看了效果的**符号**（不是"X 跑了且指标看起来正常"）。

### 成本投影（要 gate）
- 单位成本：___ wall-time / ___ tokens / ___ $
- 整跑（`单位 × N`，N = ___）：___
- [ ] 在数量级预期内（10× 差距是红旗 —— STOP）。

### 大规模 run 闸门（冒烟测不出的 scale-emergent 失败）
- [ ] 真实 run 在机制首次生效处（检索/记忆/累积起作用）自检，相对 baseline 回退则自动中止。

### 首批结果落地后
- [ ] 真实结果出来后重新核对以上。
- [ ] 泛化结论用留出测试集（优先官方 split）。
- [ ] 发现的失败模式记进 PITFALLS.md。
"""


def experiment_records_readme() -> str:
    return """# experiment_records/

单个重要实验的**详细记录**。根 `exp.md` 只是索引和结论指引。

文件名：`YYYY-MM-DD-简述.md`（如 `2026-06-08-clean-baseline.md`）。

> 目录刻意叫 experiment_records/ 而非 experiments/，避免和实验代码的 Python 包重名。

## 建议模板

```markdown
# 实验：标题
日期：YYYY-MM-DD
状态：planned | running | completed | invalidated

## 问题 / 假设
## 设置（benchmark / split / 代码版本 / config / model / seed）
## 命令
## 证据（结果路径 / 日志 / 产物）
## 指标
## 观察
## 结论（未来工作该相信什么；标证据强度）
## 后续
```

## 更新规则
实验产出稳定结论后，在 `exp.md` 加一条短索引 + 关键结论；别把整个实验粘进 exp.md。
"""


# (相对路径, 生成器)。research-disciplines.md 单独处理（受版本控制）。
TEMPLATES = [
    ("exp.md", lambda p: exp_md(p)),
    ("env.md", lambda p: env_md(p)),
    ("run-checklist.md", lambda _p: run_checklist()),
    ("experiment_records/README.md", lambda _p: experiment_records_readme()),
    ("notes/.gitkeep", lambda _p: ""),
]


def existing_managed_version(path: Path) -> int | None:
    if not path.exists():
        return None
    m = MANAGED_VERSION_RE.search(path.read_text(encoding="utf-8"))
    return int(m.group(1)) if m else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, help="工作区的 workspace-files 目录（绝对路径）")
    parser.add_argument("--project-name", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--refresh", action="store_true", help="仅刷新受管纪律文件 + 补缺失模板")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"目录不存在：{root}", file=sys.stderr)
        return 2
    if not DISCIPLINES_FRAGMENT.exists():
        print(f"找不到纪律 fragment：{DISCIPLINES_FRAGMENT}", file=sys.stderr)
        return 2

    project = args.project_name or root.parent.name
    version, body = load_disciplines()
    print(f"workspace-files: {root}")
    print(f"项目名: {project} | 纪律版本: v{version} | 模式: {'refresh' if args.refresh else 'init'}")

    # 模板文件：只补缺失
    for rel, render in TEMPLATES:
        dst = root / rel
        if dst.exists():
            print(f"skip  已存在 {rel}")
            continue
        print(f"{'would write' if args.dry_run else 'write'} {rel}")
        if not args.dry_run:
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(render(project), encoding="utf-8")

    # 受管纪律文件：按版本号
    disc = root / "research-disciplines.md"
    cur = existing_managed_version(disc)
    if cur is None:
        print(f"{'would write' if args.dry_run else 'write'} research-disciplines.md (v{version})")
        if not args.dry_run:
            disc.write_text(render_disciplines_file(version, body), encoding="utf-8")
    elif version > cur:
        print(f"{'would refresh' if args.dry_run else 'refresh'} research-disciplines.md (v{cur} -> v{version})")
        if not args.dry_run:
            disc.write_text(render_disciplines_file(version, body), encoding="utf-8")
    else:
        print(f"ok    research-disciplines.md 已是 v{cur}（无需刷新）")

    # PROJECT.md：不创建、不覆盖，只检查指针块
    project_md = root / "PROJECT.md"
    if not project_md.exists():
        print("note  workspace-files/PROJECT.md 不存在（异常）：请确认这是 Proma 工作区")
    elif "## 科研纪律" in project_md.read_text(encoding="utf-8"):
        print("ok    PROJECT.md 已含「科研纪律」指针块")
    else:
        print("TODO  PROJECT.md 缺「科研纪律（实验前必读）」指针块 → 请按 Skill 模板手动补上")

    if not args.refresh:
        print("\n下一步：填 exp.md / env.md 真实信息；确认实验代码从第一天记完整原始日志。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
