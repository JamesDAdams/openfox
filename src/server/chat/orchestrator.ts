/**
 * Chat Orchestrator
 *
 * Orchestrates chat turns by:
 * 1. Consuming pure generators that yield TurnEvents
 * 2. Appending events to EventStore
 * 3. Executing tools and yielding tool events
 * 4. Creating snapshots at end of turn
 *
 * This is the ONE place where events get appended to the store.
 */

import type { MessageStats, StatsIdentity, ToolCall, ToolResult } from '../../shared/types.js'
import type { ServerMessage } from '../../shared/protocol.js'
import type { LLMClientWithModel } from '../llm/client.js'
import type { SessionSnapshot } from '../events/types.js'
import type { AgentDefinition } from '../agents/types.js'
import { getEventStore, getCurrentContextWindowId, getCurrentWindowMessageOptions } from '../events/index.js'
import { buildSnapshotFromSessionState } from '../events/folding.js'
import type { SessionManager } from '../session/index.js'
import { getToolRegistryForAgent, PathAccessDeniedError, type ToolRegistry } from '../tools/index.js'
import { BUILDER_KICKOFF_PROMPT, VERIFIER_KICKOFF_PROMPT, buildAgentReminder } from './prompts.js'
import {
  TurnMetrics,
  createMessageStartEvent,
  createMessageDoneEvent,
  createToolCallEvent,
  createToolResultEvent,
  createChatDoneEvent,
} from './stream-pure.js'
import { assembleAgentRequest } from './request-context.js'
import type { RequestContextMessage } from './request-context.js'
import { resolveCachedAssembly } from './system-prompt-cache.js'
import { runTopLevelAgentLoop } from './agent-loop.js'
import { executeSubAgent } from '../sub-agents/manager.js'
import { createVerifierNudgeConfig } from '../sub-agents/verifier-helpers.js'
import { loadAllAgentsDefault, findAgentById, getSubAgents } from '../agents/registry.js'
import { getAllInstructions } from '../context/instructions.js'
import { getEnabledSkillMetadata } from '../skills/registry.js'
import { getRuntimeConfig } from '../runtime-config.js'
import { getGlobalConfigDir } from '../../cli/paths.js'
import { logger } from '../utils/logger.js'
import type { RetryPatternConfig } from './auto-patterns.js'
import { processContextImages, loadVisionModelFromGlobalConfig } from '../context/image-processor.js'
import { modelSupportsVision } from '../llm/profiles.js'
import { getConversationMessages } from './conversation-history.js'

// Re-export for runner orchestrator
export {
  TurnMetrics,
  createMessageStartEvent,
  createMessageDoneEvent,
  createToolCallEvent,
  createToolResultEvent,
  createChatDoneEvent,
}

async function buildRetryPatterns(): Promise<{ retryPatterns: RetryPatternConfig[]; maxRetriesPerTurn: number }> {
  const { getSetting, SETTINGS_KEYS } = await import('../db/settings.js')
  const raw = getSetting(SETTINGS_KEYS.RETRY_PATTERNS)
  if (!raw) {
    // Migration: check old llm.disableXmlProtection setting
    const oldXmlProtection = getSetting('llm.disableXmlProtection')
    if (oldXmlProtection !== null) {
      // User had the old setting — migrate to retry patterns
      const disabled = oldXmlProtection === 'true'
      return {
        retryPatterns: disabled
          ? []
          : [{ field: 'both', pattern: '<(tool_call|function=|/tool_call|parameter=)', action: 'retry', active: true }],
        maxRetriesPerTurn: 10,
      }
    }
    return { retryPatterns: [], maxRetriesPerTurn: 10 }
  }
  try {
    const parsed = JSON.parse(raw)
    return {
      retryPatterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
      maxRetriesPerTurn: typeof parsed.maxRetriesPerTurn === 'number' ? parsed.maxRetriesPerTurn : 10,
    }
  } catch {
    return { retryPatterns: [], maxRetriesPerTurn: 10 }
  }
}

function buildGetConversationMessages(
  sessionId: string,
  llmClient: LLMClientWithModel,
  append: (event: import('../events/types.js').TurnEvent) => void,
): () => Promise<RequestContextMessage[]> {
  return async () => {
    const eventStore = getEventStore()
    const rawEvents = eventStore.getEvents(sessionId)
    const modelVision = modelSupportsVision(llmClient.getModel())
    const runtimeConfig = getRuntimeConfig()
    const visionModel = runtimeConfig.llm.visionModel
      ? { baseUrl: runtimeConfig.llm.baseUrl, model: runtimeConfig.llm.visionModel, timeout: runtimeConfig.llm.timeout }
      : await loadVisionModelFromGlobalConfig()
    const { events: processedEvents } = await processContextImages(rawEvents, {
      modelSupportsVision: modelVision,
      ...(visionModel ? { visionModel } : {}),
      onEvent: (event) => append(event),
    })
    return getConversationMessages({ type: 'toplevel', sessionId }, { events: processedEvents })
  }
}

// ============================================================================
// Types
// ============================================================================

export interface OrchestratorOptions {
  sessionManager: SessionManager
  sessionId: string
  llmClient: LLMClientWithModel
  statsIdentity?: StatsIdentity
  signal?: AbortSignal
  injectBuilderKickoff?: boolean
  /** Optional callback for WebSocket forwarding (temporary, until WS layer is refactored) */
  onMessage?: (msg: ServerMessage) => void
}

function resolveStatsIdentity(options: OrchestratorOptions): StatsIdentity {
  const model = options.llmClient.getModel()

  if (options.statsIdentity) {
    return {
      ...options.statsIdentity,
      model,
    }
  }

  return {
    providerId: `provider:${model}`,
    providerName: 'Unknown Provider',
    backend: 'unknown',
    model,
  }
}

// ============================================================================
// Core Orchestrator
// ============================================================================

/**
 * Run a chat turn in the current mode.
 * Appends all events to EventStore and creates a snapshot at end of turn.
 */
export async function runChatTurn(options: OrchestratorOptions): Promise<void> {
  const { sessionManager, sessionId } = options
  const eventStore = getEventStore()
  const statsIdentity = resolveStatsIdentity(options)

  const session = sessionManager.requireSession(sessionId)
  const mode = session.mode

  logger.debug('Starting chat turn', { sessionId, mode })

  // Mark session as running (cleared in finally)
  sessionManager.setRunning(sessionId, true)

  // Create append closure — the only write path to EventStore from the loop
  const append = (event: import('../events/types.js').TurnEvent) => eventStore.append(sessionId, event)

  // Track metrics across the turn
  const turnMetrics = new TurnMetrics()

  try {
    // Run the appropriate handler based on mode (agent ID)
    if (mode === 'builder') {
      await runBuilderTurn(options, turnMetrics, append)
    } else {
      await runGenericAgentTurn(options, turnMetrics, mode, append)
    }

    // Create end-of-turn snapshot
    const snapshot = buildSnapshot(sessionManager, sessionId, turnMetrics.buildStats(statsIdentity, mode))
    const snapshotEvent = eventStore.append(sessionId, { type: 'turn.snapshot', data: snapshot })

    const deletedCount = eventStore.cleanupOldEvents(sessionId)
    if (deletedCount > 0) {
      logger.debug('Cleaned up old events after snapshot', { sessionId, deletedCount, snapshotSeq: snapshotEvent.seq })
    }
  } catch (error) {
    if (error instanceof PathAccessDeniedError) {
      const errorMsgId = crypto.randomUUID()
      const reasonText =
        error.reason === 'sensitive_file'
          ? 'sensitive files that may contain secrets'
          : error.reason === 'both'
            ? 'files outside the project and sensitive files'
            : 'files outside the project directory'
      eventStore.append(sessionId, {
        type: 'chat.error',
        data: {
          error: `User denied access to ${reasonText}.`,
          recoverable: false,
        },
      })
      eventStore.append(
        sessionId,
        createMessageStartEvent(
          errorMsgId,
          'user',
          `Access denied: ${error.paths.join(', ')}. If you need this file, explain why and ask the user for permission.`,
          {
            ...(getCurrentWindowMessageOptions(sessionId) ?? {}),
            isSystemGenerated: true,
            messageKind: 'correction',
          },
        ),
      )
      eventStore.append(sessionId, createChatDoneEvent(errorMsgId, 'error'))
      return
    }

    if (error instanceof Error && error.message === 'Aborted') {
      const snapshot = buildSnapshot(sessionManager, sessionId, turnMetrics.buildStats(statsIdentity, mode))
      eventStore.append(sessionId, { type: 'turn.snapshot', data: snapshot })
      return
    }

    logger.error('Chat turn error', { sessionId, mode, error })
    const errorMsgId = crypto.randomUUID()
    eventStore.append(sessionId, {
      type: 'chat.error',
      data: {
        error: error instanceof Error ? error.message : 'Unknown error',
        recoverable: false,
      },
    })
    eventStore.append(
      sessionId,
      createMessageStartEvent(
        errorMsgId,
        'user',
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          ...(getCurrentWindowMessageOptions(sessionId) ?? {}),
          isSystemGenerated: true,
          messageKind: 'correction',
        },
      ),
    )
    eventStore.append(sessionId, createChatDoneEvent(errorMsgId, 'error'))
  } finally {
    eventStore.append(sessionId, { type: 'running.changed', data: { isRunning: false } })
  }
}

// ============================================================================
// Generic Agent Turn (works for planner, custom agents, etc.)
// ============================================================================

/**
 * Check if a given context window already has a system reminder message.
 * Scans events for a message.start in the given window with messageKind 'auto-prompt'
 * and content containing '<system-reminder>'.
 */
function windowHasReminder(sessionId: string, windowId: string): boolean {
  const eventStore = getEventStore()
  const events = eventStore.getEvents(sessionId)

  return events.some((event) => {
    if (event.type !== 'message.start') return false
    const data = event.data as { contextWindowId?: string; messageKind?: string; content?: string }
    return (
      data.contextWindowId === windowId &&
      data.messageKind === 'auto-prompt' &&
      typeof data.content === 'string' &&
      data.content.includes('<system-reminder>')
    )
  })
}

/**
 * Inject system reminder on mode switch or when current window lacks one.
 * Tracks last mode in session state to avoid re-injecting on subsequent turns
 * within the same context window. After compaction creates a new window,
 * the reminder is reinjected because the new window won't have one.
 */
function injectModeReminderIfNeeded(
  sessionManager: SessionManager,
  sessionId: string,
  agentId: string,
  allAgents: AgentDefinition[],
  _onMessage?: (msg: ServerMessage) => void,
): void {
  const eventStore = getEventStore()
  const session = sessionManager.requireSession(sessionId)

  // Resolve current window ID once — used by guard check and message options
  const currentWindowId = getCurrentContextWindowId(sessionId)

  // Check if we already injected this mode's reminder
  const lastModeReminder = session.executionState?.lastModeWithReminder

  // Only skip if same mode AND current window already has a reminder.
  // After compaction, the window changes so we must reinject even if mode is the same.
  // If no window context exists (edge case), fall back to old behavior: skip.
  if (lastModeReminder === agentId) {
    if (!currentWindowId || windowHasReminder(sessionId, currentWindowId)) {
      return
    }
  }

  // Inject reminder for new mode
  const agentDef = findAgentById(agentId, allAgents)
  if (!agentDef) return

  const reminderContent = buildAgentReminder(agentDef)
  const reminderMsgId = crypto.randomUUID()
  const currentWindowMessageOptions = currentWindowId ? { contextWindowId: currentWindowId } : undefined

  eventStore.append(sessionId, {
    type: 'message.start',
    data: {
      messageId: reminderMsgId,
      role: 'user',
      content: reminderContent,
      ...(currentWindowMessageOptions ?? {}),
      isSystemGenerated: true,
      messageKind: 'auto-prompt',
      metadata: {
        type: 'agent',
        name: agentDef.metadata.name ?? agentDef.metadata.id,
        color: agentDef.metadata.color ?? '#6b7280',
      },
    },
  })
  eventStore.append(sessionId, {
    type: 'message.done',
    data: { messageId: reminderMsgId },
  })

  // Update execution state to track which mode we injected the reminder for
  sessionManager.updateExecutionState(sessionId, {
    lastModeWithReminder: agentId,
  })
}

async function runGenericAgentTurn(
  options: OrchestratorOptions,
  turnMetrics: TurnMetrics,
  agentId: string,
  append: (event: import('../events/types.js').TurnEvent) => void,
): Promise<void> {
  const statsIdentity = resolveStatsIdentity(options)
  const allAgents = await loadAllAgentsDefault()

  // Inject mode reminder only on mode switch
  injectModeReminderIfNeeded(options.sessionManager, options.sessionId, agentId, allAgents, options.onMessage)

  const agentDef = findAgentById(agentId, allAgents) ?? findAgentById('planner', allAgents)!
  const subAgentDefs = getSubAgents(allAgents)
  const toolRegistry = getToolRegistryForAgent(agentDef)

  const { content: instructionContent } = await getAllInstructions(
    options.sessionManager.requireSession(options.sessionId).workdir,
    options.sessionManager.requireSession(options.sessionId).projectId,
  )
  const runtimeConfig = getRuntimeConfig()
  const configDir = getGlobalConfigDir(runtimeConfig.mode ?? 'production')
  const skills = await getEnabledSkillMetadata(configDir, runtimeConfig.workdir)

  const { assembledRequest: cachedResult } = resolveCachedAssembly({
    sessionManager: options.sessionManager,
    sessionId: options.sessionId,
    workdir: options.sessionManager.requireSession(options.sessionId).workdir,
    messages: [],
    injectedFiles: [],
    promptTools: toolRegistry.definitions,
    instructionContent,
    skills,
    assembleFreshRequest: () =>
      assembleAgentRequest({
        agentDef,
        subAgentDefs,
        workdir: options.sessionManager.requireSession(options.sessionId).workdir,
        messages: [],
        injectedFiles: [],
        promptTools: toolRegistry.definitions,
        requestTools: toolRegistry.definitions,
        toolChoice: 'auto',
        ...(instructionContent ? { customInstructions: instructionContent } : {}),
        ...(skills.length > 0 ? { skills } : {}),
        modelName: options.llmClient.getModel(),
      }),
  })

  await runTopLevelAgentLoop(
    {
      mode: agentId,
      append,
      ...(await buildRetryPatterns()),
      cachedSystemPrompt: cachedResult.systemPrompt,
      sessionManager: options.sessionManager,
      sessionId: options.sessionId,
      llmClient: options.llmClient,
      statsIdentity,
      signal: options.signal,
      onMessage: options.onMessage,
      assembleRequest: (input) =>
        assembleAgentRequest({ ...input, agentDef, subAgentDefs, modelName: options.llmClient.getModel() }),
      getToolRegistry: () => getToolRegistryForAgent(agentDef),
      getConversationMessages: buildGetConversationMessages(options.sessionId, options.llmClient, append),
      injectModeReminder: () =>
        injectModeReminderIfNeeded(options.sessionManager, options.sessionId, agentId, allAgents, options.onMessage),
    },
    turnMetrics,
  )
}

// ============================================================================
// Builder Turn
// ============================================================================

export interface BuilderTurnOptions extends OrchestratorOptions {
  injectBuilderKickoff?: boolean
  injectStepDone?: boolean
  stepDonePrompt?: string
}

/**
 * Return tool registry as-is.
 * The tools hash MUST remain stable regardless of injectStepDone.
 * All tools must ALWAYS be available to maintain LLM context caching.
 */
export function filterToolRegistryForStepDone(baseRegistry: ToolRegistry, _injectStepDone: boolean): ToolRegistry {
  // Always return the base registry - do NOT filter tools
  return baseRegistry
}

export async function runBuilderTurn(
  options: BuilderTurnOptions,
  turnMetrics: TurnMetrics,
  append: (event: import('../events/types.js').TurnEvent) => void,
): Promise<{ returnValueContent?: string; returnValueResult?: string; stepDoneCalled?: boolean }> {
  const { sessionManager, sessionId } = options
  const statsIdentity = resolveStatsIdentity(options)
  const eventStore = getEventStore()
  const allAgents = await loadAllAgentsDefault()

  // Inject mode reminder only on mode switch
  injectModeReminderIfNeeded(options.sessionManager, options.sessionId, 'builder', allAgents, options.onMessage)

  const builderDef = findAgentById('builder', allAgents)!
  const subAgentDefs = getSubAgents(allAgents)

  let stepDoneCalled = false

  return {
    ...(await runTopLevelAgentLoop(
      {
        mode: 'builder',
        append,
        ...(await buildRetryPatterns()),
        sessionManager,
        sessionId,
        llmClient: options.llmClient,
        statsIdentity,
        signal: options.signal,
        onMessage: options.onMessage,
        assembleRequest: (input) =>
          assembleAgentRequest({
            ...input,
            agentDef: builderDef,
            subAgentDefs,
            modelName: options.llmClient.getModel(),
          }),
        getToolRegistry: () => {
          const baseRegistry = getToolRegistryForAgent(builderDef)
          return filterToolRegistryForStepDone(baseRegistry, options.injectStepDone === true)
        },
        getConversationMessages: buildGetConversationMessages(sessionId, options.llmClient, append),
        injectModeReminder: () =>
          injectModeReminderIfNeeded(
            options.sessionManager,
            options.sessionId,
            'builder',
            allAgents,
            options.onMessage,
          ),
        onToolExecuted: (toolCall: ToolCall, toolResult: ToolResult) => {
          if (toolCall.name === 'step_done' && toolResult.success) {
            stepDoneCalled = true
          }
          if (toolResult.success && ['write_file', 'edit_file'].includes(toolCall.name)) {
            const path = toolCall.arguments['path'] as string
            sessionManager.addModifiedFile(sessionId, path)
          }
        },
        injectKickoff: () => {
          if (options.injectBuilderKickoff !== true) return
          const session = sessionManager.requireSession(sessionId)
          const currentWindowMessageOptions = getCurrentContextWindowId(sessionId)
            ? { contextWindowId: getCurrentContextWindowId(sessionId)! }
            : undefined
          const events = eventStore.getEvents(sessionId)
          const hasBuilderKickoff = events.some((e) => {
            if (e.type !== 'message.start') return false
            const data = e.data as { messageKind?: string; content?: string }
            return data.messageKind === 'auto-prompt' && data.content?.includes('fulfil the')
          })

          if (!hasBuilderKickoff) {
            const kickoffMsgId = crypto.randomUUID()
            const kickoffContent = BUILDER_KICKOFF_PROMPT(session.criteria.length)
            const msgMetadata = { type: 'workflow', name: 'Workflow', color: '#f59e0b' }
            eventStore.append(
              sessionId,
              createMessageStartEvent(kickoffMsgId, 'user', kickoffContent, {
                ...(currentWindowMessageOptions ?? {}),
                isSystemGenerated: true,
                messageKind: 'auto-prompt',
                metadata: msgMetadata,
              }),
            )
            eventStore.append(sessionId, { type: 'message.done', data: { messageId: kickoffMsgId } })
          }
        },
      },
      turnMetrics,
    )),
    stepDoneCalled,
  }
}

// ============================================================================
// Verifier Turn (Fresh Context)
// ============================================================================

export interface VerifierResult {
  allPassed: boolean
  failed: Array<{ id: string; reason: string }>
  content?: string
}

/**
 * Run a verifier turn with fresh context.
 * Delegates to SubAgentManager for execution.
 */
export async function runVerifierTurn(options: OrchestratorOptions, turnMetrics: TurnMetrics): Promise<VerifierResult> {
  const { sessionManager, sessionId, llmClient, signal, onMessage } = options
  const statsIdentity = resolveStatsIdentity(options)

  const session = sessionManager.requireSession(sessionId)
  const toVerify = session.criteria.filter((c) => c.status.type === 'completed')
  if (toVerify.length === 0) {
    logger.debug('Nothing to verify', { sessionId })
    return { allPassed: true, failed: [] }
  }

  const allAgents = await loadAllAgentsDefault()
  const verifierDef = findAgentById('verifier', allAgents)!
  const toolRegistry = getToolRegistryForAgent(verifierDef)

  const result = await executeSubAgent({
    subAgentType: 'verifier',
    prompt: VERIFIER_KICKOFF_PROMPT,
    sessionManager,
    sessionId,
    llmClient,
    toolRegistry,
    turnMetrics,
    statsIdentity,
    signal,
    onMessage,
    nudgeConfig: createVerifierNudgeConfig(),
  })

  return {
    allPassed: result.allPassed ?? true,
    failed: result.failed ?? [],
    content: result.content,
  }
}

/**
 * Build a snapshot of current session state.
 */
function buildSnapshot(sessionManager: SessionManager, sessionId: string, _lastStats?: MessageStats): SessionSnapshot {
  const eventStore = getEventStore()
  const session = sessionManager.requireSession(sessionId)
  const events = eventStore.getEvents(sessionId)
  const latestSeq = eventStore.getLatestSeq(sessionId) ?? 0
  const cachedPrompt = sessionManager.getCachedPrompt(sessionId)

  return buildSnapshotFromSessionState({
    session,
    events,
    latestSeq,
    ...(cachedPrompt ? { cachedSystemPrompt: cachedPrompt.systemPrompt, dynamicContextHash: cachedPrompt.hash } : {}),
  })
}
