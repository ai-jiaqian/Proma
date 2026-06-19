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
