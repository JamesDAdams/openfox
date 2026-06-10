// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { formatTimestamp, getItemIcon, getItemLabel } from './MessageSearchModal'
import type { Message } from '@shared/types.js'
import type { DisplayItem } from './groupMessages'

describe('formatTimestamp', () => {
  it('formats ISO timestamp to HH:MM for today, or YYYY/MM/DD HH:mm for other days', () => {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    expect(formatTimestamp(`${todayStr}T14:30:00`)).toMatch(/^\d{2}:\d{2}$/)
    expect(formatTimestamp('2099-07-15T09:05:00')).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/)
  })
})

describe('getItemIcon', () => {
  it('returns UserIcon for user messages', () => {
    const item: DisplayItem = {
      type: 'message',
      message: { id: '1', role: 'user', content: 'hello', timestamp: '' } as Message,
    }
    const icon = getItemIcon(item)
    expect(icon).toBeDefined()
  })

  it('returns AgentIcon for assistant messages', () => {
    const item: DisplayItem = {
      type: 'message',
      message: { id: '1', role: 'assistant', content: 'hi', timestamp: '' } as Message,
    }
    const icon = getItemIcon(item)
    expect(icon).toBeDefined()
  })

  it('returns ThinkingIcon for thinking-only messages', () => {
    const item: DisplayItem = {
      type: 'message',
      message: { id: '1', role: 'assistant', content: '', thinkingContent: 'thinking...', timestamp: '' } as Message,
    }
    const icon = getItemIcon(item)
    expect(icon).toBeDefined()
  })
})

describe('getItemLabel', () => {
  it('returns user message content preview', () => {
    const item: DisplayItem = {
      type: 'message',
      message: { id: '1', role: 'user', content: 'Hello world', timestamp: '' } as Message,
    }
    expect(getItemLabel(item)).toBe('Hello world')
  })

  it('returns empty string for empty assistant message', () => {
    const item: DisplayItem = {
      type: 'message',
      message: { id: '1', role: 'assistant', content: '', timestamp: '' } as Message,
    }
    expect(getItemLabel(item)).toBe('')
  })

  it('returns sub-agent type label', () => {
    const item: DisplayItem = { type: 'subagent', subAgentId: 's1', subAgentType: 'code_reviewer', messages: [] }
    expect(getItemLabel(item)).toBe('Sub-agent: code_reviewer')
  })

  it('returns criteria batch label', () => {
    const item: DisplayItem = { type: 'criteria-batch', toolCalls: [] }
    expect(getItemLabel(item)).toBe('Acceptance Criteria')
  })
})
