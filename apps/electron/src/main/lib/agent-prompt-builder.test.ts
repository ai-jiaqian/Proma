import { describe, expect, test } from 'bun:test'
import { KNOWLEDGE_MANAGEMENT_SECTION } from './agent-prompt-builder'

describe('知识管理提示词段', () => {
  test('Given 知识管理段 When 检查 Then 含内容路由表与 PROJECT.md', () => {
    expect(KNOWLEDGE_MANAGEMENT_SECTION).toContain('内容路由')
    expect(KNOWLEDGE_MANAGEMENT_SECTION).toContain('PROJECT.md')
    expect(KNOWLEDGE_MANAGEMENT_SECTION).toContain('强默认规则')
  })

  test('Given 知识管理段 When 检查 Then 含会话级封闭异常与绝对路径提醒', () => {
    // 会话级异常不能被静默删掉（这是"会话 vs 项目"区分的核心）
    expect(KNOWLEDGE_MANAGEMENT_SECTION).toContain('会话级')
    // 防止相对路径回落到会话 cwd 的加固说明必须在
    expect(KNOWLEDGE_MANAGEMENT_SECTION).toContain('绝对路径')
  })

  test('Given 知识管理段 When 检查 Then 不再含"默认写 note.md"旧指令', () => {
    expect(KNOWLEDGE_MANAGEMENT_SECTION).not.toContain('输出到 .context/note.md')
    expect(KNOWLEDGE_MANAGEMENT_SECTION).not.toContain('note.md — 研究与分析输出')
  })
})
