/**
 * AI 聊天流式服务（Electron 编排层）
 *
 * 负责 Electron 特定的操作：
 * - 查找渠道、解密 API Key
 * - 管理 AbortController
 * - 调用 @proma/core 的 Provider 适配器系统
 * - 桥接 StreamEvent → webContents.send()
 * - 持久化消息到 JSONL + 更新索引
 * - 模块化工具的 function calling 循环（通过 ChatToolRegistry + ChatToolExecutor）
 *
 * 纯逻辑（消息转换、SSE 解析、请求构建）已抽象到 @proma/core/providers。
 */

import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { CHAT_IPC_CHANNELS } from '@proma/shared'
import type { ChatSendInput, ChatMessage, GenerateTitleInput, PromptOptimizeInput, FileAttachment, ChatToolActivity } from '@proma/shared'
import {
  getAdapter,
  streamSSE,
  fetchTitle,
} from '@proma/core'
import type { ImageAttachmentData, ContinuationMessage } from '@proma/core'
import { listChannels, decryptApiKey } from './channel-manager'
import { appendMessage, updateConversationMeta, getConversationMessages } from './conversation-manager'
import { readAttachmentAsBase64, isImageAttachment } from './attachment-service'
import { extractTextFromAttachment, isDocumentAttachment } from './document-parser'
import { getFetchFn } from './proxy-fetch'
import { getEffectiveProxyUrl } from './proxy-settings-service'
import { getEnabledTools } from './chat-tool-registry'
import { executeToolCalls } from './chat-tool-executor'

/** 活跃的 AbortController 映射（conversationId → controller） */
const activeControllers = new Map<string, AbortController>()

/** 最大工具续接轮数（防止无限循环，每轮可含多个工具调用） */
const MAX_TOOL_ROUNDS = 20

// ===== 平台相关：图片附件读取器 =====

/**
 * 读取图片附件的 base64 数据
 *
 * 此函数作为 ImageAttachmentReader 注入给 core 层，
 * 因为文件系统读取属于 Electron 平台操作。
 */
function getImageAttachmentData(attachments?: FileAttachment[]): ImageAttachmentData[] {
  if (!attachments || attachments.length === 0) return []

  return attachments
    .filter((att) => isImageAttachment(att.mediaType))
    .map((att) => ({
      mediaType: att.mediaType,
      data: readAttachmentAsBase64(att.localPath),
    }))
}

// ===== 文档附件文本提取 =====

/**
 * 为单条消息提取文档附件的文本内容
 *
 * 将非图片附件的文本内容提取后，以结构化格式追加到消息文本后面。
 * 图片附件由适配器层单独处理，这里只处理文档类附件。
 *
 * @param messageText 原始消息文本
 * @param attachments 消息的附件列表
 * @returns 包含文档文本的增强消息
 */
async function enrichMessageWithDocuments(
  messageText: string,
  attachments?: FileAttachment[],
): Promise<string> {
  if (!attachments || attachments.length === 0) return messageText

  // 筛选出文档类附件（非图片）
  const docAttachments = attachments.filter((att) => isDocumentAttachment(att.mediaType))
  if (docAttachments.length === 0) return messageText

  const parts: string[] = [messageText]

  for (const att of docAttachments) {
    try {
      const text = await extractTextFromAttachment(att.localPath)
      if (text.trim()) {
        parts.push(`\n<file name="${att.filename}">\n${text}\n</file>`)
      } else {
        parts.push(`\n<file name="${att.filename}">\n[文件内容为空]\n</file>`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      console.warn(`[聊天服务] 文档提取失败: ${att.filename}`, error)
      parts.push(`\n<file name="${att.filename}">\n[文件内容提取失败: ${errorMsg}]\n</file>`)
    }
  }

  return parts.join('')
}

/**
 * 为历史消息列表注入文档附件文本
 *
 * 遍历历史消息，对包含文档附件的用户消息进行文本增强。
 * 返回新的消息数组（不修改原始消息）。
 */
async function enrichHistoryWithDocuments(
  history: ChatMessage[],
): Promise<ChatMessage[]> {
  const enriched: ChatMessage[] = []

  for (const msg of history) {
    // 只对包含附件的用户消息进行文档提取
    if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
      const hasDocuments = msg.attachments.some((att) => isDocumentAttachment(att.mediaType))
      if (hasDocuments) {
        const enrichedContent = await enrichMessageWithDocuments(msg.content, msg.attachments)
        enriched.push({ ...msg, content: enrichedContent })
        continue
      }
    }
    enriched.push(msg)
  }

  return enriched
}

// ===== 上下文过滤 =====

/**
 * 根据分隔线和上下文长度裁剪历史消息
 *
 * 三层过滤：
 * 1. 分隔线过滤：仅保留最后一个分隔线之后的消息
 * 2. 轮数裁剪：按轮数（user+assistant = 1 轮）限制历史
 * 3. contextLength === 'infinite' 或 undefined 时保留全部
 */
function filterHistory(
  messageHistory: ChatMessage[],
  contextDividers?: string[],
  contextLength?: number | 'infinite',
): ChatMessage[] {
  // 过滤掉空内容的助手消息，避免发送无效消息给 API
  let filtered = messageHistory.filter(
    (msg) => !(msg.role === 'assistant' && !msg.content.trim()),
  )

  // 分隔线过滤：仅保留最后一个分隔线之后的消息
  if (contextDividers && contextDividers.length > 0) {
    const lastDividerId = contextDividers[contextDividers.length - 1]
    const dividerIndex = filtered.findIndex((msg) => msg.id === lastDividerId)
    if (dividerIndex >= 0) {
      filtered = filtered.slice(dividerIndex + 1)
    }
  }

  // 上下文长度过滤：按轮数裁剪
  if (typeof contextLength === 'number' && contextLength >= 0) {
    if (contextLength === 0) {
      return []
    }
    // 从后往前，收集 N 轮对话
    const collected: ChatMessage[] = []
    let roundCount = 0
    for (let i = filtered.length - 1; i >= 0; i--) {
      const msg = filtered[i] as ChatMessage
      collected.unshift(msg)
      // 每遇到一条 user 消息算一轮结束
      if (msg.role === 'user') {
        roundCount++
        if (roundCount >= contextLength) break
      }
    }
    return collected
  }

  // contextLength === 'infinite' 或 undefined 时保留全部
  return filtered
}

// ===== 核心流式函数 =====

/**
 * 发送消息并流式返回 AI 响应
 *
 * 通过 ChatToolRegistry 获取启用的工具定义，
 * 通过 ChatToolExecutor 统一执行工具调用。
 *
 * @param input 发送参数
 * @param webContents 渲染进程的 webContents 实例（用于推送事件）
 */
export async function sendMessage(
  input: ChatSendInput,
  webContents: WebContents,
): Promise<void> {
  const {
    conversationId, userMessage, channelId,
    modelId, systemMessage, contextLength, contextDividers, attachments,
    thinkingEnabled, enabledToolIds,
  } = input

  // 1. 查找渠道
  const channels = listChannels()
  const channel = channels.find((c) => c.id === channelId)
  if (!channel) {
    webContents.send(CHAT_IPC_CHANNELS.STREAM_ERROR, {
      conversationId,
      error: '渠道不存在',
    })
    return
  }

  // 2. 解密 API Key
  let apiKey: string
  try {
    apiKey = decryptApiKey(channelId)
  } catch {
    webContents.send(CHAT_IPC_CHANNELS.STREAM_ERROR, {
      conversationId,
      error: '解密 API Key 失败',
    })
    return
  }

  // 3. 先读取历史消息（在追加用户消息之前，避免 adapter 重复发送当前消息）
  const fullHistory = getConversationMessages(conversationId)

  // 4. 追加用户消息到 JSONL
  const userMsg: ChatMessage = {
    id: randomUUID(),
    role: 'user',
    content: userMessage,
    createdAt: Date.now(),
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  }
  appendMessage(conversationId, userMsg)

  // 5. 过滤历史并提取文档附件文本
  const filteredHistory = filterHistory(fullHistory, contextDividers, contextLength)
  const enrichedHistory = await enrichHistoryWithDocuments(filteredHistory)
  const enrichedUserMessage = await enrichMessageWithDocuments(userMessage, attachments)

  // 6. 创建 AbortController
  const controller = new AbortController()
  activeControllers.set(conversationId, controller)

  // 在 try 外累积流式内容，abort 时 catch 块仍可访问
  let accumulatedContent = ''
  let accumulatedReasoning = ''
  const accumulatedToolActivities: ChatToolActivity[] = []

  try {
    // 7. 获取适配器
    const adapter = getAdapter(channel.provider)

    // 8. 从工具注册表获取启用的工具
    const { tools, systemPromptAppend } = getEnabledTools(enabledToolIds)

    // 注入工具系统提示词
    const effectiveSystemMessage = systemPromptAppend && systemMessage
      ? systemMessage + systemPromptAppend
      : systemPromptAppend
        ? systemPromptAppend
        : systemMessage

    const proxyUrl = await getEffectiveProxyUrl()
    const fetchFn = getFetchFn(proxyUrl)

    // 9. 工具续接循环
    let continuationMessages: ContinuationMessage[] = []
    let round = 0
    /** 标记最近一轮是否执行了工具（用于判断是否需要最终响应轮） */
    let pendingToolResults = false

    /** 流式事件处理器（工具轮和最终响应轮复用） */
    const handleStreamEvent = (event: { type: string; delta?: string; toolCallId?: string; toolName?: string }): void => {
      switch (event.type) {
        case 'chunk':
          accumulatedContent += event.delta ?? ''
          webContents.send(CHAT_IPC_CHANNELS.STREAM_CHUNK, {
            conversationId,
            delta: event.delta,
          })
          break
        case 'reasoning':
          accumulatedReasoning += event.delta ?? ''
          webContents.send(CHAT_IPC_CHANNELS.STREAM_REASONING, {
            conversationId,
            delta: event.delta,
          })
          break
        case 'tool_call_start':
          accumulatedToolActivities.push({
            toolCallId: event.toolCallId!,
            toolName: event.toolName!,
            type: 'start',
          })
          webContents.send(CHAT_IPC_CHANNELS.STREAM_TOOL_ACTIVITY, {
            conversationId,
            activity: { type: 'start', toolName: event.toolName!, toolCallId: event.toolCallId! },
          })
          break
        // done 事件在外部处理
      }
    }

    while (round < MAX_TOOL_ROUNDS) {
      round++
      pendingToolResults = false

      const request = adapter.buildStreamRequest({
        baseUrl: channel.baseUrl,
        apiKey,
        modelId,
        history: enrichedHistory,
        userMessage: enrichedUserMessage,
        systemMessage: effectiveSystemMessage,
        attachments,
        readImageAttachments: getImageAttachmentData,
        thinkingEnabled,
        tools,
        continuationMessages: continuationMessages.length > 0 ? continuationMessages : undefined,
      })

      const { content, toolCalls, stopReason } = await streamSSE({
        request,
        adapter,
        signal: controller.signal,
        fetchFn,
        onEvent: handleStreamEvent,
      })

      // 如果没有工具调用或不是 tool_use 停止，退出循环
      if (!toolCalls || toolCalls.length === 0 || stopReason !== 'tool_use') {
        break
      }

      // 执行工具调用（通过统一执行器）
      const toolResults = await executeToolCalls(toolCalls, {
        webContents,
        conversationId,
      })

      // 累积工具结果到持久化数据
      for (const tc of toolCalls) {
        const tr = toolResults.find((r) => r.toolCallId === tc.id)
        if (tr) {
          accumulatedToolActivities.push({
            toolCallId: tc.id,
            toolName: tc.name,
            type: 'result',
            result: tr.content,
            isError: tr.isError,
          })
        }
      }

      // 构建续接消息
      continuationMessages = [
        ...continuationMessages,
        { role: 'assistant' as const, content, toolCalls },
        { role: 'tool' as const, results: toolResults },
      ]
      pendingToolResults = true

      // 注意：不重置 accumulatedContent/accumulatedReasoning，跨轮次持续累积
    }

    // 10. 最终响应轮：如果因达到 MAX_TOOL_ROUNDS 退出但仍有待处理的工具结果，
    // 再发起一次 API 调用（不传 tools）让模型基于工具结果生成最终文本回复
    if (pendingToolResults && continuationMessages.length > 0) {
      console.log(`[聊天服务] 工具轮次已达上限 (${MAX_TOOL_ROUNDS})，发起最终响应轮`)

      const finalRequest = adapter.buildStreamRequest({
        baseUrl: channel.baseUrl,
        apiKey,
        modelId,
        history: enrichedHistory,
        userMessage: enrichedUserMessage,
        systemMessage: effectiveSystemMessage,
        attachments,
        readImageAttachments: getImageAttachmentData,
        thinkingEnabled,
        // 不传 tools，强制模型生成文本回复而非继续调用工具
        continuationMessages,
      })

      await streamSSE({
        request: finalRequest,
        adapter,
        signal: controller.signal,
        fetchFn,
        onEvent: handleStreamEvent,
      })
    }

    // 10. 保存 assistant 消息（空内容不保存）
    const assistantMsgId = randomUUID()
    if (accumulatedContent.trim()) {
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: accumulatedContent,
        createdAt: Date.now(),
        model: modelId,
        reasoning: accumulatedReasoning || undefined,
        toolActivities: accumulatedToolActivities.length > 0 ? accumulatedToolActivities : undefined,
      }
      appendMessage(conversationId, assistantMsg)

      // 更新对话索引的 updatedAt
      try {
        updateConversationMeta(conversationId, {})
      } catch {
        // 索引更新失败不影响主流程
      }
    } else {
      console.warn(`[聊天服务] 模型返回空内容，跳过保存 (对话 ${conversationId})`)
    }

    webContents.send(CHAT_IPC_CHANNELS.STREAM_COMPLETE, {
      conversationId,
      model: modelId,
      messageId: accumulatedContent.trim() ? assistantMsgId : undefined,
    })
  } catch (error) {
    // 被中止的请求：保存已输出的部分内容，通知前端停止
    if (controller.signal.aborted) {
      console.log(`[聊天服务] 对话 ${conversationId} 已被用户中止`)

      // 保存已累积的部分助手消息
      if (accumulatedContent) {
        const assistantMsgId = randomUUID()
        const partialMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: accumulatedContent,
          createdAt: Date.now(),
          model: modelId,
          reasoning: accumulatedReasoning || undefined,
          stopped: true,
          toolActivities: accumulatedToolActivities.length > 0 ? accumulatedToolActivities : undefined,
        }
        appendMessage(conversationId, partialMsg)

        try {
          updateConversationMeta(conversationId, {})
        } catch {
          // 索引更新失败不影响主流程
        }

        webContents.send(CHAT_IPC_CHANNELS.STREAM_COMPLETE, {
          conversationId,
          model: modelId,
          messageId: assistantMsgId,
        })
      } else {
        webContents.send(CHAT_IPC_CHANNELS.STREAM_COMPLETE, {
          conversationId,
          model: modelId,
        })
      }
      return
    }

    const errorMessage = error instanceof Error ? error.message : '未知错误'
    console.error(`[聊天服务] 流式请求失败:`, error)
    webContents.send(CHAT_IPC_CHANNELS.STREAM_ERROR, {
      conversationId,
      error: errorMessage,
    })
  } finally {
    activeControllers.delete(conversationId)
  }
}

/**
 * 中止指定对话的生成
 */
export function stopGeneration(conversationId: string): void {
  const controller = activeControllers.get(conversationId)
  if (controller) {
    controller.abort()
    activeControllers.delete(conversationId)
    console.log(`[聊天服务] 已中止对话: ${conversationId}`)
  }
}

/** 中止所有活跃的聊天流（应用退出时调用） */
export function stopAllGenerations(): void {
  if (activeControllers.size === 0) return
  console.log(`[聊天服务] 正在中止所有活跃对话 (${activeControllers.size} 个)...`)
  for (const [conversationId, controller] of activeControllers) {
    controller.abort()
    console.log(`[聊天服务] 已中止对话: ${conversationId}`)
  }
  activeControllers.clear()
}

// ===== 标题生成 =====

/** 标题生成 Prompt */
const TITLE_PROMPT = '根据用户的第一条消息，生成一个简短的对话标题（10字以内）。只输出标题，不要有任何其他内容、标点符号或引号。如果消息内容过短或无明确主题，直接使用原始消息作为标题。\n\n用户消息：'

/** 短消息阈值：低于此长度直接使用原文作为标题 */
const SHORT_MESSAGE_THRESHOLD = 4

/** 最大标题长度 */
const MAX_TITLE_LENGTH = 20

/**
 * 调用 AI 生成对话标题
 *
 * 使用与聊天相同的渠道和模型，发送非流式请求，
 * 让模型根据用户第一条消息生成简短标题。
 *
 * @param input 生成标题参数
 * @returns 生成的标题，失败时返回 null
 */
export async function generateTitle(input: GenerateTitleInput): Promise<string | null> {
  const { userMessage, channelId, modelId } = input
  console.log('[标题生成] 开始生成标题:', { channelId, modelId, userMessage: userMessage.slice(0, 50) })

  // 短消息直接使用原文作为标题，避免 AI 幻觉
  const trimmedMessage = userMessage.trim()
  if (trimmedMessage.length <= SHORT_MESSAGE_THRESHOLD) {
    const shortTitle = trimmedMessage.slice(0, MAX_TITLE_LENGTH)
    console.log('[标题生成] 消息过短，直接使用原文作为标题:', shortTitle)
    return shortTitle
  }

  // 查找渠道
  const channels = listChannels()
  const channel = channels.find((c) => c.id === channelId)
  if (!channel) {
    console.warn('[标题生成] 渠道不存在:', channelId)
    return null
  }

  // 解密 API Key
  let apiKey: string
  try {
    apiKey = decryptApiKey(channelId)
  } catch {
    console.warn('[标题生成] 解密 API Key 失败')
    return null
  }

  try {
    const adapter = getAdapter(channel.provider)
    const request = adapter.buildTitleRequest({
      baseUrl: channel.baseUrl,
      apiKey,
      modelId,
      prompt: TITLE_PROMPT + userMessage,
    })

    const proxyUrl = await getEffectiveProxyUrl()
    const fetchFn = getFetchFn(proxyUrl)
    const title = await fetchTitle(request, adapter, fetchFn)
    if (!title) {
      console.warn('[标题生成] API 返回空标题')
      return null
    }

    // 截断到最大长度并清理引号
    const cleaned = title.trim().replace(/^["'""'']+|["'""'']+$/g, '').trim()
    const result = cleaned.slice(0, MAX_TITLE_LENGTH) || null
    console.log('[标题生成] 成功生成标题:', result)
    return result
  } catch (error) {
    console.warn('[标题生成] 请求失败:', error)
    return null
  }
}

// ===== 提示词优化 =====

const OPTIMIZE_PROMPT_SYSTEM = `You are a prompt enhancement specialist. Your job is to transform the user's rough input into a well-articulated task description that an AI assistant can understand and execute precisely on the first try.

## Core Principles
- Preserve the user's original intent and domain exactly — do not add goals they didn't ask for, and do not shift the topic toward a different domain
- Use the conversation context to resolve ambiguity and fill in implicit references (e.g. "it", "that function", "the bug", "the article")
- Match the language of the original input (Chinese input → Chinese output, English → English)

## What to Include
Weave the following elements naturally into a coherent description — do NOT use explicit section headers like "Background:", "Task:", "Requirements:":

1. **Context**: If conversation history provides relevant background (what's been discussed, what exists already, what problem occurred), open with a brief situational lead-in. Skip this if there's no meaningful context.
2. **Objective**: Clearly state what needs to be done — this is the core of the prompt.
3. **Specifics & constraints**: Naturally incorporate any requirements, edge cases, style preferences, or technical constraints that are implied by the user's input or conversation context. Use bullet points only when listing 3+ parallel items; otherwise keep it in prose.

## Style
- Write it as one flowing description, like a well-written ticket or brief — not a form with labeled sections
- Keep the tone direct and professional
- For simple inputs, keep it concise (2-3 sentences). For complex inputs, a short paragraph plus a few bullet points is fine.
- Do not over-engineer simple asks — "写个排序函数" doesn't need three paragraphs

## Output Rules
- Return ONLY the enhanced prompt text — no explanations, no meta-commentary, no surrounding quotes
- Never start with "Please" or "I want you to" — write it as a direct task description`

/**
 * 根据消息内容智能截断，保留完整语义
 * - 短消息（≤300字符）：完整保留
 * - 长消息：保留前200字符 + 省略标记
 */
function smartTruncate(text: string, maxLen = 300): string {
  if (text.length <= maxLen) return text
  // 尝试在句子边界截断
  const cutoff = text.slice(0, maxLen)
  const lastSentenceEnd = Math.max(
    cutoff.lastIndexOf('。'),
    cutoff.lastIndexOf('.'),
    cutoff.lastIndexOf('\n'),
    cutoff.lastIndexOf('！'),
    cutoff.lastIndexOf('？'),
  )
  const breakPoint = lastSentenceEnd > maxLen * 0.5 ? lastSentenceEnd + 1 : maxLen
  return text.slice(0, breakPoint) + '...'
}

/**
 * 构建对话上下文，智能分配 token 预算
 * - 最近的消息保留更多内容，较早的消息更激进地截断
 * - user 消息比 assistant 消息更重要
 */
function buildConversationContext(
  recentMessages: Array<{ role: string; content: string | unknown }>,
): string {
  if (recentMessages.length === 0) return ''

  // 只保留 user 和 assistant 消息，过滤掉 tool/status 等内部消息
  const meaningful = recentMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-10)

  if (meaningful.length === 0) return ''

  const lines: string[] = ['<conversation_context>']

  for (let i = 0; i < meaningful.length; i++) {
    const msg = meaningful[i]!
    const role = msg.role === 'user' ? 'User' : 'Assistant'
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)

    // 越近的消息给越多空间；user 消息比 assistant 消息多 50%
    const recencyFactor = (i + 1) / meaningful.length // 0.1 ~ 1.0
    const roleFactor = msg.role === 'user' ? 1.5 : 1.0
    const maxLen = Math.round(150 * recencyFactor * roleFactor)

    lines.push(`[${role}]: ${smartTruncate(text, Math.max(maxLen, 80))}`)
  }

  lines.push('</conversation_context>')
  return lines.join('\n')
}

/**
 * 根据输入长度动态计算 maxTokens
 * - 极短输入（<20字符）：512 tokens（简洁任务简报）
 * - 中等输入（20-200字符）：768 tokens
 * - 长输入（>200字符）：1024 tokens（完整背景+任务+需求）
 */
function calcMaxTokens(inputLength: number): number {
  if (inputLength < 20) return 512
  if (inputLength < 200) return 768
  return 1024
}

/**
 * 优化用户提示词
 *
 * 使用 system/user 角色分离，智能上下文构建，
 * 将用户输入 + 对话上下文发送给 LLM，返回优化后的提示词。
 */
export async function optimizePrompt(input: PromptOptimizeInput): Promise<string | null> {
  const { userInput, recentMessages = [], channelId, modelId } = input
  console.log('[提示词优化] 开始:', { channelId, modelId, inputLength: userInput.length })

  if (!userInput.trim()) {
    return null
  }

  // 查找渠道
  const channels = listChannels()
  const channel = channels.find((c) => c.id === channelId)
  if (!channel) {
    console.warn('[提示词优化] 渠道不存在:', channelId)
    return null
  }

  // 解密 API Key
  let apiKey: string
  try {
    apiKey = decryptApiKey(channelId)
  } catch {
    console.warn('[提示词优化] 解密 API Key 失败')
    return null
  }

  // 构建 user message：上下文 + 用户输入
  const contextBlock = buildConversationContext(recentMessages)
  const userPrompt = contextBlock
    ? `${contextBlock}\n\n<user_input>\n${userInput}\n</user_input>`
    : userInput

  const maxTokens = calcMaxTokens(userInput.length)

  try {
    const adapter = getAdapter(channel.provider)
    const request = adapter.buildTitleRequest({
      baseUrl: channel.baseUrl,
      apiKey,
      modelId,
      systemPrompt: OPTIMIZE_PROMPT_SYSTEM,
      prompt: userPrompt,
      maxTokens,
    })

    const proxyUrl = await getEffectiveProxyUrl()
    const fetchFn = getFetchFn(proxyUrl)

    // 带重试的请求（最多 5 次，指数退避）
    const MAX_RETRIES = 5
    let lastError: unknown = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetchFn(request.url, {
          method: 'POST',
          headers: request.headers,
          body: request.body,
        })

        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after')
          const delay = retryAfter
            ? Math.min(Number(retryAfter) * 1000, 30_000)
            : Math.min(1000 * Math.pow(2, attempt - 1), 30_000) // 1s, 2s, 4s, 8s, 16s
          console.warn(`[提示词优化] 限流 429，第 ${attempt}/${MAX_RETRIES} 次重试，等待 ${delay}ms`)
          await new Promise((r) => setTimeout(r, delay))
          continue
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'unknown')
          console.warn('[提示词优化] 请求失败:', { status: response.status, error: errorText.slice(0, 500) })
          return null
        }

        const data: unknown = await response.json()
        const result = adapter.parseTitleResponse(data)

        if (!result) {
          console.warn('[提示词优化] API 返回空结果')
          return null
        }

        const cleaned = result.trim().replace(/^["'""'']+|["'""'']+$/g, '').trim()
        console.log('[提示词优化] 成功:', { resultLength: cleaned.length, attempt })
        return cleaned || null
      } catch (err) {
        lastError = err
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30_000)
          console.warn(`[提示词优化] 请求异常，第 ${attempt}/${MAX_RETRIES} 次重试，等待 ${delay}ms`, err)
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }

    console.warn(`[提示词优化] ${MAX_RETRIES} 次重试均失败:`, lastError)
    return null
  } catch (error) {
    console.warn('[提示词优化] 请求失败:', error)
    return null
  }
}
