/**
 * 工作区项目记忆文件（PROJECT.md）
 *
 * 每个工作区根下 workspace-files/PROJECT.md 是"项目必读文件"：
 * 新建工作区时自动 seed，每次会话开始由 buildDynamicContext 强制注入上下文。
 * 本模块只含模板常量与纯函数，便于单元测试与复用。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getWorkspaceFilesDir, resolveWorkspaceFilesDir } from './config-paths'

/** 项目必读文件名 */
export const PROJECT_FILE_NAME = 'PROJECT.md'

/** 新建工作区时写入的 PROJECT.md 模板（导航层，保持精炼） */
export const PROJECT_TEMPLATE = `# 项目记忆 (PROJECT.md)

> 这是本工作区的「项目必读文件」，每次会话开始会被自动注入到 Agent 上下文。
> 它是**导航层**：保持精炼（建议 < 200 行）。详细产出请放到独立文件并在下方「知识索引」登记。
>
> **Use it for**：项目目标与阶段、长期约定与决策、关键踩坑要点、指向详细文档的索引。
> **Do NOT use it for**：流水账、长篇正文、一次性调试过程、临时 todo（这些放会话级）。

## 项目目标

（待补充：这个工作区要做什么）

## 当前阶段

（待补充）

## 关键约定与决策

- （待补充：影响未来工作的长期决策、技术选型、规范）

## 踩坑要点

- （待补充：高频要点；详细排查过程放 devlogs/，短条目放 PITFALLS.md）

## 知识索引

> 调研 / 分析 / 报告 / 决策等详细产出，一主题一文件、带日期命名（如 \`notes/YYYY-MM-DD-主题.md\`），在此登记链接。

- （暂无）

## Update Policy

- 仅在项目方向 / 阶段变化、产生长期决策、或新增重要文档时更新本文件。
- append 不覆盖；不确定的内容标注 \`待验证\`；链接详细文档而非粘贴长正文。
`

/**
 * 给定 workspace-files 目录，缺失则写入模板。
 * @returns 实际写入返回 true；已存在（不覆盖）返回 false
 */
export function seedProjectFileAtDir(filesDir: string): boolean {
  const target = join(filesDir, PROJECT_FILE_NAME)
  if (existsSync(target)) return false
  if (!existsSync(filesDir)) mkdirSync(filesDir, { recursive: true })
  writeFileSync(target, PROJECT_TEMPLATE, 'utf-8')
  return true
}

/**
 * 给定 workspace-files 目录，读取 PROJECT.md 内容。
 * @returns 内容（去首尾空白）；不存在或为空返回 null
 */
export function readProjectFileFromDir(filesDir: string): string | null {
  const target = join(filesDir, PROJECT_FILE_NAME)
  if (!existsSync(target)) return null
  try {
    const content = readFileSync(target, 'utf-8').trim()
    return content.length > 0 ? content : null
  } catch (err) {
    console.warn(`[Agent 工作区] 读取 PROJECT.md 失败 (${target}):`, err)
    return null
  }
}

/** 构建注入上下文的 <project_memory> 块（纯函数） */
export function buildProjectMemoryBlock(content: string | null): string {
  if (!content) {
    return '<project_memory>\n本工作区暂无项目记忆。若产生长期有价值的项目知识（目标、约定、决策、调研索引），请创建并维护 workspace-files/PROJECT.md。\n</project_memory>'
  }
  return `<project_memory>\n${content}\n</project_memory>`
}

/** 工作区级 seed（会触发 workspace-files 目录创建） */
export function seedWorkspaceProjectFile(slug: string): boolean {
  return seedProjectFileAtDir(getWorkspaceFilesDir(slug))
}

/** 工作区级只读读取（不创建目录） */
export function readWorkspaceProjectFile(slug: string): string | null {
  return readProjectFileFromDir(resolveWorkspaceFilesDir(slug))
}
