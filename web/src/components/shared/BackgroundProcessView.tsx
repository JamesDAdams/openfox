import { memo } from 'react'
import type { BackgroundProcess, LogLine } from '@shared/protocol.js'

interface BackgroundProcessViewProps {
  result: string
  action: string
}

export const BackgroundProcessView = memo(function BackgroundProcessView({
  result,
  action,
}: BackgroundProcessViewProps) {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(result) as Record<string, unknown>
  } catch {
    console.warn('BackgroundProcessView: failed to parse result JSON', result.slice(0, 200))
    return <pre className="text-xs bg-bg-primary p-1.5 rounded overflow-x-auto max-h-[60vh] break-words">{result}</pre>
  }

  if (action === 'logs') {
    return renderLogs(parsed)
  }

  if (action === 'list') {
    return renderProcessList(parsed)
  }

  if (action === 'status') {
    return renderProcessStatus(parsed)
  }

  if (action === 'start' || action === 'stop') {
    return renderStartStop(parsed)
  }

  // Unknown action
  return (
    <div className="space-y-2 text-xs">
      <div className="text-accent-warning">Unknown action: {action}</div>
      <pre className="text-xs bg-bg-primary p-1.5 rounded overflow-x-auto max-h-[60vh] break-words">{result}</pre>
    </div>
  )
})

function renderLogs(parsed: Record<string, unknown>) {
  const lines = parsed.lines as LogLine[] | undefined
  const hasMore = parsed.hasMore as boolean | undefined
  const totalLines = parsed.totalLines as number | undefined

  if (!lines || lines.length === 0) {
    return <div className="text-xs text-text-muted italic">No log output</div>
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-mono whitespace-pre-wrap bg-bg-primary p-2 rounded max-h-[60vh] overflow-y-auto break-words">
        {lines.map((line, i) => (
          <div key={i} className={line.stream === 'stderr' ? 'text-accent-warning' : ''}>
            {line.content}
          </div>
        ))}
      </div>
      {hasMore && totalLines != null && (
        <div className="text-[10px] text-text-muted">
          Showing {lines.length} of {totalLines} lines
        </div>
      )}
    </div>
  )
}

function renderProcessList(parsed: Record<string, unknown>) {
  const processes = parsed.processes as BackgroundProcess[] | undefined
  const currentCount = parsed.currentCount as number | undefined
  const maxPerSession = parsed.maxPerSession as number | undefined

  if (!processes || processes.length === 0) {
    return <div className="text-xs text-text-muted italic">No background processes</div>
  }

  return (
    <div className="space-y-2">
      {processes.map((proc) => (
        <ProcessCard key={proc.id} process={proc} />
      ))}
      {currentCount != null && maxPerSession != null && (
        <div className="text-[10px] text-text-muted">
          {currentCount} of {maxPerSession} slots used
        </div>
      )}
    </div>
  )
}

function renderProcessStatus(parsed: Record<string, unknown>) {
  const proc = parsed.process as BackgroundProcess | undefined
  const uptime = parsed.uptime as number | null | undefined

  if (!proc) {
    return <div className="text-xs text-text-muted italic">Process not found</div>
  }

  return (
    <div className="space-y-2">
      <ProcessCard process={proc} />
      {uptime != null && <div className="text-[10px] text-text-muted">Uptime: {formatDuration(uptime)}</div>}
    </div>
  )
}

function renderStartStop(parsed: Record<string, unknown>) {
  const procId = parsed.processId as string | undefined
  const procName = parsed.name as string | undefined
  const pid = parsed.pid as number | undefined
  const procStatus = parsed.status as string | undefined

  const statusColor =
    procStatus === 'running'
      ? 'text-accent-success'
      : procStatus === 'removed' || procStatus === 'exited'
        ? 'text-text-muted'
        : 'text-text-muted'

  return (
    <div className="space-y-2 text-xs">
      {procName && (
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Name:</span>
          <span className="font-medium">{procName}</span>
        </div>
      )}
      {procId && (
        <div className="flex items-center gap-2">
          <span className="text-text-muted">ID:</span>
          <span className="font-mono">{procId}</span>
        </div>
      )}
      {pid != null && (
        <div className="flex items-center gap-2">
          <span className="text-text-muted">PID:</span>
          <span className="font-mono">{pid}</span>
        </div>
      )}
      {procStatus && (
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Status:</span>
          <span className={`font-medium ${statusColor}`}>{procStatus}</span>
        </div>
      )}
    </div>
  )
}

function ProcessCard({ process }: { process: BackgroundProcess }) {
  const statusColor =
    process.status === 'running'
      ? 'text-accent-success'
      : process.status === 'exited'
        ? 'text-text-muted'
        : 'text-text-muted'

  return (
    <div className="border border-border rounded p-2 space-y-1 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{process.name}</span>
        <span className={`${statusColor}`}>{process.status}</span>
      </div>
      {process.pid != null && (
        <div className="text-text-muted">
          PID: <span className="font-mono">{process.pid}</span>
        </div>
      )}
      {process.command && <div className="text-text-muted font-mono truncate">{process.command}</div>}
    </div>
  )
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}
