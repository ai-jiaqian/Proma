import { describe, expect, test } from 'bun:test'
import { createPromaAgentsFilesOverride } from './pi-resource-loader-overrides'

describe('Pi 指令文件过滤（fork 目录原生模式）', () => {
  const override = createPromaAgentsFilesOverride()

  test('Given 项目指令文件 When 过滤 Then AGENTS.md 保留、CLAUDE.md 剔除', () => {
    const result = override({
      agentsFiles: [
        { path: '/repo/AGENTS.md', content: 'agents' },
        { path: '/repo/AGENTS.MD', content: 'agents-upper' },
        { path: '/repo/CLAUDE.md', content: 'claude' },
        { path: '/repo/CLAUDE.MD', content: 'claude-upper' },
        { path: '/repo/docs/AGENTS.md', content: 'nested-agents' },
      ],
    })

    const paths = result.agentsFiles.map((f) => f.path)
    expect(paths).toContain('/repo/AGENTS.md')
    expect(paths).toContain('/repo/AGENTS.MD')
    expect(paths).toContain('/repo/docs/AGENTS.md')
    expect(paths).not.toContain('/repo/CLAUDE.md')
    expect(paths).not.toContain('/repo/CLAUDE.MD')
  })
})
