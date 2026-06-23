import { describe, expect, it } from 'vitest'
import {
  AskUserInterrupt,
  askUserTool,
  cancelQuestion,
  cancelQuestionsForSession,
  hasPendingQuestion,
  provideAnswer,
  getPendingQuestionsForSession,
} from './ask.js'

describe('ask_user tool', () => {
  it('throws an AskUserInterrupt and tracks the pending question', async () => {
    let interrupt: AskUserInterrupt | null = null

    try {
      await askUserTool.execute(
        { question: 'Which backend should I use?' },
        {
          workdir: '/tmp/project',
          sessionId: 'session-1',
          sessionManager: {} as never,
          toolCallId: 'call-1',
        },
      )
    } catch (error) {
      interrupt = error as AskUserInterrupt
    }

    expect(interrupt).toBeInstanceOf(AskUserInterrupt)
    expect(interrupt?.question).toBe('Which backend should I use?')
    expect(interrupt?.callId).toBe('call-1')
    expect(interrupt && hasPendingQuestion(interrupt.callId)).toBe(true)
    expect(provideAnswer(interrupt!.callId, 'Use vLLM')).toBe(true)
    expect(hasPendingQuestion(interrupt!.callId)).toBe(false)
  })

  it('uses toolCallId from context', async () => {
    let interrupt: AskUserInterrupt | null = null

    try {
      await askUserTool.execute(
        { question: 'Test?' },
        {
          workdir: '/tmp/project',
          sessionId: 'session-1',
          sessionManager: {} as never,
          toolCallId: 'custom-call-id',
        },
      )
    } catch (error) {
      interrupt = error as AskUserInterrupt
    }

    expect(interrupt?.callId).toBe('custom-call-id')
    provideAnswer('custom-call-id', 'yes')
  })

  it('provideAnswer with skip=true returns [user skipped]', async () => {
    let interrupt: AskUserInterrupt | null = null

    try {
      await askUserTool.execute(
        { question: 'Proceed?' },
        {
          workdir: '/tmp/project',
          sessionId: 'session-skip',
          sessionManager: {} as never,
          toolCallId: 'call-skip',
        },
      )
    } catch (error) {
      interrupt = error as AskUserInterrupt
    }

    expect(provideAnswer(interrupt!.callId, '', true)).toBe(true)
    expect(hasPendingQuestion(interrupt!.callId)).toBe(false)
  })

  it('handles type and options in execute', async () => {
    let interrupt: AskUserInterrupt | null = null

    try {
      await askUserTool.execute(
        { question: 'Pick one:', type: 'choice', options: ['A', 'B', 'C'] },
        {
          workdir: '/tmp/project',
          sessionId: 'session-2',
          sessionManager: {} as never,
          toolCallId: 'call-2',
        },
      )
    } catch (error) {
      interrupt = error as AskUserInterrupt
    }

    expect(interrupt?.type).toBe('choice')
    expect(interrupt?.options).toEqual(['A', 'B', 'C'])
    expect(interrupt?.callId).toBe('call-2')
    provideAnswer('call-2', 'A')
  })

  it('cancels pending questions and returns false for unknown ids', async () => {
    let interrupt: AskUserInterrupt | null = null

    try {
      await askUserTool.execute(
        { question: 'Need approval?' },
        {
          workdir: '/tmp/project',
          sessionId: 'session-1',
          sessionManager: {} as never,
          toolCallId: 'call-cancel',
        },
      )
    } catch (error) {
      interrupt = error as AskUserInterrupt
    }

    expect(cancelQuestion(interrupt!.callId, 'user declined')).toBe(true)
    expect(hasPendingQuestion(interrupt!.callId)).toBe(false)
    expect(provideAnswer('missing', 'nope')).toBe(false)
    expect(cancelQuestion('missing', 'nope')).toBe(false)
  })

  it('cancels all pending questions for a session', async () => {
    const interrupts: AskUserInterrupt[] = []

    for (const [i, sessionId] of ['session-1', 'session-1', 'session-2'].entries()) {
      try {
        await askUserTool.execute(
          { question: `Question for ${sessionId}` },
          {
            workdir: '/tmp/project',
            sessionId,
            sessionManager: {} as never,
            toolCallId: `call-cancel-${i}`,
          },
        )
      } catch (error) {
        interrupts.push(error as AskUserInterrupt)
      }
    }

    expect(cancelQuestionsForSession('session-1', 'session aborted')).toBe(2)
    expect(hasPendingQuestion(interrupts[0]!.callId)).toBe(false)
    expect(hasPendingQuestion(interrupts[1]!.callId)).toBe(false)
    expect(hasPendingQuestion(interrupts[2]!.callId)).toBe(true)
    expect(cancelQuestionsForSession('missing', 'noop')).toBe(0)

    expect(cancelQuestion(interrupts[2]!.callId, 'cleanup')).toBe(true)
  })

  it('getPendingQuestionsForSession returns pending questions', async () => {
    try {
      await askUserTool.execute(
        { question: 'What framework?', type: 'choice', options: ['React', 'Vue'] },
        {
          workdir: '/tmp/project',
          sessionId: 'session-list',
          sessionManager: {} as never,
          toolCallId: 'call-list-1',
        },
      )
    } catch {
      // expected
    }

    const pending = getPendingQuestionsForSession('session-list')
    expect(pending.length).toBe(1)
    expect(pending[0]!.callId).toBe('call-list-1')
    expect(pending[0]!.question).toBe('What framework?')
    expect(pending[0]!.type).toBe('choice')
    expect(pending[0]!.options).toEqual(['React', 'Vue'])

    provideAnswer('call-list-1', 'React')
    expect(getPendingQuestionsForSession('session-list').length).toBe(0)
  })
})
