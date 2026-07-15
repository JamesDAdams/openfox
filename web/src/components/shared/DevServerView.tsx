import { memo } from 'react'

interface DevServerViewProps {
  result: string
  action: string
}

interface LogsData {
  logs?: string
  total?: number
  offset?: number
  limit?: number
  hasMore?: boolean
}

interface StatusData {
  state?: string
  url?: string
  error?: string
}

export const DevServerView = memo(function DevServerView({ result, action }: DevServerViewProps) {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(result) as Record<string, unknown>
  } catch {
    console.warn('DevServerView: failed to parse result JSON', result.slice(0, 200))
    return <pre className="text-xs bg-bg-primary p-1.5 rounded overflow-x-auto max-h-[60vh] break-words">{result}</pre>
  }

  if (action === 'logs') {
    return renderLogs(parsed as LogsData)
  }

  return renderStatus(parsed as StatusData)
})

function renderLogs(data: LogsData) {
  if (!data.logs) {
    return <div className="text-xs text-text-muted italic">No log output</div>
  }

  const lines = data.logs.split('\n')
  return (
    <div className="space-y-2">
      <div className="text-xs font-mono whitespace-pre-wrap bg-bg-primary p-2 rounded max-h-[60vh] overflow-y-auto break-words">
        {lines.map((line, i) => {
          const isStderr = line.startsWith('[stderr] ')
          return (
            <div key={i} className={isStderr ? 'text-accent-warning' : ''}>
              {isStderr ? line.slice('[stderr] '.length) : line}
            </div>
          )
        })}
      </div>
      {data.hasMore && (
        <div className="text-[10px] text-text-muted">
          Showing {data.limit} of {data.total} lines
        </div>
      )}
    </div>
  )
}

function renderStatus(data: StatusData) {
  const state = String(data.state ?? '')
  const url = String(data.url ?? '')
  const errorMsg = data.error ? String(data.error) : undefined

  const stateColor =
    state === 'running'
      ? 'text-accent-success'
      : state === 'stopped'
        ? 'text-text-muted'
        : state === 'error'
          ? 'text-accent-error'
          : 'text-text-muted'

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-text-muted">State:</span>
        <span className={`font-medium ${stateColor}`}>{state}</span>
      </div>
      {url && url !== 'undefined' && (
        <div className="flex items-center gap-2">
          <span className="text-text-muted">URL:</span>
          <a href={url} className="text-accent-primary hover:underline" target="_blank" rel="noopener noreferrer">
            {url}
          </a>
        </div>
      )}
      {errorMsg && <div className="text-accent-error bg-accent-error/10 p-2 rounded">{errorMsg}</div>}
    </div>
  )
}
