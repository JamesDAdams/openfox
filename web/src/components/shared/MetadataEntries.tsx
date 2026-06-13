import { memo } from 'react'
import type { MetadataEntry } from '@shared/types.js'

interface MetadataEntriesProps {
  entries: MetadataEntry[]
  title?: string
  compact?: boolean
}

const statusColors: Record<string, string> = {
  passed: 'text-accent-success',
  completed: 'text-purple-400',
  failed: 'text-accent-error',
  resolved: 'text-accent-success',
  dismissed: 'text-text-muted',
  pending: 'text-text-muted',
  in_progress: 'text-accent-warning',
}

const statusIcons: Record<string, string> = {
  passed: '✓',
  completed: '◉',
  failed: '✗',
  resolved: '✓',
  dismissed: '–',
  pending: '○',
  in_progress: '◌',
}

export const MetadataEntries = memo(function MetadataEntries({ entries, title, compact }: MetadataEntriesProps) {
  if (entries.length === 0) return null

  const textSize = compact ? 'text-xs' : 'text-sm'
  const px = compact ? 'px-1.5' : 'px-2'
  const py = compact ? 'py-1' : 'py-1.5'
  const gap = compact ? 'gap-1' : 'gap-2'
  const titlePy = compact ? 'py-1' : 'py-1.5'

  return (
    <div className="my-1 rounded border border-border bg-secondary overflow-hidden">
      {title && (
        <div className={`${px} ${titlePy} border-b border-border bg-secondary`}>
          <span className="text-xs font-medium text-text-muted">{title}</span>
        </div>
      )}
      <div className="bg-primary">
        {entries.map((entry, idx) => {
          const color = statusColors[entry.status] ?? 'text-text-muted'
          const icon = statusIcons[entry.status] ?? '○'
          return (
            <div
              key={entry.id ?? idx}
              className={`flex items-start ${gap} ${px} ${py} ${idx > 0 ? 'border-t border-border' : ''}`}
            >
              <span className={`${color} ${textSize} leading-tight flex-shrink-0`}>{icon}</span>
              <div className={`flex-1 min-w-0 ${textSize}`}>
                <span className="text-text-muted">[{entry.id}] </span>
                {entry.description}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
