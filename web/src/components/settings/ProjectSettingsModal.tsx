import { useState, useEffect } from 'react'
import type { Project, DangerLevel } from '@shared/types.js'
import type { WorktreeAssetStrategy } from '@shared/worktree.js'
import { Modal } from '../shared/SelfContainedModal'
import { ModalFooter } from '../shared/ModalFooter'
import { useProjectStore } from '../../stores/project'
import { useWorktreeConfigStore } from '../../stores/worktree-config'
import { wsClient } from '../../lib/ws'

interface OverrideRow {
  path: string
  strategy: WorktreeAssetStrategy
}

interface ProjectSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project
}

export function ProjectSettingsModal({ isOpen, onClose, project }: ProjectSettingsModalProps) {
  const updateProject = useProjectStore((state) => state.updateProject)
  const wtConfig = useWorktreeConfigStore((s) => s.config)
  const wtLoading = useWorktreeConfigStore((s) => s.loading)
  const fetchWtConfig = useWorktreeConfigStore((s) => s.fetchConfig)
  const saveWtConfig = useWorktreeConfigStore((s) => s.saveConfig)

  const handleClose = () => {
    try {
      wsClient.send('context.checkDynamic', {})
    } catch {
      // WS might not be connected
    }
    onClose()
  }

  const [customInstructions, setCustomInstructions] = useState(project.customInstructions ?? '')
  const [dangerLevel, setDangerLevel] = useState<DangerLevel | ''>(project.dangerLevel ?? '')
  const [instructionsDirty, setInstructionsDirty] = useState(false)
  const [dangerLevelDirty, setDangerLevelDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [wtStrategy, setWtStrategy] = useState<WorktreeAssetStrategy>('symlink')
  const [wtOverrides, setWtOverrides] = useState<OverrideRow[]>([])
  const [wtDirty, setWtDirty] = useState(false)

  const isDirty = instructionsDirty || dangerLevelDirty || wtDirty

  useEffect(() => {
    if (isOpen) {
      setCustomInstructions(project.customInstructions ?? '')
      setDangerLevel(project.dangerLevel ?? '')
      setInstructionsDirty(false)
      setDangerLevelDirty(false)
      setWtDirty(false)
      fetchWtConfig(project.workdir)
    }
  }, [isOpen, project, fetchWtConfig])

  useEffect(() => {
    if (wtConfig) {
      setWtStrategy(wtConfig.ignoredAssets)
      setWtOverrides(Object.entries(wtConfig.overrides ?? {}).map(([path, strategy]) => ({ path, strategy })))
    } else {
      setWtStrategy('symlink')
      setWtOverrides([])
    }
  }, [wtConfig])

  const handleInstructionsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCustomInstructions(e.target.value)
    setInstructionsDirty(true)
  }

  const handleDangerLevelChange = (value: DangerLevel | '') => {
    setDangerLevel(value)
    setDangerLevelDirty(true)
  }

  const handleWtStrategyChange = (value: WorktreeAssetStrategy) => {
    setWtStrategy(value)
    setWtDirty(true)
  }

  const handleOverrideChange = (index: number, field: keyof OverrideRow, value: string) => {
    setWtOverrides((prev) => {
      const next = [...prev]
      if (next[index]) {
        next[index] = { ...next[index]!, [field]: value }
      }
      return next
    })
    setWtDirty(true)
  }

  const addOverride = () => {
    setWtOverrides((prev) => [...prev, { path: '', strategy: 'symlink' }])
    setWtDirty(true)
  }

  const removeOverride = (index: number) => {
    setWtOverrides((prev) => prev.filter((_, i) => i !== index))
    setWtDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const dangerLevelValue = dangerLevel === '' ? null : dangerLevel
      await updateProject(project.id, {
        customInstructions: customInstructions || null,
        dangerLevel: dangerLevelValue,
      })
      if (wtDirty) {
        const overrides: Record<string, WorktreeAssetStrategy> = {}
        for (const row of wtOverrides) {
          if (row.path.trim()) {
            overrides[row.path.trim()] = row.strategy
          }
        }
        await saveWtConfig(project.workdir, {
          ignoredAssets: wtStrategy,
          overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        })
      }
      setInstructionsDirty(false)
      setDangerLevelDirty(false)
      setWtDirty(false)
      handleClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setCustomInstructions(project.customInstructions ?? '')
    setDangerLevel(project.dangerLevel ?? '')
    setInstructionsDirty(false)
    setDangerLevelDirty(false)
    setWtDirty(false)
    handleClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title={`${project.name} Settings`}
      size="lg"
      footer={
        <ModalFooter onCancel={handleCancel} onSave={handleSave} saving={saving} saveDisabled={!isDirty || saving} />
      }
    >
      <div className="flex flex-col gap-5 -mt-1">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1 flex-shrink-0">Default Danger Level</label>
          <p className="text-sm text-text-muted mb-3">
            Default danger level for new sessions in this project. Existing sessions are not affected.
          </p>
          <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-bg-tertiary/50 w-fit">
            <button
              type="button"
              onClick={() => handleDangerLevelChange('')}
              className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                dangerLevel === ''
                  ? 'bg-bg-tertiary text-text-primary border border-border'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
              }`}
              title="Use global default (Normal)"
            >
              Default
            </button>
            <button
              type="button"
              onClick={() => handleDangerLevelChange('normal')}
              className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                dangerLevel === 'normal'
                  ? 'bg-accent-success/20 text-accent-success border border-accent-success/30'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
              }`}
              title="Normal mode - requires path confirmation"
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => handleDangerLevelChange('dangerous')}
              className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                dangerLevel === 'dangerous'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
              }`}
              title="Dangerous mode - bypasses all confirmations"
            >
              Dangerous
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1 flex-shrink-0">Project Path</label>
          <p className="text-sm text-text-muted font-mono">{project.workdir}</p>
        </div>

        <div className="flex-1 min-h-[150px] pb-4">
          <label className="block text-sm font-medium text-text-primary mb-1 flex-shrink-0">Project Instructions</label>
          <p className="text-sm text-text-muted mb-3 flex-shrink-0">
            These instructions are injected into prompts when working in this project. They are applied after global
            instructions but before AGENTS.md files.
          </p>
          <textarea
            value={customInstructions}
            onChange={handleInstructionsChange}
            placeholder="Enter project-specific instructions..."
            className="w-full h-full px-3 py-2 mb-3 bg-bg-tertiary border border-border rounded text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-accent-primary"
            disabled={saving}
          />
        </div>

        <div className="border-t border-border pt-4">
          <label className="block text-sm font-medium text-text-primary mb-1">Worktree Asset Strategy</label>
          <p className="text-sm text-text-muted mb-3">
            Controls how .gitignored files (e.g. node_modules) are handled when creating a worktree. Symlink is fast and
            saves disk space. Copy works when tools don't follow symlinks.
          </p>

          {wtLoading && <div className="text-xs text-text-muted mb-2">Loading config...</div>}

          <div className="flex items-center gap-2 mb-4">
            {(['symlink', 'copy', 'skip'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleWtStrategyChange(option)}
                className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                  wtStrategy === option
                    ? 'bg-bg-tertiary text-text-primary border border-border'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>

          <label className="block text-xs font-medium text-text-secondary mb-1">Per-path overrides</label>
          <div className="space-y-2">
            {wtOverrides.map((override, index) => (
              <div key={index} className={`flex items-center gap-2 ${!override.path.trim() ? 'opacity-50' : ''}`}>
                <input
                  type="text"
                  value={override.path}
                  onChange={(e) => handleOverrideChange(index, 'path', e.target.value)}
                  placeholder="e.g. node_modules"
                  className="input flex-1 text-sm"
                />
                <select
                  value={override.strategy}
                  onChange={(e) => handleOverrideChange(index, 'strategy', e.target.value)}
                  className="input w-28 text-sm"
                >
                  <option value="symlink">Symlink</option>
                  <option value="copy">Copy</option>
                  <option value="skip">Skip</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeOverride(index)}
                  className="text-text-muted hover:text-red-400 text-sm px-1"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addOverride}
              className="text-xs text-accent-primary hover:text-accent-primary/80 transition-colors"
            >
              + Add override
            </button>
          </div>
        </div>

        {saveError && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
            {saveError}
          </div>
        )}
      </div>
    </Modal>
  )
}
