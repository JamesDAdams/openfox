import { useEffect, useState } from 'react'
import { Modal } from '../shared/SelfContainedModal'
import { ConfirmModal } from '../shared/ConfirmModal'
import { Button } from '../shared/Button'
import { TrashIcon, BellIcon } from '../shared/icons'
import { useNotificationHistoryStore } from '../../stores/notificationHistory'

interface NotificationCenterProps {
  isOpen: boolean
  onClose: () => void
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const notifications = useNotificationHistoryStore((state) => state.notifications)
  const load = useNotificationHistoryStore((state) => state.load)
  const deleteNotification = useNotificationHistoryStore((state) => state.deleteNotification)
  const clearAll = useNotificationHistoryStore((state) => state.clearAll)
  const markAllRead = useNotificationHistoryStore((state) => state.markAllRead)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (isOpen) {
      void load()
      // Opening the center marks everything as read (badge resets).
      void markAllRead()
    }
  }, [isOpen, load, markAllRead])

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteNotification(deleteTarget)
    setDeleteTarget(null)
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Notifications"
        size="md"
        showCloseButton
        closeOnBackdropClick
        scrollable={false}
        headerRight={
          notifications.length > 0 ? (
            <Button size="sm" onClick={() => setConfirmClear(true)}>
              Clear all
            </Button>
          ) : undefined
        }
      >
        <div className="flex-1 min-h-0 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-2">
              <BellIcon className="w-8 h-8" />
              <span className="text-sm">No notifications</span>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id} className="px-4 py-3 flex items-start gap-3 hover:bg-bg-secondary/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">{n.title}</span>
                      {n.source && (
                        <span className="text-[10px] uppercase font-medium text-text-muted bg-bg-tertiary rounded px-1.5 py-0.5">
                          {n.source}
                        </span>
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-text-secondary mt-0.5 whitespace-pre-wrap break-words">{n.body}</p>
                    )}
                    <span className="text-[10px] text-text-muted mt-1 inline-block">{formatDate(n.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(n.id)}
                    className="shrink-0 p-1.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-accent-error transition-colors"
                    title="Dismiss notification"
                    aria-label="Dismiss notification"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {deleteTarget && (
        <ConfirmModal
          isOpen
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
          title="Delete notification?"
          message="This notification will be removed from your history."
          confirmLabel="Delete"
          confirmVariant="danger"
        />
      )}

      {confirmClear && (
        <ConfirmModal
          isOpen
          onClose={() => setConfirmClear(false)}
          onConfirm={() => {
            void clearAll()
            setConfirmClear(false)
          }}
          title="Clear all notifications?"
          message="Your entire notification history will be deleted."
          confirmLabel="Clear all"
          confirmVariant="danger"
        />
      )}
    </>
  )
}
