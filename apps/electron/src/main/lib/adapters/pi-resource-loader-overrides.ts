import { basename } from 'node:path'

interface AgentsFilesResult {
  agentsFiles: Array<{ path: string; content: string }>
}

// Proma injects its own system prompt. Do not inherit CLAUDE.md instruction files
// from a user-selected local project or any of its ancestors（避免与 Proma 提示词体系双注入）。
// fork 二开（目录原生模式）：AGENTS.md 不再过滤——它是跨 harness（Codex/OpenCode/Pi CLI）
// 共享的项目级指令标准，本地项目下由 Pi 原生读取。
const LEGACY_AGENT_CONTEXT_FILE_NAMES = new Set([
  'CLAUDE.md',
  'CLAUDE.MD',
])

export function createPromaAgentsFilesOverride(): (base: AgentsFilesResult) => AgentsFilesResult {
  return (base) => ({
    agentsFiles: base.agentsFiles.filter((file) => !LEGACY_AGENT_CONTEXT_FILE_NAMES.has(basename(file.path))),
  })
}
