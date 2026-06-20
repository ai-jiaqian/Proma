#!/usr/bin/env python3
"""为 Proma 工作区的任意开发项目初始化「开发记忆骨架」。

只创建缺失的文件，绝不覆盖已有内容。PROJECT.md 在每个 Proma 工作区都已存在，
本脚本不修改它，只提示是否缺少「开发工作流与纪律」常驻块（由 Agent 手动补）。

用法：
    python3 init_dev_context.py --root <工作区根>/workspace-files [--dry-run] [--project-name 名字]
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

TODAY = date.today().isoformat()

DISCIPLINE_MARKER = "## 开发工作流与纪律"


def dev_md(project: str) -> str:
    return f"""# dev.md — {project} 实时工作日志

> 跨会话的开发现状与待办。保持精简、滚动维护；详细过程进 devlogs/。
> 开发任务开始前先读这里，收尾前更新这里。

## 当前状态

- **当前线**：TODO
- **正在做 (Doing)**：TODO
- **活跃 devlog**：TODO（无则留空）
- **下一步**：TODO
- **最后更新**：{TODAY}

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
"""


def env_md(project: str) -> str:
    return f"""# env.md — {project} 环境参考

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
"""


def devlogs_readme() -> str:
    return """# devlogs/

重要开发事件的**详细过程记录**。一事件一文件：

```text
devlogs/YYYY-MM-DD-简述.md
```

长任务在开始时就建 devlog，不是做完才补。过程中每个有意义的阶段、失败的尝试、
验证过的事实、改变的方案、遇到的阻塞，都追加一条 checkpoint。

建议结构：

```markdown
# YYYY-MM-DD 任务标题

状态：进行中 | 阻塞 | 完成

## 背景 / 目标
## Checkpoints
## 关键结论
## 踩坑（短条目同步进 ../PITFALLS.md）
## 验证
## 交接 / 遗留
```

实时状态看 `../dev.md`；详细工作流见 `proma-dev-context` Skill。
"""


# 文件名 -> 内容生成器（PROJECT.md 不在此列，单独处理）
TEMPLATES = {
    "dev.md": lambda p: dev_md(p),
    "env.md": lambda p: env_md(p),
    "devlogs/README.md": lambda _p: devlogs_readme(),
    "notes/.gitkeep": lambda _p: "",
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        required=True,
        help="工作区的 workspace-files 目录（绝对路径）",
    )
    parser.add_argument("--project-name", default=None, help="项目名，用于模板标题")
    parser.add_argument("--dry-run", action="store_true", help="只打印动作，不写文件")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"目录不存在：{root}", file=sys.stderr)
        return 2

    project = args.project_name or root.parent.name
    print(f"workspace-files: {root}")
    print(f"项目名: {project}")

    for rel, render in TEMPLATES.items():
        dst = root / rel
        if dst.exists():
            print(f"skip  已存在 {rel}")
            continue
        print(f"{'would write' if args.dry_run else 'write'} {rel}")
        if not args.dry_run:
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(render(project), encoding="utf-8")

    # PROJECT.md：不创建、不覆盖，只检查纪律块是否存在
    project_md = root / "PROJECT.md"
    if not project_md.exists():
        print("note  workspace-files/PROJECT.md 不存在（异常）：请确认这是 Proma 工作区")
    elif DISCIPLINE_MARKER in project_md.read_text(encoding="utf-8"):
        print("ok    PROJECT.md 已含「开发工作流与纪律」块")
    else:
        print("TODO  PROJECT.md 缺「开发工作流与纪律」块 → 请按 Skill 模板手动补上（常驻入口的核心）")

    print("\n下一步：把 dev.md / env.md / PROJECT.md 里的 TODO 占位换成项目真实信息。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
