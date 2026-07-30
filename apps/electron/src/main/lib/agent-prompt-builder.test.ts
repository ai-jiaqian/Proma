import { beforeAll, describe, expect, mock, test } from 'bun:test'
import { KNOWLEDGE_MANAGEMENT_SECTION } from './agent-prompt-builder'

mock.module('./user-profile-service', () => ({
  getUserProfile: () => ({ userName: '测试用户' }),
}))

mock.module('./agent-workspace-manager', () => ({
  getAgentWorkspaceBySlug: () => undefined,
  getProjectFilesPath: () => '/tmp/sample-project',
  getWorkspaceMcpConfig: () => ({ servers: {} }),
}))

mock.module('./config-paths', () => ({
  getConfigDirName: () => '.proma',
}))

let buildSystemPrompt: typeof import('./agent-prompt-builder').buildSystemPrompt
let buildDynamicContext: typeof import('./agent-prompt-builder').buildDynamicContext

beforeAll(async () => {
  ;({ buildSystemPrompt, buildDynamicContext } = await import('./agent-prompt-builder'))
})

function buildPrompt(agentCwd: string): string {
  return buildSystemPrompt({
    agentRuntime: 'pi',
    workspaceName: '示例项目',
    workspaceSlug: 'sample-project',
    sessionId: 'session-1',
    agentCwd,
    permissionMode: 'bypassPermissions',
  })
}

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

describe('项目与会话工作台提示词', () => {
  test('Given 项目根 cwd When 构建提示词 Then 标明会话直接在项目中工作', () => {
    const prompt = buildPrompt('/tmp/sample-project')

    expect(prompt).toContain('## 项目')
    expect(prompt).toContain('项目名称: 示例项目')
    expect(prompt).toContain('当前会话直接在项目根目录中工作')
    expect(prompt).not.toContain('项目根始终是 cwd')
  })

  test('Given 历史会话工作台 cwd When 构建提示词 Then 不将它误称为项目根', () => {
    const prompt = buildPrompt('/tmp/.proma/agent-workspaces/sample-project/session-1')

    expect(prompt).toContain('当前会话仍使用私有会话工作台，不等同于项目根目录')
  })

  test('Given 项目动态上下文 When 构建消息前缀 Then 使用项目标签', () => {
    const context = buildDynamicContext({
      workspaceName: '示例项目',
      workspaceSlug: 'sample-project',
      agentCwd: '/tmp/sample-project',
    })

    expect(context).toContain('项目: 示例项目')
    expect(context).not.toContain('工作区: 示例项目')
  })
})

describe('fork 纪律：不含 git 推广标识', () => {
  test('Given 系统提示词 When 构建 Then 不含 Made-with 推广与 attribution 引用', () => {
    const prompt = buildPrompt('/tmp/sample-project')

    expect(prompt).not.toContain('Made-with')
    expect(prompt).not.toContain('git-attribution')
    expect(prompt).not.toContain('gitAttribution')
  })
})
