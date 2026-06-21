import type { Provider, StatsIdentity } from '../../shared/types.js'
import type { LLMClientWithModel } from '../llm/client.js'
import type { SessionManager } from '../session/index.js'
import { getEventStore, getCurrentWindowMessageOptions, getCurrentContextWindowId } from '../events/index.js'
import { shouldCompact } from './compactor.js'
import { COMPACTION_PROMPT, buildBasePrompt } from '../chat/prompts.js'
import { createMessageStartEvent, createMessageDoneEvent, createChatDoneEvent } from '../chat/stream-pure.js'
import { streamLLMPure, consumeStreamGenerator } from '../chat/stream-pure.js'
import { getConversationMessages, processEventsForConversation } from '../chat/conversation-history.js'
import { getRuntimeConfig } from '../runtime-config.js'
import { logger } from '../utils/logger.js'

interface ContextCompactionOptions {
  sessionManager: SessionManager
  sessionId: string
  llmClient: LLMClientWithModel
  statsIdentity: StatsIdentity
  signal?: AbortSignal
}

/**
 * Check compaction threshold and append the compaction prompt to the event store.
 * The actual summarization happens on the next LLM call in the agent loop (auto-compaction)
 * or via compactContext() (manual compaction).
 * Returns true if the prompt was appended.
 */
export async function appendCompactionPrompt(options: ContextCompactionOptions): Promise<boolean> {
  const config = getRuntimeConfig()
  const contextState = options.sessionManager.getContextState(options.sessionId)
  if (!shouldCompact(contextState.currentTokens, contextState.maxTokens, config.context.compactionThreshold)) {
    return false
  }

  const eventStore = getEventStore()
  const compactPromptMsgId = crypto.randomUUID()
  eventStore.append(
    options.sessionId,
    createMessageStartEvent(compactPromptMsgId, 'user', COMPACTION_PROMPT, {
      ...(getCurrentWindowMessageOptions(options.sessionId) ?? {}),
      isSystemGenerated: true,
      messageKind: 'auto-prompt',
      metadata: { type: 'compaction', name: 'Compaction', color: '#64748b' },
    }),
  )
  eventStore.append(options.sessionId, { type: 'message.done', data: { messageId: compactPromptMsgId } })

  logger.info('Compaction prompt appended', {
    sessionId: options.sessionId,
    tokensBefore: contextState.currentTokens,
  })

  return true
}

/**
 * Perform context compaction immediately (for manual compaction via WebSocket).
 * Appends the compaction prompt, calls the LLM for a summary, and emits
 * context.compacted + summary events. Uses a direct LLM call — no agent loop.
 */
export async function compactContext(options: ContextCompactionOptions): Promise<void> {
  const { sessionManager, sessionId, llmClient, signal } = options
  const eventStore = getEventStore()
  const session = sessionManager.requireSession(sessionId)

  // 1. Append compaction prompt
  const compactPromptMsgId = crypto.randomUUID()
  eventStore.append(
    sessionId,
    createMessageStartEvent(compactPromptMsgId, 'user', COMPACTION_PROMPT, {
      ...(getCurrentWindowMessageOptions(sessionId) ?? {}),
      isSystemGenerated: true,
      messageKind: 'auto-prompt',
      metadata: { type: 'compaction', name: 'Compaction', color: '#64748b' },
    }),
  )
  eventStore.append(sessionId, { type: 'message.done', data: { messageId: compactPromptMsgId } })

  // 2. Get conversation messages (includes the compaction prompt)
  const processedEvents = await processEventsForConversation(sessionId, llmClient, (event) => {
    eventStore.append(sessionId, event)
  })
  const messages = getConversationMessages({ type: 'toplevel', sessionId }, { events: processedEvents })

  // 3. Use cached system prompt to preserve vLLM prefix cache
  const cached = sessionManager.getCachedPrompt(sessionId)
  const systemPrompt = cached?.systemPrompt ?? buildBasePrompt(session.workdir)

  // 4. Emit message.start before streaming (same pattern as agent loop)
  const assistantMsgId = crypto.randomUUID()
  eventStore.append(
    sessionId,
    createMessageStartEvent(assistantMsgId, 'assistant', undefined, {
      ...(getCurrentWindowMessageOptions(sessionId) ?? {}),
    }),
  )

  // 5. Call LLM for summary
  const streamGen = streamLLMPure({
    messageId: assistantMsgId,
    systemPrompt,
    llmClient,
    messages,
    tools: [],
    toolChoice: 'none',
    signal,
  })

  const result = await consumeStreamGenerator(streamGen, (event) => {
    eventStore.append(sessionId, event)
  })

  // 6. Extract summary — gracefully handle empty result
  const summary = result.content?.trim() || result.thinkingContent?.trim() || ''
  if (!summary) {
    eventStore.append(sessionId, {
      type: 'chat.error',
      data: { error: 'Compaction produced empty summary, continuing with full context', recoverable: true },
    })
    logger.warn('Compaction produced empty summary', { sessionId })
    return
  }

  // 7. Emit compaction events (overwrites the pre-stream message.start with summary)
  const closedWindowId = getCurrentContextWindowId(sessionId) ?? ''
  const newWindowId = crypto.randomUUID()

  eventStore.append(sessionId, {
    type: 'context.compacted',
    data: { closedWindowId, newWindowId, beforeTokens: result.usage.promptTokens, afterTokens: 0, summary },
  })

  eventStore.append(sessionId, {
    type: 'message.start',
    data: {
      messageId: assistantMsgId,
      role: 'assistant',
      content: summary,
      contextWindowId: newWindowId,
      isCompactionSummary: true,
    },
  })
  eventStore.append(sessionId, createMessageDoneEvent(assistantMsgId, {}))
  eventStore.append(sessionId, createChatDoneEvent(assistantMsgId, 'complete'))

  logger.info('Manual compaction complete', { sessionId })
}

export function resolveCompactionStatsIdentity(
  llmClient: LLMClientWithModel,
  getActiveProvider?: () => Provider | undefined,
): StatsIdentity {
  const provider = getActiveProvider?.()
  const model = llmClient.getModel()
  const backend = llmClient.getBackend?.() ?? 'unknown'

  return {
    providerId: provider?.id ?? `provider:${model}`,
    providerName: provider?.name ?? 'Unknown Provider',
    backend,
    model,
  }
}
