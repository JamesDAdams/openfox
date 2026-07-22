// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { fireEvent } from '@testing-library/react'
import type { ToolCall } from '@shared/types.js'
import { AskUserCard } from './AskUserCard'
import { useSessionStore } from '../../stores/session'

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'call-1',
    name: 'ask_user',
    arguments: { question: 'Test question?' },
    result: undefined,
    ...overrides,
  } as ToolCall
}

function render(ui: React.ReactElement): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(ui))
  return container
}

describe('AskUserCard', () => {
  beforeEach(() => {
    useSessionStore.setState({ pendingQuestions: [] })
    document.body.innerHTML = ''
  })

  it('renders question text from tool call arguments', () => {
    const tc = makeToolCall({ arguments: { question: 'What framework?' } })
    const container = render(<AskUserCard toolCall={tc} />)
    expect(container.textContent).toContain('What framework?')
  })

  it('shows answered state when tool call has result', () => {
    const tc = makeToolCall({
      result: { success: true, output: 'React', durationMs: 100, truncated: false },
    })
    const container = render(<AskUserCard toolCall={tc} />)
    expect(container.textContent).toContain('Answered')
    expect(container.textContent).toContain('React')
  })

  it('shows skipped state when result is [user skipped]', () => {
    const tc = makeToolCall({
      result: { success: true, output: '[user skipped]', durationMs: 100, truncated: false },
    })
    const container = render(<AskUserCard toolCall={tc} />)
    expect(container.textContent).toContain('Skipped')
  })

  it('renders input when question is pending', () => {
    useSessionStore.setState({
      pendingQuestions: [{ callId: 'call-1', question: 'Proceed?', type: 'text', options: undefined }],
    })
    const tc = makeToolCall({ arguments: { question: 'Proceed?' } })
    const container = render(<AskUserCard toolCall={tc} />)
    expect(container.textContent).toContain('Send Answer')
    expect(container.textContent).toContain('Skip')
  })

  it('renders confirm buttons for confirm type', () => {
    useSessionStore.setState({
      pendingQuestions: [{ callId: 'call-1', question: 'Continue?', type: 'confirm', options: undefined }],
    })
    const tc = makeToolCall({ arguments: { question: 'Continue?' } })
    const container = render(<AskUserCard toolCall={tc} />)
    expect(container.textContent).toContain('Yes')
    expect(container.textContent).toContain('No')
    expect(container.textContent).toContain('Skip')
  })

  it('renders choice chips and custom input for choice type', () => {
    useSessionStore.setState({
      pendingQuestions: [{ callId: 'call-1', question: 'Pick:', type: 'choice', options: ['A', 'B'] }],
    })
    const tc = makeToolCall({ arguments: { question: 'Pick:' } })
    const container = render(<AskUserCard toolCall={tc} />)
    expect(container.textContent).toContain('A')
    expect(container.textContent).toContain('B')
    expect(container.textContent).toContain('Send')
  })

  it('does not crash when options is a string instead of array', () => {
    // LLM sometimes outputs options as a string instead of array — guard against .map() crash
    useSessionStore.setState({
      pendingQuestions: [{ callId: 'call-1', question: 'Pick:', type: 'choice', options: undefined }],
    })
    const tc = makeToolCall({
      arguments: { question: 'Pick:', type: 'choice', options: 'option1, option2' },
    })
    const container = render(<AskUserCard toolCall={tc} />)
    // Should fall through to text input instead of crashing
    expect(container.textContent).toContain('Send')
    expect(container.textContent).toContain('Skip')
  })

  it('does not crash when options is null', () => {
    useSessionStore.setState({
      pendingQuestions: [{ callId: 'call-1', question: 'Pick:', type: 'choice', options: undefined }],
    })
    const tc = makeToolCall({
      arguments: { question: 'Pick:', type: 'choice', options: null },
    })
    const container = render(<AskUserCard toolCall={tc} />)
    expect(container.textContent).toContain('Send')
    expect(container.textContent).toContain('Skip')
  })

  it('submits answer on Enter', () => {
    const answerQuestion = vi.fn()
    useSessionStore.setState({
      pendingQuestions: [{ callId: 'call-1', question: 'Proceed?', type: 'text', options: undefined }],
      answerQuestion,
    })
    const tc = makeToolCall({ arguments: { question: 'Proceed?' } })
    const container = render(<AskUserCard toolCall={tc} />)
    const textarea = container.querySelector('textarea')!
    fireEvent.change(textarea, { target: { value: 'my answer' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(answerQuestion).toHaveBeenCalledWith('call-1', 'my answer')
  })

  it('does not submit on Shift+Enter', () => {
    const answerQuestion = vi.fn()
    useSessionStore.setState({
      pendingQuestions: [{ callId: 'call-1', question: 'Proceed?', type: 'text', options: undefined }],
      answerQuestion,
    })
    const tc = makeToolCall({ arguments: { question: 'Proceed?' } })
    const container = render(<AskUserCard toolCall={tc} />)
    const textarea = container.querySelector('textarea')!
    fireEvent.change(textarea, { target: { value: 'my answer' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(answerQuestion).not.toHaveBeenCalled()
  })

  it('skips question on Escape', () => {
    const answerQuestion = vi.fn()
    useSessionStore.setState({
      pendingQuestions: [{ callId: 'call-1', question: 'Proceed?', type: 'text', options: undefined }],
      answerQuestion,
    })
    const tc = makeToolCall({ arguments: { question: 'Proceed?' } })
    const container = render(<AskUserCard toolCall={tc} />)
    const textarea = container.querySelector('textarea')!
    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(answerQuestion).toHaveBeenCalledWith('call-1', '', true)
  })
})
