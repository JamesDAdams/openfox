import { create } from 'zustand'
import { authFetch } from '../lib/api'
import { useNotificationSettingsStore } from './notifications'
import type { Notification } from '@shared/types.js'

interface Toast {
  id: string
  title: string
  body: string
  source: string
  createdAt: string
}

interface NotificationsState {
  notifications: Notification[]
  toasts: Toast[]
  unreadCount: number
  loaded: boolean

  load: () => Promise<void>
  addNotification: (notification: Notification) => void
  handleDeleted: (id: string) => void
  handleRead: () => void
  handleCleared: () => void
  deleteNotification: (id: string) => Promise<void>
  clearAll: () => Promise<void>
  markAllRead: () => Promise<void>
  dismissToast: (id: string) => void
  pushToast: (toast: Toast) => void
}

export const useNotificationHistoryStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  toasts: [],
  unreadCount: 0,
  loaded: false,

  load: async () => {
    try {
      const res = await authFetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      const notifications = (data.notifications ?? []) as Notification[]
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }))
    // Show the toast only if the "Show popup" setting is enabled.
    if (useNotificationSettingsStore.getState().settings.popupEnabled) {
      get().pushToast({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        source: notification.source,
        createdAt: notification.createdAt,
      })
    }
  },

  handleDeleted: (id) => {
    set((state) => removeNotification(state, id))
  },

  handleRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  handleCleared: () => {
    set({ notifications: [], unreadCount: 0, toasts: [] })
  },

  deleteNotification: async (id) => {
    try {
      await authFetch(`/api/notifications/${id}`, { method: 'DELETE' })
      set((state) => removeNotification(state, id))
    } catch {
      // Keep stale row; a later refetch reconciles.
    }
  },

  clearAll: async () => {
    try {
      await authFetch('/api/notifications', { method: 'DELETE' })
      set({ notifications: [], unreadCount: 0, toasts: [] })
    } catch {
      // ignore
    }
  },

  markAllRead: async () => {
    try {
      await authFetch('/api/notifications/read-all', { method: 'POST' })
      get().handleRead()
    } catch {
      // ignore
    }
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },

  pushToast: (toast) => {
    set((state) => ({ toasts: [...state.toasts, toast] }))
    // Auto-dismiss after 5 seconds.
    setTimeout(() => {
      get().dismissToast(toast.id)
    }, 5000)
  },
}))

function removeNotification(state: NotificationsState, id: string): Partial<NotificationsState> {
  const notifications = state.notifications.filter((n) => n.id !== id)
  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    toasts: state.toasts.filter((t) => t.id !== id),
  }
}
