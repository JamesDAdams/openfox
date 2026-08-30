import { SearchResultsList, SelectableListButton } from './shared/SearchResultsList'
import { Modal } from './shared/Modal'
import { useEffect, useState, useRef } from 'react'
import { useLocation } from 'wouter'

function getProjectIdFromPath(path: string): string | undefined {
  const match = path.match(/^\/p\/([^/]+)/)
  return match?.[1]
}
import { useAgents } from '../hooks/useAgents'
import { useResource } from '../hooks/useResource'
import { commandsResource, workflowsResource } from '../lib/resources'
import { useSessionStore } from '../stores/session'
import { useSessionScope, useScopedPaneState } from '../stores/session/session-scope'
import { dedupById, fuzzyMatch, handleModalNavigation } from '../lib/modal-utils'
import type { WorkflowScope } from '@shared/types.js'
import { useResetSearchOnOpen } from '../hooks/useResetSearchOnOpen'

interface QuickActionModalProps {
  isOpen: boolean
  onClose: () => void
  onCloseComplete?: () => void
  onSelectCommand: (commandId: string, textareaContent?: string) => void
  onSelectWorkflow: (workflowId: string, scope?: WorkflowScope) => void
  onCloseCompleteAction?: () => void
  textareaContent?: string
  onSearchMessages?: () => void
  onToggleAutoScroll?: (enabled: boolean) => void
  isAutoScrollActive?: boolean
}

interface ActionItem {
  id: string
  name: string
  prefix: string
  action: () => void
}

export function QuickActionModal({
  isOpen,
  onClose,
  onCloseComplete,
  onSelectCommand,
  onSelectWorkflow,
  onCloseCompleteAction,
  textareaContent,
  onSearchMessages,
  onToggleAutoScroll,
  isAutoScrollActive,
}: QuickActionModalProps) {
  const [, navigate] = useLocation()
  const sessionId = useSessionScope()
  const currentMode = useScopedPaneState(
    sessionId,
    (pane) => pane.session?.mode ?? null,
    (state) => state.currentSession?.mode ?? null,
    null,
  )
  const currentDangerLevel = useScopedPaneState(
    sessionId,
    (pane) => pane.session?.dangerLevel ?? 'normal',
    (state) => state.currentSession?.dangerLevel ?? 'normal',
    'normal',
  )
  const switchMode = useSessionStore((state) => state.switchMode)
  const switchDangerLevel = useSessionStore((state) => state.switchDangerLevel)
  const currentProjectId = useScopedPaneState(
    sessionId,
    (pane) => pane.session?.projectId ?? null,
    (state) => state.currentSession?.projectId ?? null,
    null,
  )
  const currentWorkdir = useScopedPaneState(
    sessionId,
    (pane) => pane.session?.workdir ?? undefined,
    (state) => state.currentSession?.workdir,
    undefined,
  )
  const { agents } = useAgents(currentWorkdir)
  const { data: commandData } = useResource(commandsResource, currentWorkdir)
  const commandDefaults = commandData?.defaults ?? []
  const commandUserItems = commandData?.userItems ?? []
  const commandProjectItems = commandData?.projectItems ?? []
  const { data: workflowData } = useResource(workflowsResource, currentWorkdir)
  const workflowDefaults = workflowData?.defaults ?? []
  const workflowUserItems = workflowData?.userItems ?? []
  const workflowProjectItems = workflowData?.projectItems ?? []
  const closeCompleteAction = useRef<(() => void) | undefined>(undefined)

  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const wasOpenRef = useRef(false)

  useResetSearchOnOpen(isOpen, searchRef, setSearch, setSelectedIndex, [currentWorkdir])

  useEffect(() => {
    if (isOpen) wasOpenRef.current = true
  }, [isOpen])

  useEffect(() => {
    if (!isOpen && wasOpenRef.current) {
      onCloseComplete?.()
      closeCompleteAction.current?.()
      closeCompleteAction.current = undefined
    }
  }, [isOpen, onCloseComplete])

  const items: ActionItem[] = [
    {
      id: 'create-session',
      name: 'New Session',
      prefix: 'Action > Create',
      action: () => {
        const projectId = currentProjectId ?? getProjectIdFromPath(window.location.pathname)
        if (projectId) navigate(`/p/${projectId}/new`)
      },
    },
    {
      id: 'navigate-session',
      name: 'Another Session',
      prefix: 'Action > Navigate to',
      action: () => {
        closeCompleteAction.current = onCloseCompleteAction
        onClose()
      },
    },
    {
      id: 'search-messages',
      name: 'Messages',
      prefix: 'Action > Search',
      action: () => {
        onClose()
        onSearchMessages?.()
      },
    },
    {
      id: 'toggle-autoscroll',
      name: isAutoScrollActive ? 'Auto-scroll Off' : 'Auto-scroll On',
      prefix: 'Action > Toggle',
      action: () => {
        onClose()
        onToggleAutoScroll?.(!isAutoScrollActive)
      },
    },
    ...agents
      .filter((a) => !a.subagent && a.id !== currentMode)
      .map((a) => ({
        id: a.id,
        name: a.name,
        prefix: 'Agent > Switch to',
        action: () => sessionId && switchMode(sessionId, a.id),
      })),
    ...dedupById(dedupById(commandDefaults, commandUserItems), commandProjectItems).map((c) => ({
      id: c.id,
      name: c.name,
      prefix: 'Command > Launch',
      action: () => onSelectCommand(c.id, textareaContent),
    })),
    ...dedupById(dedupById(workflowDefaults, workflowUserItems), workflowProjectItems).map((w) => ({
      id: w.id,
      name: w.name,
      prefix: 'Workflow > Run',
      action: () => onSelectWorkflow(w.id, w.scope),
    })),
    ...(['normal', 'dangerous'] as const)
      .filter((m) => m !== currentDangerLevel)
      .map((m) => ({
        id: m,
        name: m.charAt(0).toUpperCase() + m.slice(1),
        prefix: 'Mode > Switch to',
        action: () => sessionId && switchDangerLevel(sessionId, m),
      })),
  ]

  const filteredItems = items.filter((item) => fuzzyMatch(`${item.prefix} ${item.name}`, search))
  const maxIndex = filteredItems.length - 1

  const handleKeyDown = (e: React.KeyboardEvent) => {
    handleModalNavigation(
      e,
      maxIndex,
      setSelectedIndex,
      () => {
        filteredItems[selectedIndex]?.action()
        onClose()
      },
      onClose,
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Quick Actions" size="md" scrollable={false}>
      <SearchResultsList
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value)
          setSelectedIndex(0)
        }}
        onSearchKeyDown={handleKeyDown}
        placeholder="Search..."
        searchRef={searchRef}
        rows={filteredItems.map((item, index) => (
          <SelectableListButton
            key={item.id}
            selected={index === selectedIndex}
            onClick={() => {
              item.action()
              onClose()
            }}
          >
            <span className="text-text-muted font-normal">{item.prefix} </span>
            <span>{item.name}</span>
          </SelectableListButton>
        ))}
        emptyText={
          commandDefaults.length + commandUserItems.length + workflowDefaults.length + workflowUserItems.length > 0
            ? 'No matches'
            : 'No agents, commands, or workflows yet'
        }
      />
    </Modal>
  )
}
