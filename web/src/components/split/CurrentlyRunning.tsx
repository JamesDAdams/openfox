import { useMemo } from 'react'
import { useLocation } from 'wouter'
import { Button } from '../shared/Button'
import { ColumnsIcon } from '../shared/icons'
import { useSessionStore } from '../../stores/session'
import { useProjects } from '../../hooks/useProjects'
import { formatRelativeDate } from '../../lib/format-date'
import { useT } from '../../hooks/useT'

/**
 * Homepage launchpad for concurrent work: lists every session across all
 * projects that is currently running or waiting on the user (pending path
 * confirmations), with a one-click "Open split view" that opens them all in
 * parallel. Hidden entirely when nothing qualifies.
 */
export function CurrentlyRunning() {
  const t = useT()
  const [, navigate] = useLocation()
  const sessions = useSessionStore((state) => state.sessions)
  const sessionsWithPendingConfirmations = useSessionStore((state) => state.sessionsWithPendingConfirmations)
  const { projects } = useProjects()
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const eligible = useMemo(
    () =>
      sessions
        .filter((s) => s.isRunning || sessionsWithPendingConfirmations.includes(s.id) || s.phase === 'blocked')
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [sessions, sessionsWithPendingConfirmations],
  )

  const phaseLabels: Record<string, string> = {
    idle: t({ en: 'Idle', fr: 'Inactif' }),
    plan: t({ en: 'Plan', fr: 'Plan' }),
    build: t({ en: 'Build', fr: 'Construction' }),
    verification: t({ en: 'Verify', fr: 'Vérification' }),
    blocked: t({ en: 'Blocked', fr: 'Bloqué' }),
    done: t({ en: 'Done', fr: 'Terminé' }),
  }

  const openSplit = () => {
    const ids = eligible.map((s) => s.id)
    if (ids.length === 0) return
    void useSessionStore.getState().enterSplitView(ids, ids[0])
    navigate('/split-view')
  }

  const addToSplit = (sessionId: string) => {
    void useSessionStore.getState().openPane(sessionId, { focus: true })
    navigate('/split-view')
  }

  if (eligible.length === 0) return null

  return (
    <div className="mb-6 md:mb-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            {t({ en: 'Currently running', fr: 'En cours d’exécution' })}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {eligible.length}
          </span>
        </div>
        {eligible.length > 1 && (
          <Button variant="primary" size="sm" onClick={openSplit} className="flex items-center gap-1.5">
            <ColumnsIcon className="w-3.5 h-3.5" />
            {t({ en: 'Open split view', fr: 'Ouvrir la vue divisée' })}
          </Button>
        )}
      </div>

      <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
        <ul className="divide-y divide-border">
          {eligible.map((session) => {
            const project = projectById.get(session.projectId)
            const waiting = sessionsWithPendingConfirmations.includes(session.id)
            return (
              <li key={session.id} className="flex items-center gap-3 px-3 md:px-4 py-2.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${session.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}
                  title={
                    waiting
                      ? t({ en: 'Waiting for your input', fr: 'En attente de votre intervention' })
                      : session.isRunning
                        ? t({ en: 'Running', fr: 'En cours' })
                        : t({ en: 'Needs attention', fr: 'Nécessite votre attention' })
                  }
                />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-primary shrink-0 max-w-[90px] truncate">
                  {project?.name ?? session.projectId.slice(0, 10)}
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/p/${session.projectId}/s/${session.id}`)}
                  className="text-sm text-text-primary truncate flex-1 min-w-0 text-left hover:underline"
                  title={session.title ?? session.id}
                >
                  {session.title ?? session.id.slice(0, 8)}
                </button>
                <span className="text-[10px] uppercase tracking-wide text-text-muted shrink-0">
                  {phaseLabels[session.phase] ?? session.phase}
                </span>
                {waiting && (
                  <span
                    className="text-[10px] text-amber-400 shrink-0"
                    title={t({ en: 'Pending confirmation', fr: 'Confirmation en attente' })}
                  >
                    {t({ en: 'Needs you', fr: 'A besoin de vous' })}
                  </span>
                )}
                <span className="text-xs text-text-muted shrink-0 hidden sm:inline">
                  {formatRelativeDate(session.updatedAt)}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/p/${session.projectId}/s/${session.id}`)}
                  >
                    {t({ en: 'Open', fr: 'Ouvrir' })}
                  </Button>{' '}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => addToSplit(session.id)}
                    title={t({ en: 'Add to split view', fr: 'Ajouter à la vue divisée' })}
                    className="flex items-center gap-1"
                  >
                    <ColumnsIcon className="w-3.5 h-3.5" />
                    {t({ en: 'Split', fr: 'Diviser' })}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
