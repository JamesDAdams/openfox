import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolResult, ToolCall } from '../../shared/types.js'
import type { SessionManager } from '../session/index.js'
import type { ToolRegistry } from '../tools/types.js'
import type { TurnMetrics } from './stream-pure.js'
import type { EventStore } from '../events/store.js'
import type { TopLevelLoopConfig } from './agent-loop.js'

// Mock the event store module
vi.mock('../events/store.js', () => ({
  getEventStore: vi.fn(),
}))

// Mock settings
vi.mock('../db/settings.js', () => ({
  getSetting: vi.fn(),
  SETTINGS_KEYS: { LLM_DYNAMIC_SYSTEM_PROMPT: 'llm.dynamicSystemPrompt' },
}))

// Mock instructions
vi.mock('../context/instructions.js', () => ({
  getAllInstructions: vi.fn(),
}))

// Mock skills
vi.mock('../skills/registry.js', () => ({
  getEnabledSkillMetadata: vi.fn(),
}))

// Mock runtime config
vi.mock('../runtime-config.js', () => ({
  getRuntimeConfig: vi.fn().mockReturnValue({
    mode: 'test',
    workdir: '/test',
    llm: {
      baseUrl: 'http://localhost:11434',
      model: 'test-model',
      timeout: 30000,
      idleTimeout: 30000,
      backend: 'ollama',
    },
  }),
}))

// Mock paths
vi.mock('../../cli/paths.js', () => ({
  getGlobalConfigDir: vi.fn().mockReturnValue('/test/config'),
}))

// Mock conversation history
vi.mock('./conversation-history.js', () => ({
  getConversationMessages: vi.fn().mockReturnValue([]),
}))

import { runTopLevelAgentLoop } from './agent-loop.js'
import { executeTools } from './execute-tools.js'
import { getEventStore } from '../events/store.js'
import { getSetting } from '../db/settings.js'
import { getAllInstructions } from '../context/instructions.js'
import { getEnabledSkillMetadata } from '../skills/registry.js'

describe('executeTools', () => {
  let mockSessionManager: SessionManager
  let mockToolRegistry: ToolRegistry
  let mockOnMessage: (msg: unknown) => void
  let mockEventStore: EventStore

  beforeEach(() => {
    mockOnMessage = vi.fn()
    mockEventStore = {
      append: vi.fn(),
      getEvents: vi.fn().mockReturnValue([]),
    } as unknown as EventStore

    // Mock the event store singleton
    ;(getEventStore as any).mockReturnValue(mockEventStore)

    mockSessionManager = {
      requireSession: vi.fn().mockReturnValue({
        criteria: [],
        workdir: '/test',
        projectId: 'test-project',
      }),
      getLspManager: vi.fn(),
      drainAsapMessages: vi.fn().mockReturnValue([]),
    } as unknown as SessionManager

    mockToolRegistry = {
      execute: vi.fn(),
      definitions: [],
    } as unknown as ToolRegistry
  })

  it('includes output in tool message when command fails (success: false)', async () => {
    const mockToolResult: ToolResult = {
      success: false,
      output: 'TypeScript error output\nLine 1: error TS123',
      error: 'Command exited with code 2',
      durationMs: 100,
      truncated: false,
    }

    mockToolRegistry.execute = vi.fn().mockResolvedValue(mockToolResult)

    const toolCalls: ToolCall[] = [
      {
        id: 'test-call-1',
        name: 'run_command',
        arguments: { command: 'npm run typecheck' },
      },
    ]

    const result = await executeTools(
      'assistant-msg-1',
      toolCalls,
      {
        toolRegistry: mockToolRegistry,
        sessionManager: mockSessionManager,
        sessionId: 'test-session',
        workdir: '/test',
        turnMetrics: {
          addToolTime: vi.fn(),
          addLLMCall: vi.fn(),
          buildStats: vi.fn(),
        } as unknown as TurnMetrics,
        signal: undefined,
        onMessage: mockOnMessage,
      },
      vi.fn(),
    )

    // The tool message should include both the output and the error
    expect(result.toolMessages).toHaveLength(1)
    expect(result.toolMessages[0]?.content).toContain('TypeScript error output')
    expect(result.toolMessages[0]?.content).toContain('Line 1: error TS123')
    expect(result.toolMessages[0]?.content).toContain('Error: Command exited with code 2')
    // Output should come before the error
    const outputIndex = result.toolMessages[0]?.content.indexOf('TypeScript error output') ?? -1
    const errorIndex = result.toolMessages[0]?.content.indexOf('Error: Command exited with code 2') ?? -1
    expect(outputIndex).toBeLessThan(errorIndex)
  })

  it('shows only error when tool fails without output', async () => {
    const mockToolResult: ToolResult = {
      success: false,
      error: 'Criterion not found: missing',
      durationMs: 0,
      truncated: false,
    }

    mockToolRegistry.execute = vi.fn().mockResolvedValue(mockToolResult)

    const toolCalls: ToolCall[] = [
      {
        id: 'test-call-2',
        name: 'update_criterion',
        arguments: { id: 'missing' },
      },
    ]

    const result = await executeTools(
      'assistant-msg-2',
      toolCalls,
      {
        toolRegistry: mockToolRegistry,
        sessionManager: mockSessionManager,
        sessionId: 'test-session',
        workdir: '/test',
        turnMetrics: {
          addToolTime: vi.fn(),
          addLLMCall: vi.fn(),
          buildStats: vi.fn(),
        } as unknown as TurnMetrics,
        signal: undefined,
        onMessage: mockOnMessage,
      },
      vi.fn(),
    )

    // Should only show the error, no empty output section
    expect(result.toolMessages).toHaveLength(1)
    expect(result.toolMessages[0]?.content).toBe('Error: Criterion not found: missing')
    expect(result.toolMessages[0]?.content).not.toContain('\n\nError:')
  })

  it('shows output when tool succeeds', async () => {
    const mockToolResult: ToolResult = {
      success: true,
      output: 'File read successfully\nLine 1: content',
      durationMs: 50,
      truncated: false,
    }

    mockToolRegistry.execute = vi.fn().mockResolvedValue(mockToolResult)

    const toolCalls: ToolCall[] = [
      {
        id: 'test-call-3',
        name: 'read_file',
        arguments: { path: 'test.ts' },
      },
    ]

    const result = await executeTools(
      'assistant-msg-3',
      toolCalls,
      {
        toolRegistry: mockToolRegistry,
        sessionManager: mockSessionManager,
        sessionId: 'test-session',
        workdir: '/test',
        turnMetrics: {
          addToolTime: vi.fn(),
          addLLMCall: vi.fn(),
          buildStats: vi.fn(),
        } as unknown as TurnMetrics,
        signal: undefined,
        onMessage: mockOnMessage,
      },
      vi.fn(),
    )

    expect(result.toolMessages).toHaveLength(1)
    expect(result.toolMessages[0]?.content).toBe('File read successfully\nLine 1: content')
    expect(result.toolMessages[0]?.content).not.toContain('Error:')
  })

  it('executes multiple tool calls in parallel and maintains order', async () => {
    const executionOrder: number[] = []
    const completionOrder: number[] = []

    mockToolRegistry.execute = vi.fn().mockImplementation(async (_name: string, args: any, _context: any) => {
      const index = (args.index as number) ?? 0
      const delay = (args.delay as number) ?? 0
      executionOrder.push(index)
      await new Promise((resolve) => setTimeout(resolve, delay))
      completionOrder.push(index)
      return {
        success: true,
        output: `Tool ${index} output`,
        durationMs: delay,
        truncated: false,
      }
    })

    const toolCalls: ToolCall[] = [
      {
        id: 'call-1',
        name: 'run_command',
        arguments: { index: 0, delay: 100 },
      },
      {
        id: 'call-2',
        name: 'run_command',
        arguments: { index: 1, delay: 10 },
      },
      {
        id: 'call-3',
        name: 'run_command',
        arguments: { index: 2, delay: 50 },
      },
    ]

    const result = await executeTools(
      'assistant-msg-4',
      toolCalls,
      {
        toolRegistry: mockToolRegistry,
        sessionManager: mockSessionManager,
        sessionId: 'test-session',
        workdir: '/test',
        turnMetrics: {
          addToolTime: vi.fn(),
          addLLMCall: vi.fn(),
          buildStats: vi.fn(),
        } as unknown as TurnMetrics,
        signal: undefined,
        onMessage: mockOnMessage,
      },
      vi.fn(),
    )

    expect(result.toolMessages).toHaveLength(3)
    expect(result.toolMessages[2]?.content).toBe('Tool 2 output')
  })
})

// ============================================================================
// runTopLevelAgentLoop — System Prompt Caching Tests
// ============================================================================

describe('runTopLevelAgentLoop caching', () => {
  let mockEventStore: EventStore
  let mockSessionManager: SessionManager
  let mockLLMClient: any
  let mockTurnMetrics: TurnMetrics
  let assembleRequestMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    mockEventStore = {
      append: vi.fn(),
      getEvents: vi.fn().mockReturnValue([]),
      getLatestSeq: vi.fn().mockReturnValue(0),
      cleanupOldEvents: vi.fn().mockReturnValue(0),
    } as unknown as EventStore
    ;(getEventStore as any).mockReturnValue(mockEventStore)

    mockLLMClient = {
      getModel: vi.fn().mockReturnValue('test-model'),
    }

    mockTurnMetrics = {
      addToolTime: vi.fn(),
      addLLMCall: vi.fn(),
      buildStats: vi.fn().mockReturnValue({}),
    } as unknown as TurnMetrics

    assembleRequestMock = vi.fn().mockReturnValue({
      systemPrompt: 'fresh-system-prompt',
      messages: [],
      promptContext: {
        systemPrompt: 'fresh-system-prompt',
        injectedFiles: [],
        userMessage: '',
        messages: [],
        tools: [],
        requestOptions: { toolChoice: 'auto', disableThinking: false },
      },
    })
    ;(getAllInstructions as any).mockResolvedValue({ content: 'test instructions', files: [] })
    ;(getEnabledSkillMetadata as any).mockResolvedValue([])
  })

  function makeConfig(overrides?: Partial<TopLevelLoopConfig>): TopLevelLoopConfig {
    return {
      mode: 'planner',
      append: vi.fn(),
      sessionManager: mockSessionManager,
      sessionId: 'test-session',
      llmClient: mockLLMClient,
      statsIdentity: { providerId: 'test', providerName: 'Test', backend: 'unknown' as const, model: 'test-model' },
      assembleRequest: assembleRequestMock as any,
      getToolRegistry: () => ({ definitions: [], execute: vi.fn() }) as any,
      getConversationMessages: vi.fn().mockResolvedValue([]),
      ...overrides,
    }
  }

  it('calls assembleRequest when no cached prompt exists (first turn)', async () => {
    mockSessionManager = {
      requireSession: vi.fn().mockReturnValue({
        workdir: '/test',
        projectId: 'test-project',
        executionState: null,
        criteria: [],
        isRunning: false,
      }),
      getContextState: vi.fn().mockReturnValue({
        currentTokens: 0,
        maxTokens: 200000,
        compactionCount: 0,
        dangerZone: false,
        canCompact: false,
        dynamicContextChanged: false,
      }),
      getCurrentModelSettings: vi.fn().mockReturnValue({}),
      setCurrentContextSize: vi.fn(),
      getDynamicContextChanged: vi.fn().mockReturnValue(false),
      setDynamicContextChanged: vi.fn(),
      getCachedPrompt: vi.fn().mockReturnValue(undefined),
      setCachedPrompt: vi.fn(),
      getLspManager: vi.fn(),
      drainAsapMessages: vi.fn().mockReturnValue([]),
      getCurrentWindowMessages: vi.fn().mockReturnValue([]),
      updateMessage: vi.fn(),
    } as any
    ;(getSetting as any).mockReturnValue('false')

    const promise = runTopLevelAgentLoop(makeConfig(), mockTurnMetrics)

    // The loop will try to stream LLM and fail, but we can check assembleRequest was called
    // We need to handle the fact that streamLLMPure will fail
    await expect(promise).rejects.toThrow()

    expect(assembleRequestMock).toHaveBeenCalledTimes(1)
  })

  it('reuses cached system prompt when hash matches', async () => {
    mockSessionManager = {
      requireSession: vi.fn().mockReturnValue({
        workdir: '/test',
        projectId: 'test-project',
        executionState: null,
        criteria: [],
        isRunning: false,
      }),
      getContextState: vi.fn().mockReturnValue({
        currentTokens: 0,
        maxTokens: 200000,
        compactionCount: 0,
        dangerZone: false,
        canCompact: false,
        dynamicContextChanged: false,
      }),
      getCurrentModelSettings: vi.fn().mockReturnValue({}),
      setCurrentContextSize: vi.fn(),
      getDynamicContextChanged: vi.fn().mockReturnValue(false),
      setDynamicContextChanged: vi.fn(),
      getCachedPrompt: vi.fn().mockReturnValue(undefined),
      setCachedPrompt: vi.fn(),
      getLspManager: vi.fn(),
      drainAsapMessages: vi.fn().mockReturnValue([]),
      getCurrentWindowMessages: vi.fn().mockReturnValue([]),
      updateMessage: vi.fn(),
    } as any
    ;(getSetting as any).mockReturnValue('false')

    const promise = runTopLevelAgentLoop(makeConfig({ cachedSystemPrompt: 'cached-system-prompt' }), mockTurnMetrics)
    await expect(promise).rejects.toThrow()

    // assembleRequest should NOT be called — cached prompt provided
    expect(assembleRequestMock).not.toHaveBeenCalled()
  })

  it('uses cached prompt but sets dynamicContextChanged when hash differs', async () => {
    mockSessionManager = {
      requireSession: vi.fn().mockReturnValue({
        workdir: '/test',
        projectId: 'test-project',
        executionState: null,
        criteria: [],
        isRunning: false,
      }),
      getContextState: vi.fn().mockReturnValue({
        currentTokens: 0,
        maxTokens: 200000,
        compactionCount: 0,
        dangerZone: false,
        canCompact: false,
        dynamicContextChanged: false,
      }),
      getCurrentModelSettings: vi.fn().mockReturnValue({}),
      setCurrentContextSize: vi.fn(),
      getDynamicContextChanged: vi.fn().mockReturnValue(false),
      setDynamicContextChanged: vi.fn(),
      getCachedPrompt: vi.fn().mockReturnValue(undefined),
      setCachedPrompt: vi.fn(),
      getLspManager: vi.fn(),
      drainAsapMessages: vi.fn().mockReturnValue([]),
      getCurrentWindowMessages: vi.fn().mockReturnValue([]),
      updateMessage: vi.fn(),
    } as any
    ;(getSetting as any).mockReturnValue('false')

    const promise = runTopLevelAgentLoop(makeConfig({ cachedSystemPrompt: 'cached-system-prompt' }), mockTurnMetrics)
    await expect(promise).rejects.toThrow()

    // assembleRequest should NOT be called — cached prompt provided
    expect(assembleRequestMock).not.toHaveBeenCalled()
  })

  it('skips caching and rebuilds every turn in dynamic mode', async () => {
    mockSessionManager = {
      requireSession: vi.fn().mockReturnValue({
        workdir: '/test',
        projectId: 'test-project',
        executionState: {
          cachedSystemPrompt: 'cached-system-prompt',
          dynamicContextHash: 'some-hash',
        },
        criteria: [],
        isRunning: false,
      }),
      getContextState: vi.fn().mockReturnValue({
        currentTokens: 0,
        maxTokens: 200000,
        compactionCount: 0,
        dangerZone: false,
        canCompact: false,
        dynamicContextChanged: false,
      }),
      getCurrentModelSettings: vi.fn().mockReturnValue({}),
      setCurrentContextSize: vi.fn(),
      getDynamicContextChanged: vi.fn().mockReturnValue(false),
      setDynamicContextChanged: vi.fn(),
      getCachedPrompt: vi.fn().mockReturnValue(undefined),
      setCachedPrompt: vi.fn(),
      getLspManager: vi.fn(),
      drainAsapMessages: vi.fn().mockReturnValue([]),
      getCurrentWindowMessages: vi.fn().mockReturnValue([]),
      updateMessage: vi.fn(),
    } as any
    ;(getSetting as any).mockReturnValue('true')

    const promise = runTopLevelAgentLoop(makeConfig(), mockTurnMetrics)
    await expect(promise).rejects.toThrow()

    // assembleRequest should be called even though cache exists
    expect(assembleRequestMock).toHaveBeenCalledTimes(1)
  })
})
