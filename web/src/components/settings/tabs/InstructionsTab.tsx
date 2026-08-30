import { useState, useEffect } from 'react'
import { Button } from '../../shared/Button'
import { SETTINGS_KEYS, setSetting } from '../../../lib/resources'
import { useSetting } from '../../../hooks/useSetting'

export function InstructionsTab() {
  const { value: globalInstructions, loading } = useSetting(SETTINGS_KEYS.GLOBAL_INSTRUCTIONS)
  const isLoading = loading

  const [localValue, setLocalValue] = useState(globalInstructions)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLocalValue(globalInstructions)
    setIsDirty(false)
  }, [globalInstructions])

  const handleSave = async () => {
    setSaving(true)
    await setSetting(SETTINGS_KEYS.GLOBAL_INSTRUCTIONS, localValue)
    setSaving(false)
    setIsDirty(false)
  }

  const handleDiscard = () => {
    setLocalValue(globalInstructions)
    setIsDirty(false)
  }

  const isBusy = isLoading || saving

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">Global Instructions</label>
        <p className="text-sm text-text-muted mb-2">
          These instructions are injected into every prompt, regardless of project.
        </p>
        <textarea
          value={localValue}
          onChange={(e) => {
            setLocalValue(e.target.value)
            setIsDirty(true)
          }}
          placeholder="Enter global instructions that apply to all projects..."
          className="w-full min-h-80 px-3 py-2 bg-bg-tertiary border border-border rounded text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-accent-primary"
          disabled={isBusy}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={handleDiscard} disabled={!isDirty}>
          Discard
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={!isDirty || isBusy}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
