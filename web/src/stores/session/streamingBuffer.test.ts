// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0))
vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))

const fetchMock = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }), status: 200 }),
)
vi.stubGlobal('fetch', fetchMock)
vi.stubGlobal('localStorage', {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
})

const { wsSendMock, wsSubscribeMock, wsConnectMock, wsDisconnectMock, wsStatusMock } = vi.hoisted(() => ({
  wsSendMock: vi.fn(() => 'message-id'),
  wsSubscribeMock: vi.fn(() => () => undefined),
  wsConnectMock: vi.fn(async () => undefined),
  wsDisconnectMock: vi.fn(() => undefined),
  wsStatusMock: vi.fn(() => undefined),
}))

vi.mock('../../lib/ws', () => ({
  wsClient: {
    send: wsSendMock,
    subscribe: wsSubscribeMock,
    connect: wsConnectMock,
    disconnect: wsDisconnectMock,
    onStatusChange: wsStatusMock,
  },
}))

vi.mock('../../lib/sound', () => ({
  playNotification: vi.fn(),
  playAchievement: vi.fn(),
  playIntervention: vi.fn(),
  playWaitingForUser: vi.fn(),
  playNewMessage: vi.fn(),
}))

type SessionStoreModule = typeof import('../session')

async function loadSessionStore(): Promise<SessionStoreModule['useSessionStore']> {
  vi.resetModules()
  const module = await import('../session')
  return module.useSessionStore
}

describe('chat.tool_output streaming after message_updated', () => {
  beforeEach(() => {
    wsSendMock.mockClear()
    wsSubscribeMock.mockClear()
    wsConnectMock.mockClear()
    wsDisconnectMock.mockClear()
    wsStatusMock.mockClear()
    fetchMock.mockClear()
  })

  it('accumulates all tool_output chunks even after message_updated folds streamingMessage into messages', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const useSessionStore = await loadSessionStore()

    useSessionStore.setState({
      currentSession: {
        id: 'session-1',
        projectId: 'project-1',
        workdir: '/tmp/project-1',
        mode: 'builder',
        phase: 'build',
        isRunning: true,
        criteria: [],
        summary: null,
      } as any,
    })

    useSessionStore.getState().handleServerMessage({
      type: 'chat.message',
      sessionId: 'session-1',
      payload: {
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          timestamp: '2024-01-01T00:00:00.000Z',
          tokenCount: 0,
          isStreaming: true,
        },
      },
    })

    useSessionStore.getState().handleServerMessage({
      type: 'chat.tool_call',
      sessionId: 'session-1',
      payload: {
        messageId: 'msg-1',
        callId: 'call-1',
        tool: 'run_command',
        args: { command: 'echo hello' },
      },
    })

    useSessionStore.getState().handleServerMessage({
      type: 'chat.message_updated',
      sessionId: 'session-1',
      payload: {
        messageId: 'msg-1',
        updates: { isStreaming: false },
      },
    })

    const msg = useSessionStore.getState().messages.find((m) => m.id === 'msg-1')
    expect(msg?.toolCalls).toHaveLength(1)
    expect(msg?.toolCalls?.[0]?.streamingOutput).toBeUndefined()
    expect(useSessionStore.getState().streamingMessage).toBeNull()

    useSessionStore.getState().handleServerMessage({
      type: 'chat.tool_output',
      sessionId: 'session-1',
      payload: { messageId: 'msg-1', callId: 'call-1', stream: 'stdout', output: 'first\n' },
    })
    vi.runAllTimers()

    const afterFirst = useSessionStore.getState().messages.find((m) => m.id === 'msg-1')
    expect(afterFirst?.toolCalls?.[0]?.streamingOutput?.map((c) => c.content).join('')).toBe('first\n')

    useSessionStore.getState().handleServerMessage({
      type: 'chat.tool_output',
      sessionId: 'session-1',
      payload: { messageId: 'msg-1', callId: 'call-1', stream: 'stdout', output: 'second\n' },
    })
    useSessionStore.getState().handleServerMessage({
      type: 'chat.tool_output',
      sessionId: 'session-1',
      payload: { messageId: 'msg-1', callId: 'call-1', stream: 'stdout', output: 'third\n' },
    })
    vi.runAllTimers()

    const updatedMsg = useSessionStore.getState().messages.find((m) => m.id === 'msg-1')
    const output = updatedMsg?.toolCalls?.[0]?.streamingOutput?.map((c) => c.content).join('') ?? ''
    expect(output).toBe('first\nsecond\nthird\n')
  })
})
