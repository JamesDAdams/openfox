import { useState, useEffect } from 'react'
import type { Project, DangerLevel } from '@shared/types.js'
import { Modal } from '../shared/SelfContainedModal'
import { ModalFooter } from '../shared/ModalFooter'
import { KvCacheWarning } from '../shared/KvCacheWarning'
import { useProjectStore } from '../../stores/project'

interface ProjectSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project
}

export function ProjectSettingsModal({ isOpen, onClose, project }: ProjectSettingsModalProps) {
  const updateProject = useProjectStore((state) => state.updateProject)

  const [customInstructions, setCustomInstructions] = useState(project.customInstructions ?? '')
  const [dangerLevel, setDangerLevel] = useState<DangerLevel | ''>(project.dangerLevel ?? '')
  const [instructionsDirty, setInstructionsDirty] = useState(false)
  const [dangerLevelDirty, setDangerLevelDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const isDirty = instructionsDirty || dangerLevelDirty

  useEffect(() => {
    setCustomInstructions(project.customInstructions ?? '')
    setDangerLevel(project.dangerLevel ?? '')
    setInstructionsDirty(false)
    setDangerLevelDirty(false)
  }, [project])

  const handleInstructionsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCustomInstructions(e.target.value)
    setInstructionsDirty(true)
  }

  const handleDangerLevelChange = (value: DangerLevel | '') => {
    setDangerLevel(value)
    setDangerLevelDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const dangerLevelValue = dangerLevel === '' ? null : dangerLevel
    await updateProject(project.id, {
      customInstructions: customInstructions || null,
      dangerLevel: dangerLevelValue,
    })
    setSaving(false)
    setInstructionsDirty(false)
    setDangerLevelDirty(false)
    onClose()
  }

  const handleCancel = () => {
    setCustomInstructions(project.customInstructions ?? '')
    setDangerLevel(project.dangerLevel ?? '')
    setInstructionsDirty(false)
    setDangerLevelDirty(false)
    onClose()
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

        {instructionsDirty && <KvCacheWarning />}
      </div>
    </Modal>
  )
}
