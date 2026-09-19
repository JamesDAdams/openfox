import type { ComponentType } from 'react'
import * as iconsModule from '../shared/icons'
import { invokePluginRpc } from '../../lib/plugin-actions'
import { usePluginUiStore } from '../../stores/pluginUi'
import { usePluginToastStore } from '../../stores/pluginToasts'
import type { PluginActivation, PluginBadgeTone, PluginVisibilityCondition } from '@shared/plugin.js'

export type PluginActionContext = {
  sessionId?: string
  workdir?: string
  projectId?: string
  messageId?: string
  tab?: string
  [key: string]: unknown
}

const ICON_EXPORTS: Record<string, string> = {
  bell: 'BellIcon',
  check: 'CheckIcon',
  download: 'DownloadIcon',
  external: 'OpenExternalIcon',
  folder: 'FolderIcon',
  gear: 'GearIcon',
  info: 'InfoIcon',
  play: 'PlayIcon',
  plus: 'PlusIcon',
  puzzle: 'PuzzleIcon',
  refresh: 'ReloadIcon',
  search: 'SearchIcon',
  star: 'StarIcon',
  terminal: 'TerminalIcon',
  trash: 'TrashIcon',
  warning: 'WarningIcon',
}

type IconComponent = ComponentType<{ className?: string }>

/**
 * Resolve a whitelisted icon name lazily so tests that partially mock
 * `shared/icons` only need the icons they actually render.
 */
export function pluginIcon(name: string | undefined): IconComponent {
  const exports = iconsModule as unknown as Record<string, IconComponent | undefined>
  const exportName = name ? ICON_EXPORTS[name] : undefined
  return (exportName ? exports[exportName] : undefined) ?? exports['PuzzleIcon'] ?? MissingIcon
}

function MissingIcon({ className }: { className?: string }) {
  return <span className={className} aria-hidden="true" />
}

const TONE_CLASSES: Record<PluginBadgeTone, string> = {
  neutral: 'bg-bg-tertiary text-text-secondary border-border',
  info: 'bg-accent-primary/10 text-accent-primary border-accent-primary/30',
  success: 'bg-accent-success/10 text-accent-success border-accent-success/30',
  warning: 'bg-accent-warning/10 text-accent-warning border-accent-warning/30',
  danger: 'bg-accent-error/10 text-accent-error border-accent-error/30',
}

export function badgeToneClasses(tone: PluginBadgeTone | undefined): string {
  return TONE_CLASSES[tone ?? 'neutral']
}

/**
 * Evaluate a contribution's declarative visibility against the slot context.
 * Omitted fields impose no constraint; present fields must match the context.
 */
export function isContributionVisible(
  visibleWhen: PluginVisibilityCondition | undefined,
  context: PluginActionContext,
): boolean {
  if (!visibleWhen) return true
  if (visibleWhen.hasSession !== undefined && Boolean(context.sessionId) !== visibleWhen.hasSession) return false
  if (visibleWhen.hasProject !== undefined && Boolean(context.projectId) !== visibleWhen.hasProject) return false
  if (visibleWhen.hasMessage !== undefined && Boolean(context.messageId) !== visibleWhen.hasMessage) return false
  return true
}

const RPC_ERROR_TITLE = { en: 'Plugin action failed', fr: 'Échec de l’action du plugin' }

/** Narrow a slot context to the fields plugin RPC calls accept. */
export function pluginRpcContext(context: PluginActionContext): {
  sessionId?: string
  workdir?: string
  projectId?: string
} {
  return {
    ...(context.sessionId ? { sessionId: context.sessionId } : {}),
    ...(context.workdir ? { workdir: context.workdir } : {}),
    ...(context.projectId ? { projectId: context.projectId } : {}),
  }
}

export async function activatePluginAction(
  pluginId: string | undefined,
  activation: PluginActivation,
  context: PluginActionContext = {},
): Promise<void> {
  if (!pluginId) return
  try {
    if (activation.kind === 'rpc') {
      await invokePluginRpc(pluginId, activation.method, activation.params ?? {}, pluginRpcContext(context))
      return
    }
    if (activation.kind === 'openPanel') {
      usePluginUiStore.getState().openPanel(pluginId, activation.panelId)
      return
    }
    window.open(activation.url, '_blank', 'noopener,noreferrer')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    usePluginToastStore.getState().push({
      id: `plugin-error-${Date.now()}`,
      pluginId,
      title: RPC_ERROR_TITLE,
      body: { en: message, fr: message },
      level: 'error',
      createdAt: new Date().toISOString(),
    })
  }
}
