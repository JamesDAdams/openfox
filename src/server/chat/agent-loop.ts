/**
 * Unified Agent Execution Loop
 *
 * Extracts the shared execution logic from runPlannerTurn, runBuilderTurn,
 * and executeSubAgent into reusable helpers.
 *
 * - executeToolBatch(): shared tool execution (used by all agent types)
 * - runTopLevelAgentLoop(): replaces duplicated planner/builder turns
 */

import type { InjectedFile, PromptContext, StatsIdentity, ToolCall, ToolMode, ToolResult } from '../../shared/types.js'
import type { ServerMessage } from '../../shared/protocol.js'
import type { LLMClientWithModel } from '../llm/client.js'
import type { LLMToolDefinition } from '../llm/types.js'
import type { SessionManager } from '../session/index.js'
import type { ToolRegistry } from '../tools/types.js'
import type { RequestContextMessage, MinimalMessage, AssemblyResult } from './request-context.js'
import type { RetryPatternConfig } from './auto-patterns.js'
import { createAssemblyResult } from './request-context.js'
import {
  streamLLMPure,
  consumeStreamGenerator,
  TurnMetrics,
  createMessageStartEvent,
  createMessageDoneEvent,
  createChatDoneEvent,
} from './stream-pure.js'
import { getSetting, SETTINGS_KEYS } from '../db/settings.js'
import { getCurrentContextWindowId } from '../events/index.js'
import { maybeAutoCompactContext } from '../context/auto-compaction.js'
import { getAllInstructions } from '../context/instructions.js'
import { getEnabledSkillMetadata } from '../skills/registry.js'
import { getRuntimeConfig } from '../runtime-config.js'
import { getGlobalConfigDir } from '../../cli/paths.js'
import {
  createQueueStateMessage,
  createChatMessageMessage,
  createChatDoneMessage,
  createChatMessageUpdatedMessage,
} from '../ws/protocol.js'
import { getConversationMessages } from './conversation-history.js'
import { getEventStore } from '../events/index.js'
import { processContextImages } from '../context/image-processor.js'
import { modelSupportsVision } from '../llm/profiles.js'
import { executeTools, type ToolBatchContext } from './execute-tools.js'
import { createRetryLimiter, type RetryLimiter } from './retry-limiter.js'

async function loadVisionModelFromGlobalConfig(): Promise<
  { baseUrl: string; model: string; timeout: number } | undefined
> {
  try {
    const { loadGlobalConfig, getVisionFallback } = await import('../../cli/config.js')
    const runtimeConfig = getRuntimeConfig()
    const mode = runtimeConfig.mode ?? 'production'
    const globalConfig = await loadGlobalConfig(mode)
    const fallback = getVisionFallback(globalConfig)
    if (fallback?.enabled && fallback.model) {
      return { baseUrl: fallback.url, model: fallback.model, timeout: fallback.timeout * 1000 }
    }
  } catch {
    // Global config not available
  }
  return undefined
}

function emitPartialDoneEvents(
  _sessionId: string,
  assistantMsgId: string,
  statsIdentity: import('../../shared/types.js').StatsIdentity,
  mode: import('../../shared/types.js').ToolMode,
  turnMetrics: TurnMetrics,
  promptContext: PromptContext,
  append: (event: import('../events/types.js').TurnEvent) => void,
): void {
  const stats = turnMetrics.buildStats(statsIdentity, mode)
  append(
    createMessageDoneEvent(assistantMsgId, {
      stats,
      partial: true,
      promptContext,
    }),
  )
  append(createChatDoneEvent(assistantMsgId, 'stopped', stats))
}

// ============================================================================
// Types
// ============================================================================

export interface TopLevelLoopConfig {
  mode: ToolMode
  loopMode?: 'normal' | 'compaction'
  retryPatterns?: RetryPatternConfig[]
  maxRetriesPerTurn?: number
  /** Function to append events (provided by orchestrator) */
  append: (event: import('../events/types.js').TurnEvent) => void
  /** If provided, use this cached system prompt instead of assembling fresh */
  cachedSystemPrompt?: string
  sessionManager: SessionManager
  sessionId: string
  llmClient: LLMClientWithModel
  statsIdentity: StatsIdentity
  signal?: AbortSignal | undefined
  onMessage?: ((msg: ServerMessage) => void) | undefined
  assembleRequest: (input: {
    workdir: string
    messages: RequestContextMessage[]
    injectedFiles: InjectedFile[]
    promptTools: LLMToolDefinition[]
    toolChoice: 'auto' | 'none' | 'required'
    customInstructions?: string
    skills?: import('../skills/types.js').SkillMetadata[]
  }) => {
    systemPrompt: string
    messages: MinimalMessage[]
    promptContext: PromptContext
  }
  getToolRegistry: () => ToolRegistry
  onToolExecuted?: ((toolCall: ToolCall, result: ToolResult) => void) | undefined
  injectKickoff?: (() => void) | undefined
}

// ============================================================================
// Shared Tool Execution
// ============================================================================

function getCurrentWindowMessageOptions(sessionId: string): { contextWindowId: string } | undefined {
  const contextWindowId = getCurrentContextWindowId(sessionId)
  return contextWindowId ? { contextWindowId } : undefined
}

// ============================================================================
// Top-Level Agent Loop (replaces runPlannerTurn / runBuilderTurn)
// ============================================================================

const MAX_TRUNCATION_RETRIES = 3
const CONTINUE_PROMPT = 'Continue your previous response. Do NOT repeat what you already wrote.'

export async function runTopLevelAgentLoop(
  config: TopLevelLoopConfig,
  turnMetrics: TurnMetrics,
): Promise<{ returnValueContent?: string; returnValueResult?: string }> {
  const { mode, sessionManager, sessionId, llmClient, signal, onMessage, statsIdentity } = config
  const append = config.append

  const retryLimiter: RetryLimiter = createRetryLimiter(config.maxRetriesPerTurn ?? 10)
  let truncationRetryCount = 0
  let returnValueContent: string | undefined
  let returnValueResult: string | undefined
  let currentMaxTokensOverride: number | undefined
  let lastPatternMatch: { pattern: string; field: string; matchedContent: string } | undefined

  for (;;) {
    if (config.loopMode !== 'compaction') {
      await maybeAutoCompactContext({
        sessionManager,
        sessionId,
        llmClient,
        statsIdentity,
        ...(signal ? { signal } : {}),
      })
    }

    if (signal?.aborted) throw new Error('Aborted')

    const session = sessionManager.requireSession(sessionId)

    // Inject kickoff prompt (e.g., builder kickoff) on first iteration
    if (retryLimiter.count() === 0) {
      config.injectKickoff?.()
    }

    const { content: instructionContent, files } = await getAllInstructions(session.workdir, session.projectId)
    if (signal?.aborted) throw new Error('Aborted')

    const injectedFiles: InjectedFile[] = files.map((f) => ({
      path: f.path,
      content: f.content ?? '',
      source: f.source,
    }))

    const toolRegistry = config.getToolRegistry()
    const currentWindowMessageOptions = getCurrentWindowMessageOptions(sessionId)

    const modelName = llmClient.getModel()
    const modelVision = modelSupportsVision(modelName)

    // Process images in context: describe via vision model or replace with placeholder
    const eventStore = getEventStore()
    const rawEvents = eventStore.getEvents(sessionId)
    const runtimeConfig = getRuntimeConfig()
    const visionModel = runtimeConfig.llm.visionModel
      ? { baseUrl: runtimeConfig.llm.baseUrl, model: runtimeConfig.llm.visionModel, timeout: runtimeConfig.llm.timeout }
      : await loadVisionModelFromGlobalConfig()
    const { events: processedEvents } = await processContextImages(rawEvents, {
      modelSupportsVision: modelVision,
      ...(visionModel ? { visionModel } : {}),
      onEvent: (event) => append(event),
    })

    const requestMessages = getConversationMessages({ type: 'toplevel', sessionId }, { events: processedEvents })

    if (retryLimiter.count() > 0) {
      const continueMsgId = crypto.randomUUID()
      const continueContent = lastPatternMatch
        ? `Your previous response was interrupted because it matched pattern "${lastPatternMatch.pattern}" in ${lastPatternMatch.field}.\nMatched content:\n${lastPatternMatch.matchedContent}\n\n${CONTINUE_PROMPT}`
        : CONTINUE_PROMPT
      append(
        createMessageStartEvent(continueMsgId, 'user', continueContent, {
          ...(currentWindowMessageOptions ?? {}),
          isSystemGenerated: true,
          messageKind: 'correction',
        }),
      )
      append({ type: 'message.done', data: { messageId: continueMsgId } })
      requestMessages.push({ role: 'user', content: continueContent, source: 'history' })
    }

    const configDir = getGlobalConfigDir(runtimeConfig.mode ?? 'production')
    const skills = await getEnabledSkillMetadata(configDir, runtimeConfig.workdir)
    if (signal?.aborted) throw new Error('Aborted')

    const isDynamicMode = getSetting(SETTINGS_KEYS.LLM_DYNAMIC_SYSTEM_PROMPT) === 'true'

    const assembleFreshRequest = () =>
      config.assembleRequest({
        workdir: session.workdir,
        messages: requestMessages,
        injectedFiles,
        promptTools: toolRegistry.definitions,
        toolChoice: 'auto',
        ...(instructionContent ? { customInstructions: instructionContent } : {}),
        ...(skills.length > 0 ? { skills } : {}),
      })

    let assembledRequest: AssemblyResult

    if (config.cachedSystemPrompt && !isDynamicMode) {
      assembledRequest = createAssemblyResult({
        systemPrompt: config.cachedSystemPrompt,
        messages: requestMessages,
        injectedFiles,
        requestTools: toolRegistry.definitions,
        toolChoice: 'auto',
        disableThinking: false,
      })
    } else {
      assembledRequest = assembleFreshRequest()
    }

    const assistantMsgId = crypto.randomUUID()
    append(createMessageStartEvent(assistantMsgId, 'assistant', undefined, currentWindowMessageOptions))

    const previousContextTokens = sessionManager.getContextState(sessionId).currentTokens

    const modelSettings =
      currentMaxTokensOverride !== undefined
        ? { ...sessionManager.getCurrentModelSettings(), maxTokens: currentMaxTokensOverride }
        : sessionManager.getCurrentModelSettings()

    const streamGen = streamLLMPure({
      messageId: assistantMsgId,
      systemPrompt: assembledRequest.systemPrompt,
      llmClient,
      messages: assembledRequest.messages,
      tools: toolRegistry.definitions,
      toolChoice: 'auto',
      signal,
      ...(config.retryPatterns ? { retryPatterns: config.retryPatterns } : {}),
      ...(modelSettings && { modelSettings }),
    })

    const result = await consumeStreamGenerator(streamGen, (event) => {
      append(event)
    })

    // Check if a retry pattern matched mid-stream
    if (result.patternMatch) {
      if (!retryLimiter.canRetry()) {
        append({
          type: 'chat.error',
          data: { error: `Auto-retry limit exceeded after ${retryLimiter.maxRetries()} retries`, recoverable: false },
        })
        append(createChatDoneEvent(assistantMsgId, 'error'))
        throw new Error('Auto-retry limit exceeded')
      }
      retryLimiter.increment()
      lastPatternMatch = {
        pattern: result.patternMatch.pattern,
        field: result.patternMatch.field,
        matchedContent: result.patternMatch.matchedContent,
      }

      // Emit pattern.retry event
      append({
        type: 'pattern.retry',
        data: {
          messageId: assistantMsgId,
          pattern: result.patternMatch.pattern,
          field: result.patternMatch.field,
          attempt: retryLimiter.count(),
          maxAttempts: retryLimiter.maxRetries(),
          matchedContent: result.patternMatch.matchedContent,
        },
      })

      // Emit system message showing what matched
      const matchMsgId = crypto.randomUUID()
      const matchMessage = `Pattern "${result.patternMatch.pattern}" matched — auto-retry #${retryLimiter.count()}`
      append(
        createMessageStartEvent(matchMsgId, 'user', matchMessage, {
          ...(currentWindowMessageOptions ?? {}),
          isSystemGenerated: true,
          messageKind: 'correction',
        }),
      )
      append({ type: 'message.done', data: { messageId: matchMsgId } })

      continue
    }

    if (result.aborted) {
      emitPartialDoneEvents(
        sessionId,
        assistantMsgId,
        statsIdentity,
        mode,
        turnMetrics,
        assembledRequest.promptContext,
        append,
      )
      throw new Error('Aborted')
    }

    turnMetrics.addLLMCall(
      result.timing,
      result.usage.promptTokens,
      result.usage.completionTokens,
      previousContextTokens,
      result.modelParams,
    )
    sessionManager.setCurrentContextSize(sessionId, result.usage.promptTokens)

    // Check compaction threshold with fresh promptTokens from LLM
    if (config.loopMode !== 'compaction') {
      const contextState = sessionManager.getContextState(sessionId)
      const runtimeConfig = getRuntimeConfig()
      const { shouldCompact } = await import('../context/compactor.js')
      if (
        shouldCompact(contextState.currentTokens, contextState.maxTokens, runtimeConfig.context.compactionThreshold)
      ) {
        const { maybeAutoCompactContext } = await import('../context/auto-compaction.js')
        await maybeAutoCompactContext({
          sessionManager,
          sessionId,
          llmClient,
          statsIdentity,
          ...(signal ? { signal } : {}),
        })
      }
    }

    if (result.finishReason === 'length' && result.toolCalls.length === 0) {
      if (truncationRetryCount < MAX_TRUNCATION_RETRIES) {
        truncationRetryCount += 1
        const currentMaxTokens = result.modelParams?.maxTokens ?? 16384
        const promptTokens = result.usage.promptTokens
        const contextWindow = sessionManager.getCurrentModelContext()
        const newMaxTokens = Math.min(Math.floor(currentMaxTokens * 1.5), contextWindow - promptTokens - 2048)
        currentMaxTokensOverride = newMaxTokens
        // Finalize the truncated assistant message so the frontend properly closes it
        const interimStats = turnMetrics.buildStats(statsIdentity, mode)
        append(
          createMessageDoneEvent(assistantMsgId, {
            segments: result.segments,
            stats: interimStats,
            promptContext: assembledRequest.promptContext,
          }),
        )
        // Tell the frontend to fold the streaming message back into messages
        onMessage?.(createChatMessageUpdatedMessage(assistantMsgId, { isStreaming: false }))
        // Emit continue message to event store so getConversationMessages picks it up next iteration
        // We don't broadcast it via WebSocket, so the frontend won't see it
        const continueMsgId = crypto.randomUUID()
        append(
          createMessageStartEvent(
            continueMsgId,
            'user',
            'Continue your previous response exactly where you left off.',
            {
              ...(currentWindowMessageOptions ?? {}),
              isSystemGenerated: true,
            },
          ),
        )
        append({ type: 'message.done', data: { messageId: continueMsgId } })
        continue
      } else {
        // Exhausted retries, emit truncated
        const stats = turnMetrics.buildStats(statsIdentity, mode)
        append(
          createMessageDoneEvent(assistantMsgId, {
            segments: result.segments,
            stats,
            partial: true,
            promptContext: assembledRequest.promptContext,
          }),
        )
        append(createChatDoneEvent(assistantMsgId, 'truncated', stats))
        break
      }
    }

    if (result.toolCalls.length > 0) {
      if (config.loopMode === 'compaction') {
        const rejectionMsgId = crypto.randomUUID()
        append(
          createMessageStartEvent(
            rejectionMsgId,
            'user',
            'Compaction in progress — tool calls are not possible at this stage. Only produce a summary for compaction purposes.',
            {
              ...(currentWindowMessageOptions ?? {}),
              isSystemGenerated: true,
              messageKind: 'correction',
            },
          ),
        )
        append({ type: 'message.done', data: { messageId: rejectionMsgId } })
        retryLimiter.reset()
        continue
      }

      append(
        createMessageDoneEvent(assistantMsgId, {
          segments: result.segments,
          promptContext: assembledRequest.promptContext,
        }),
      )

      try {
        const batchContext: ToolBatchContext = {
          toolRegistry,
          sessionManager,
          sessionId,
          workdir: session.workdir,
          turnMetrics,
          signal,
          onMessage,
          llmClient,
          statsIdentity,
          onToolExecuted: config.onToolExecuted,
        }
        if (session.dangerLevel) {
          batchContext.dangerLevel = session.dangerLevel
        }
        batchContext.agentTimeout = getRuntimeConfig().agent.toolTimeout
        const batchResult = await executeTools(assistantMsgId, result.toolCalls, batchContext, append)
        if (batchResult.returnValueContent) {
          returnValueContent = batchResult.returnValueContent
        }
        if (batchResult.returnValueResult) {
          returnValueResult = batchResult.returnValueResult
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'Aborted') {
          emitPartialDoneEvents(
            sessionId,
            assistantMsgId,
            statsIdentity,
            mode,
            turnMetrics,
            assembledRequest.promptContext,
            append,
          )
          throw error
        }
        throw error
      }

      if (signal?.aborted) {
        emitPartialDoneEvents(
          sessionId,
          assistantMsgId,
          statsIdentity,
          mode,
          turnMetrics,
          assembledRequest.promptContext,
          append,
        )
        throw new Error('Aborted')
      }

      const asapMessages = sessionManager.drainAsapMessages(sessionId)
      for (const asap of asapMessages) {
        const asapMsgId = crypto.randomUUID()
        append(
          createMessageStartEvent(asapMsgId, 'user', asap.content, {
            ...getCurrentWindowMessageOptions(sessionId),
            ...(asap.attachments ? { attachments: asap.attachments } : {}),
          }),
        )
        append({ type: 'message.done', data: { messageId: asapMsgId } })

        // Broadcast message events to frontend so it knows about the user message
        // before tool.preparing events arrive for the assistant response
        const message: import('../../shared/types.js').Message = {
          id: asapMsgId,
          role: 'user',
          content: asap.content,
          timestamp: new Date().toISOString(),
          ...(asap.attachments ? { attachments: asap.attachments } : {}),
        }
        onMessage?.(createChatMessageMessage(message))
        onMessage?.(createChatDoneMessage(asapMsgId, 'complete'))
      }
      if (asapMessages.length > 0) {
        onMessage?.(createQueueStateMessage(sessionManager.getQueueState(sessionId)))
      }

      retryLimiter.reset()
      continue
    }

    if (config.loopMode === 'compaction') {
      const summary = result.content?.trim() || result.thinkingContent?.trim() || ''
      if (!summary) {
        append({
          type: 'chat.error',
          data: { error: 'Compaction produced empty summary', recoverable: false },
        })
        append(createChatDoneEvent(assistantMsgId, 'error'))
        throw new Error('Compaction produced empty summary')
      }

      const closedWindowId = getCurrentContextWindowId(sessionId) ?? ''
      const newWindowId = crypto.randomUUID()
      const tokenCountAtClose = result.usage.promptTokens

      append({
        type: 'context.compacted',
        data: { closedWindowId, newWindowId, beforeTokens: tokenCountAtClose, afterTokens: 0, summary },
      })

      append({
        type: 'message.start',
        data: {
          messageId: assistantMsgId,
          role: 'assistant',
          content: summary,
          contextWindowId: closedWindowId,
          isCompactionSummary: true,
        },
      })
      append(createMessageDoneEvent(assistantMsgId, { stats: turnMetrics.buildStats(statsIdentity, mode) }))
      append(createChatDoneEvent(assistantMsgId, 'complete'))

      break
    }

    const stats = turnMetrics.buildStats(statsIdentity, mode)
    append(
      createMessageDoneEvent(assistantMsgId, {
        segments: result.segments,
        stats,
        promptContext: assembledRequest.promptContext,
      }),
    )
    append(createChatDoneEvent(assistantMsgId, 'complete', stats))

    const currentWindowMessages = sessionManager.getCurrentWindowMessages(sessionId)
    const lastUserMessage = [...currentWindowMessages].reverse().find((m) => m.role === 'user')
    if (lastUserMessage) {
      sessionManager.updateMessage(sessionId, lastUserMessage.id, { promptContext: assembledRequest.promptContext })
    }

    break
  }

  return {
    ...(returnValueContent ? { returnValueContent } : {}),
    ...(returnValueResult ? { returnValueResult } : {}),
  }
}
