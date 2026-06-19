# 工作区记忆（PROJECT.md + 内容路由）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给每个 Agent 工作区一个自动初始化、每次会话强制注入的 `PROJECT.md` 项目必读文件，并用"内容路由表 + 默认项目级"的提示词规则替代当前模糊的会话/工作区判断与"默认写 note.md"行为。

**Architecture:** 新增聚焦模块 `workspace-project-file.ts`（模板常量 + 纯函数 seed/read/block 构建）；`buildDynamicContext` 每条消息实时读盘并注入 `<project_memory>` 块；`createAgentWorkspace` 创建时 seed、启动期对老工作区缺失补建；`buildSystemPrompt` 的知识管理段重写为内容路由表并删除 note.md 默认归宿。

**Tech Stack:** TypeScript（ESM、`import type`）、Electron 主进程、Bun 测试（`bun:test`，Given-When-Then 中文命名）、node:fs。

参考设计：`docs/plans/2026-06-19-workspace-memory-design.md`

---

## 文件结构

| 文件 | 责任 |
|------|------|
| `apps/electron/src/main/lib/workspace-project-file.ts`（新建） | PROJECT.md 模板常量；纯函数 `seedProjectFileAtDir` / `readProjectFileFromDir` / `buildProjectMemoryBlock`；工作区便捷封装 `seedWorkspaceProjectFile` / `readWorkspaceProjectFile` |
| `apps/electron/src/main/lib/workspace-project-file.test.ts`（新建） | 上述纯函数与模板的单元测试 |
| `apps/electron/src/main/lib/agent-prompt-builder.ts`（改） | `buildDynamicContext` 注入 `<project_memory>`；新增并导出 `KNOWLEDGE_MANAGEMENT_SECTION` 替换旧知识管理段；清理 note.md 旧指令 |
| `apps/electron/src/main/lib/agent-prompt-builder.test.ts`（新建） | `KNOWLEDGE_MANAGEMENT_SECTION` 内容回归测试 |
| `apps/electron/src/main/lib/agent-workspace-manager.ts`（改） | 创建工作区时 seed PROJECT.md；新增 `seedProjectFilesInWorkspaces()` 老工作区补建 |
| `apps/electron/src/main/index.ts`（改） | 启动期调用 `seedProjectFilesInWorkspaces` |
| `apps/electron/package.json`（改） | patch 版本 +1 |

---

## 准备：创建分支

- [ ] **Step 0: 从 main 切出特性分支**

Run:
```bash
cd /Volumes/jiaqian/opensource/proma
git checkout -b feat/workspace-project-memory
```
Expected: `Switched to a new branch 'feat/workspace-project-memory'`

---

## Task 1: workspace-project-file 模块（模板 + 纯函数）

**Files:**
- Create: `apps/electron/src/main/lib/workspace-project-file.ts`
- Test: `apps/electron/src/main/lib/workspace-project-file.test.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/electron/src/main/lib/workspace-project-file.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PROJECT_FILE_NAME,
  PROJECT_TEMPLATE,
  buildProjectMemoryBlock,
  readProjectFileFromDir,
  seedProjectFileAtDir,
} from './workspace-project-file'

describe('工作区项目记忆文件', () => {
  test('Given 模板 When 检查必需章节 Then 含目标/知识索引/Update Policy/Use it for', () => {
    expect(PROJECT_TEMPLATE).toContain('## 项目目标')
    expect(PROJECT_TEMPLATE).toContain('## 知识索引')
    expect(PROJECT_TEMPLATE).toContain('Update Policy')
    expect(PROJECT_TEMPLATE).toContain('Use it for')
  })

  test('Given 有内容 When 构建注入块 Then 用 project_memory 包裹原文', () => {
    const block = buildProjectMemoryBlock('项目目标：测试')
    expect(block).toContain('<project_memory>')
    expect(block).toContain('</project_memory>')
    expect(block).toContain('项目目标：测试')
  })

  test('Given 无内容 When 构建注入块 Then 返回创建引导', () => {
    const block = buildProjectMemoryBlock(null)
    expect(block).toContain('暂无项目记忆')
    expect(block).toContain('PROJECT.md')
  })

  test('Given 空目录 When seed Then 写入模板并返回 true', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proma-pf-'))
    expect(seedProjectFileAtDir(dir)).toBe(true)
    expect(existsSync(join(dir, PROJECT_FILE_NAME))).toBe(true)
    expect(readFileSync(join(dir, PROJECT_FILE_NAME), 'utf-8')).toBe(PROJECT_TEMPLATE)
  })

  test('Given 已存在用户内容 When 再次 seed Then 不覆盖并返回 false', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proma-pf-'))
    seedProjectFileAtDir(dir)
    writeFileSync(join(dir, PROJECT_FILE_NAME), '用户改过的内容', 'utf-8')
    expect(seedProjectFileAtDir(dir)).toBe(false)
    expect(readFileSync(join(dir, PROJECT_FILE_NAME), 'utf-8')).toBe('用户改过的内容')
  })

  test('Given 不存在文件 When 读取 Then 返回 null', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proma-pf-'))
    expect(readProjectFileFromDir(dir)).toBeNull()
  })

  test('Given 已写入文件 When 读取 Then 返回去空白后的内容', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proma-pf-'))
    writeFileSync(join(dir, PROJECT_FILE_NAME), '  hello  \n', 'utf-8')
    expect(readProjectFileFromDir(dir)).toBe('hello')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test apps/electron/src/main/lib/workspace-project-file.test.ts`
Expected: FAIL，报 `Cannot find module './workspace-project-file'`

- [ ] **Step 3: 实现模块**

Create `apps/electron/src/main/lib/workspace-project-file.ts`:

```typescript
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
  } catch {
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test apps/electron/src/main/lib/workspace-project-file.test.ts`
Expected: PASS，7 个测试全绿

- [ ] **Step 5: 提交**

```bash
git add apps/electron/src/main/lib/workspace-project-file.ts apps/electron/src/main/lib/workspace-project-file.test.ts
git commit -m "feat(agent): 新增工作区 PROJECT.md 模板与读写纯函数

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 创建工作区时 seed + 老工作区启动补建

**Files:**
- Modify: `apps/electron/src/main/lib/agent-workspace-manager.ts:197-199`（`createAgentWorkspace`）
- Modify: `apps/electron/src/main/lib/agent-workspace-manager.ts`（新增 `seedProjectFilesInWorkspaces`，置于 `upgradeDefaultSkillsInWorkspaces` 之后，约 398 行后）
- Modify: `apps/electron/src/main/index.ts:88,493`

- [ ] **Step 1: 在 agent-workspace-manager.ts 顶部导入 seed 函数**

在文件已有 import 区追加：

```typescript
import { seedWorkspaceProjectFile } from './workspace-project-file'
```

- [ ] **Step 2: 创建工作区时 seed PROJECT.md**

在 `createAgentWorkspace`（约 197-199）`copyDefaultSkills(slug)` 之后追加一行：

原文：
```typescript
  getAgentWorkspacePath(slug)
  ensurePluginManifest(slug, name)
  copyDefaultSkills(slug)
```
改为：
```typescript
  getAgentWorkspacePath(slug)
  ensurePluginManifest(slug, name)
  copyDefaultSkills(slug)
  seedWorkspaceProjectFile(slug)
```

- [ ] **Step 3: 新增老工作区补建函数**

在 `upgradeDefaultSkillsInWorkspaces()` 函数结束（约第 398 行 `}` 之后）追加：

```typescript
/**
 * 对所有已存在工作区补建 PROJECT.md（仅缺失时写，绝不覆盖用户内容）。
 * 启动期调用，让老用户工作区也获得项目必读文件。
 */
export function seedProjectFilesInWorkspaces(): void {
  const index = readIndex()
  for (const workspace of index.workspaces) {
    try {
      if (seedWorkspaceProjectFile(workspace.slug)) {
        console.log(`[Agent 工作区] 已补建 PROJECT.md: ${workspace.slug}`)
      }
    } catch (err) {
      console.warn(`[Agent 工作区] 补建 PROJECT.md 失败 (${workspace.slug}):`, err)
    }
  }
}
```

- [ ] **Step 4: 启动期接线（index.ts）**

在 `apps/electron/src/main/index.ts:88` 的导入处，把：
```typescript
import { upgradeDefaultSkillsInWorkspaces } from './lib/agent-workspace-manager'
```
改为：
```typescript
import { upgradeDefaultSkillsInWorkspaces, seedProjectFilesInWorkspaces } from './lib/agent-workspace-manager'
```

在 `index.ts:493` 的：
```typescript
  safeRun('upgradeDefaultSkillsInWorkspaces', upgradeDefaultSkillsInWorkspaces)
```
之后追加：
```typescript
  safeRun('seedProjectFilesInWorkspaces', seedProjectFilesInWorkspaces)
```

- [ ] **Step 5: 类型检查**

Run: `bun run typecheck`
Expected: 无报错（或与改动无关的既有报错为 0 新增）

- [ ] **Step 6: 提交**

```bash
git add apps/electron/src/main/lib/agent-workspace-manager.ts apps/electron/src/main/index.ts
git commit -m "feat(agent): 创建工作区时 seed PROJECT.md，启动期补建老工作区

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: buildDynamicContext 注入 <project_memory>

**Files:**
- Modify: `apps/electron/src/main/lib/agent-prompt-builder.ts`（顶部 import + `buildDynamicContext` 体内 514-542）

- [ ] **Step 1: 导入读取与块构建函数**

在 `agent-prompt-builder.ts` 已有 import 区追加：

```typescript
import { readWorkspaceProjectFile, buildProjectMemoryBlock } from './workspace-project-file'
```

- [ ] **Step 2: 在工作区分支注入 project_memory**

在 `buildDynamicContext` 的 `if (ctx.workspaceSlug) { ... }` 块内，`<workspace_state>` 那段之后、该 `if` 闭合之前追加注入。

原文（约 539-542）：
```typescript
    if (wsLines.length > 0) {
      sections.push(`<workspace_state>\n${wsLines.join('\n')}\n</workspace_state>`)
    }
  }
```
改为：
```typescript
    if (wsLines.length > 0) {
      sections.push(`<workspace_state>\n${wsLines.join('\n')}\n</workspace_state>`)
    }

    // 强制注入项目必读文件 PROJECT.md（每条消息实时读盘，保证内容变更即时生效）
    const projectMemory = readWorkspaceProjectFile(ctx.workspaceSlug)
    sections.push(buildProjectMemoryBlock(projectMemory))
  }
```

- [ ] **Step 3: 类型检查**

Run: `bun run typecheck`
Expected: 无新增报错

- [ ] **Step 4: 提交**

```bash
git add apps/electron/src/main/lib/agent-prompt-builder.ts
git commit -m "feat(agent): 每次会话强制注入工作区 PROJECT.md 到上下文

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 重写知识管理提示词为内容路由表

**Files:**
- Modify: `apps/electron/src/main/lib/agent-prompt-builder.ts`（新增导出常量 + 替换 414-454 段；清理 213/271、332-342、472-473）
- Test: `apps/electron/src/main/lib/agent-prompt-builder.test.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/electron/src/main/lib/agent-prompt-builder.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { KNOWLEDGE_MANAGEMENT_SECTION } from './agent-prompt-builder'

describe('知识管理提示词段', () => {
  test('Given 知识管理段 When 检查 Then 含内容路由表与 PROJECT.md', () => {
    expect(KNOWLEDGE_MANAGEMENT_SECTION).toContain('内容路由')
    expect(KNOWLEDGE_MANAGEMENT_SECTION).toContain('PROJECT.md')
    expect(KNOWLEDGE_MANAGEMENT_SECTION).toContain('强默认规则')
  })

  test('Given 知识管理段 When 检查 Then 不再含"默认写 note.md"旧指令', () => {
    expect(KNOWLEDGE_MANAGEMENT_SECTION).not.toContain('输出到 .context/note.md')
    expect(KNOWLEDGE_MANAGEMENT_SECTION).not.toContain('note.md — 研究与分析输出')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test apps/electron/src/main/lib/agent-prompt-builder.test.ts`
Expected: FAIL，报 `KNOWLEDGE_MANAGEMENT_SECTION` 未导出

- [ ] **Step 3: 新增导出常量**

在 `agent-prompt-builder.ts` 中（建议置于 `buildSystemPrompt` 函数定义之前的模块顶层），新增：

```typescript
/** 文档输出与知识管理段（内容路由表 + 默认项目级 + 护栏），由 buildSystemPrompt 注入 */
export const KNOWLEDGE_MANAGEMENT_SECTION = `## 文档输出与知识管理

**核心原则：有价值的产出要沉淀为文件，不要只留在聊天流里消失。标准化记忆、不标准化项目——根文件是导航/索引，详细产出放独立文件。**

### PROJECT.md — 项目必读文件（工作区级，自动注入）

每个工作区根下有 \`workspace-files/PROJECT.md\`，其内容在每次会话开始已自动注入你的上下文（你**无需手动读取**）。它是项目导航层：项目目标/阶段、长期约定与决策、关键踩坑要点、以及指向详细文档的「知识索引」。
- 你负责持续维护它：发现长期有价值的项目知识时更新；保持精炼（建议 < 200 行）。
- 不要往里堆流水账或长篇正文，详见下方 Update Policy。

### 内容路由（写产出前先查这张表）

| 内容类型 | 归宿 |
|---------|------|
| 项目方向 / 长期约定 / 持久决策 | \`PROJECT.md\`（精炼登记） |
| 调研 / 分析 / 方案对比 / 报告 / 详细决策 | 工作区级独立文件，一主题一文件、带日期命名（如 \`workspace-files/notes/YYYY-MM-DD-主题.md\`），并在 \`PROJECT.md\` 知识索引登记链接 |
| 短踩坑（symptom→cause→fix） | \`workspace-files/PITFALLS.md\`（首次遇到才建） |
| 详细调试 / 排查路径 | \`workspace-files/devlogs/YYYY-MM-DD-事件.md\`（可选，重度才用） |
| 仅本次任务的临时草稿 / 进度 todo / 计划草稿 | 会话级（当前 cwd），任务结束即弃 |

### 强默认规则：默认写项目级

默认一律写工作区（项目）级。只有命中"仅本次任务的临时草稿 / 进度 todo / 计划草稿"这个封闭异常，才写会话级。
判断心法：**"关掉这个会话、过一周，我还会想找回这个文件吗？"会 → 项目级；不会 → 会话级。**

### 产出组织原则

- 一次独立调研/分析 = 一个语义化命名、带日期的独立文件；不要把多个话题堆进同一个文件。
- 详细文件务必在 \`PROJECT.md\` 知识索引登记链接，保证事后找得到。
- \`note.md\` 不再是默认归宿；它仅作为会话级临时随手记的可选项。

### 护栏

- append 追加，不覆盖已有内容；不确定的结论标注 \`待验证\`。
- 绝不编造结论或结果；缺证据就说明并指出需要验证什么。
- 根文件链接详细文档，不要粘贴长正文（避免重复与膨胀）。
- 使用 SubAgent 时，调研结果由你（主 Agent）整理后写入文件并更新索引，SubAgent 只返回发现。

### Update Policy（PROJECT.md）

仅在以下情况更新 \`PROJECT.md\`：项目方向/阶段变化、产生影响未来工作的长期决策、新增重要文档需登记索引。不要为每条命令、临时调试或一次性信息更新它。`
```

- [ ] **Step 4: 用常量替换旧的知识管理段 push**

在 `buildSystemPrompt` 中，把旧的"文档输出与知识管理"整段 push（约 414-454，从 `sections.push(\`## 文档输出与知识管理` 起到该模板字符串闭合的 `)` 止）整体替换为：

```typescript
  // 文档输出与知识管理
  sections.push(KNOWLEDGE_MANAGEMENT_SECTION)
```

- [ ] **Step 5: 清理"典型工作流"里的 note.md 旧指令**

`agent-prompt-builder.ts` 中出现两处（约 213 与 271）：
```
3. 整合所有信息，将调研结果输出到 \`.context/note.md\`
```
各自改为：
```
3. 整合信息后，将调研结果写入工作区级独立文件（一主题一文件、带日期命名），并在 PROJECT.md 知识索引登记链接
```

两处（约 216 与 274）：
```
6. 执行实施，将进度更新到 \`.context/todo.md\`
```
各自改为：
```
6. 执行实施，将本次任务进度记录到会话级临时 todo（仅本次任务用）
```

> 提示：两处文本相同，使用编辑器"全部替换"或分别定位行号替换。

- [ ] **Step 6: 替换工作区段的 ".context 目录层级" 说明**

`agent-prompt-builder.ts` 约 332-342，把：
```typescript
### .context 目录层级

存在两个 \`.context/\` 目录，用途不同：
- **会话级** \`.context/\`（当前 cwd 下）：当前会话的临时工作台，存放本次任务的 todo.md、plan/、临时笔记等
- **工作区级** \`~/${configDirName}/agent-workspaces/${ctx.workspaceSlug}/workspace-files/.context/\`：跨会话共享的持久文档，存放长期 note.md、项目级知识等

选择写入哪个目录时：
- 只与当前任务相关的内容 → 会话级 \`.context/\`
- 跨会话有参考价值的内容（调研报告、架构分析等） → 工作区级 \`.context/\`
- 用户明确指定了位置时，按用户要求
- 新会话开始时，**两个目录都要检查**以恢复完整上下文
```
替换为：
```typescript
### 文件归宿

- **工作区级** \`workspace-files/\`：跨会话持久产出（PROJECT.md、调研/分析文件、PITFALLS.md 等）。详细分类见下方「文档输出与知识管理」的内容路由表。
- **会话级**（当前 cwd）：仅本次任务的临时草稿、进度 todo、计划草稿，任务结束即弃。
- 默认写工作区级；只有"仅本次任务的临时内容"才写会话级。
```

> 注意：替换后 `configDirName` 变量仍被上方路径行（工作区根目录/会话目录/MCP/Skills）使用，不会出现未使用变量。

- [ ] **Step 7: 更新"交互规范"里的会话恢复/自检条目**

`agent-prompt-builder.ts` 约 472-473，把：
```
5. **会话恢复**：每次收到新任务时，先检查会话级和工作区级两个 \`.context/\` 目录（note.md、todo.md）以及当前目录的 CLAUDE.md
6. **自检习惯**：复杂任务执行过程中，定期回顾 CLAUDE.md 和两级 .context/ 中的内容，确保行为与已记录的规范和计划保持一致
```
改为：
```
5. **会话恢复**：\`PROJECT.md\` 已自动注入，无需手动读取；若本次任务延续之前的工作，检查当前 cwd 下的会话级临时文件（如 todo）
6. **自检习惯**：复杂任务执行中，定期回顾已注入的 \`PROJECT.md\` 与正在写的产出文件，确保与已记录的约定/计划一致
```

- [ ] **Step 8: 运行测试确认通过**

Run: `bun test apps/electron/src/main/lib/agent-prompt-builder.test.ts`
Expected: PASS，2 个测试全绿

- [ ] **Step 9: 类型检查**

Run: `bun run typecheck`
Expected: 无新增报错

- [ ] **Step 10: 提交**

```bash
git add apps/electron/src/main/lib/agent-prompt-builder.ts apps/electron/src/main/lib/agent-prompt-builder.test.ts
git commit -m "feat(agent): 知识管理提示词改为内容路由表，移除 note.md 默认归宿

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 全量验证 + 版本号 + 手动冒烟

**Files:**
- Modify: `apps/electron/package.json`（version patch +1）

- [ ] **Step 1: 跑全部受影响测试**

Run: `bun test apps/electron/src/main/lib/workspace-project-file.test.ts apps/electron/src/main/lib/agent-prompt-builder.test.ts`
Expected: 全部 PASS

- [ ] **Step 2: 全量类型检查**

Run: `bun run typecheck`
Expected: 无新增报错

- [ ] **Step 3: 递增 electron 包 patch 版本**

编辑 `apps/electron/package.json`，把 `"version": "0.12.26"` patch +1 → `"0.12.27"`。

- [ ] **Step 4: 手动冒烟（新建工作区 + 会话注入）**

Run: `bun run dev`
手动验证：
1. 新建一个 Agent 工作区 → 检查 `~/.proma/agent-workspaces/{slug}/workspace-files/PROJECT.md` 已生成且为模板内容。
2. 对已有的老工作区（应用启动后）→ 检查其 `workspace-files/PROJECT.md` 已被补建。
3. 在该工作区发一条 Agent 消息，让其复述"项目记忆"或问"你的 PROJECT.md 里写了什么" → 确认 Agent 能引用到注入内容（说明 `<project_memory>` 已进上下文）。
4. 让 Agent 做一次小调研 → 确认产出落到 `workspace-files/` 下带日期的独立文件、并在 PROJECT.md 索引登记，而非堆进单一 note.md。

Expected: 四项均符合预期。如有偏差，回到对应 Task 修正。

- [ ] **Step 5: 提交**

```bash
git add apps/electron/package.json
git commit -m "chore(electron): 递增版本号（工作区记忆特性）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 自检对照（spec coverage）

| spec 要求 | 对应任务 |
|-----------|----------|
| §6 强制注入 PROJECT.md | Task 3 |
| §7 路由表 + 强默认 + 护栏 + 删 note.md 默认 | Task 4 |
| §8 新建 seed + 老工作区补建（仅缺失写、不覆盖） | Task 2（+ Task 1 的 `seedProjectFileAtDir` 不覆盖语义，测试覆盖） |
| §5 PROJECT.md 模板章节 | Task 1（`PROJECT_TEMPLATE` + 测试） |
| §11 BDD 验收（新建/补建/注入/不堆 note.md/临时留会话级/提示词清理） | Task 1-2 单测 + Task 4 回归测 + Task 5 手动冒烟 |

> 说明：`PROJECT.md` 模板以 TS 字符串常量内嵌（非 bundle 资源），比 spec §8"bundle 资源分发"更简，规避打包路径解析风险，且不触发 default-skills 版本契约。
