import { useState } from 'react'
import { Button } from '../shared/Button'

export interface RetryPatternEntry {
  field: 'thinking' | 'content' | 'both'
  pattern: string
  action: 'retry'
  active: boolean
}

export interface RetryPatternsValue {
  patterns: RetryPatternEntry[]
  maxRetriesPerTurn: number
}

interface RetryPatternsEditorProps {
  value: RetryPatternsValue
  onChange: (value: RetryPatternsValue) => void
}

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

export function RetryPatternsEditor({ value, onChange }: RetryPatternsEditorProps) {
  const [validationErrors, setValidationErrors] = useState<Record<number, boolean>>({})

  const updatePattern = (index: number, updates: Partial<RetryPatternEntry>) => {
    const newPatterns = value.patterns.map((p, i) => (i === index ? { ...p, ...updates } : p))
    onChange({ ...value, patterns: newPatterns })
  }

  const removePattern = (index: number) => {
    const newPatterns = value.patterns.filter((_, i) => i !== index)
    onChange({ ...value, patterns: newPatterns })
  }

  const addPattern = () => {
    const newEntry: RetryPatternEntry = { field: 'content', pattern: '', action: 'retry', active: true }
    onChange({ ...value, patterns: [...value.patterns, newEntry] })
  }

  const handlePatternChange = (index: number, pattern: string) => {
    setValidationErrors((prev) => ({ ...prev, [index]: pattern.length > 0 && !isValidRegex(pattern) }))
    updatePattern(index, { pattern })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-text-primary">Max Retries Per Turn</label>
        <input
          type="number"
          min={1}
          max={100}
          value={value.maxRetriesPerTurn}
          onChange={(e) => {
            const raw = parseInt(e.target.value, 10)
            const clamped = isNaN(raw) ? 10 : Math.max(1, Math.min(100, raw))
            onChange({ ...value, maxRetriesPerTurn: clamped })
          }}
          className="mt-1 block w-24 px-2 py-1 text-sm bg-bg-secondary border border-border rounded"
        />
      </div>

      {value.patterns.length === 0 ? (
        <p className="text-sm text-text-muted">No retry patterns configured.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="pb-2 pr-2 w-12">Active</th>
              <th className="pb-2 pr-2">Field</th>
              <th className="pb-2 pr-2">Pattern</th>
              <th className="pb-2 pr-2">Action</th>
              <th className="pb-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {value.patterns.map((p, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={p.active}
                    onChange={() => updatePattern(i, { active: !p.active })}
                    className="accent-accent-primary"
                    aria-label={`Toggle pattern ${i + 1}`}
                  />
                </td>
                <td className="py-2 pr-2">
                  <select
                    value={p.field}
                    onChange={(e) => updatePattern(i, { field: e.target.value as RetryPatternEntry['field'] })}
                    className="px-2 py-1 bg-bg-secondary border border-border rounded text-sm"
                  >
                    <option value="content">content</option>
                    <option value="thinking">thinking</option>
                    <option value="both">both</option>
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={p.pattern}
                      onChange={(e) => handlePatternChange(i, e.target.value)}
                      placeholder="regex pattern"
                      className="flex-1 px-2 py-1 bg-bg-secondary border border-border rounded text-sm font-mono"
                    />
                    {p.pattern.length > 0 && (
                      <span className={`text-sm ${validationErrors[i] ? 'text-red-500' : 'text-green-500'}`}>
                        {validationErrors[i] ? '✗' : '✓'}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-2 text-text-muted">retry</td>
                <td className="py-2">
                  <button
                    onClick={() => removePattern(i)}
                    title="Remove pattern"
                    className="text-text-muted hover:text-red-500 transition-colors"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Button variant="secondary" onClick={addPattern}>
        Add Pattern
      </Button>
    </div>
  )
}
