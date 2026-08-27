// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { authFetchMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
}))

vi.mock('../lib/api', () => ({
  authFetch: authFetchMock,
}))

import { useNotificationHistoryStore } from './notificationHistory'
import type { Notification } from '@shared/types.js'

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    title: 'Hello',
    body: 'World',
    source: 'plugin',
    read: false,
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  }
}

describe('notifications store', () => {
  beforeEach(() => {
    authFetchMock.mockReset()
    useNotificationHistoryStore.setState({ notifications: [], toasts: [], unreadCount: 0, loaded: false })
  })

  it('adds notification and increments unread count', () => {
    useNotificationHistoryStore.getState().addNotification(makeNotification())
    const state = useNotificationHistoryStore.getState()
    expect(state.notifications.length).toBe(1)
    expect(state.unreadCount).toBe(1)
    expect(state.toasts.length).toBe(1)
  })

  it('pushes a toast when adding a notification', () => {
    useNotificationHistoryStore.getState().addNotification(makeNotification())
    expect(useNotificationHistoryStore.getState().toasts[0]?.title).toBe('Hello')
  })

  it('deletes a notification and recomputes unread count', async () => {
    useNotificationHistoryStore.setState({
      notifications: [makeNotification({ id: 'n1', read: false }), makeNotification({ id: 'n2', read: true })],
      unreadCount: 1,
      toasts: [{ id: 'n1', title: 'Hello', body: 'World', source: 'plugin', createdAt: '' }],
    })
    authFetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    await useNotificationHistoryStore.getState().deleteNotification('n1')
    const state = useNotificationHistoryStore.getState()
    expect(state.notifications).toEqual([expect.objectContaining({ id: 'n2' })])
    expect(state.unreadCount).toBe(0)
    expect(state.toasts).toEqual([])
  })

  it('handles cleared notifications', () => {
    useNotificationHistoryStore.setState({ notifications: [makeNotification()], unreadCount: 1, toasts: [] })
    useNotificationHistoryStore.getState().handleCleared()
    const state = useNotificationHistoryStore.getState()
    expect(state.notifications).toEqual([])
    expect(state.unreadCount).toBe(0)
  })

  it('handles read-all broadcast', () => {
    useNotificationHistoryStore.setState({
      notifications: [makeNotification({ id: 'n1', read: false }), makeNotification({ id: 'n2', read: false })],
      unreadCount: 2,
    })
    useNotificationHistoryStore.getState().handleRead()
    const state = useNotificationHistoryStore.getState()
    expect(state.unreadCount).toBe(0)
    expect(state.notifications.every((n) => n.read)).toBe(true)
  })

  it('marks all read and resets unread count', async () => {
    useNotificationHistoryStore.setState({ notifications: [makeNotification()], unreadCount: 1 })
    authFetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    await useNotificationHistoryStore.getState().markAllRead()
    const state = useNotificationHistoryStore.getState()
    expect(state.unreadCount).toBe(0)
    expect(state.notifications[0]!.read).toBe(true)
  })

  it('dismisses a toast', () => {
    useNotificationHistoryStore.setState({
      toasts: [{ id: 'n1', title: 'Hello', body: 'World', source: 'plugin', createdAt: '' }],
    })
    useNotificationHistoryStore.getState().dismissToast('n1')
    expect(useNotificationHistoryStore.getState().toasts).toEqual([])
  })
})
