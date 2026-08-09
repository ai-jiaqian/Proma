import { beforeAll, describe, expect, mock, test } from 'bun:test'

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
  ({ buildSystemPrompt, buildDynamicContext } = await import('./agent-prompt-builder'))
})

function buildPrompt(agentCwd: string): string {
  return buildSystemPrompt({
    workspaceName: '示例项目',
    workspaceSlug: 'sample-project',
    sessionId: 'session-1',
    agentCwd,
    permissionMode: 'bypassPermissions',
  })
}

describe('项目与会话工作台提示词', () => {
  test('Given 项目根 cwd When 构建提示词 Then 标明会话直接在项目中工作', () => {
    const prompt = buildPrompt('/tmp/sample-project')

    expect(prompt).toContain('## 工作区与 Context')
    expect(prompt).toContain('项目根：`/tmp/sample-project`')
    expect(prompt).toContain('当前直接在项目根工作')
    expect(prompt).not.toContain('项目根始终是 cwd')
  })

  test('Given 历史会话工作台 cwd When 构建提示词 Then 不将它误称为项目根', () => {
    const prompt = buildPrompt('/tmp/.proma/agent-workspaces/sample-project/session-1')

    expect(prompt).toContain('cwd：`/tmp/.proma/agent-workspaces/sample-project/session-1`')
    expect(prompt).toContain('会话工作台，不等同项目根')
    expect(prompt).toContain('项目根：`/tmp/sample-project`')
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

test('Given Proma 工作区 When 构建提示词 Then 指向受管 AGENTS.md 而非旧规则文件', () => {
  const prompt = buildPrompt('/tmp/sample-project')

  expect(prompt).toContain('Proma 工作区规则：')
  expect(prompt).toContain('/AGENTS.md`')
  expect(prompt).not.toContain('Proma 工作区 CLAUDE.md')
})
