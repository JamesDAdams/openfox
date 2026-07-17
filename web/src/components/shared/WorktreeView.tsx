import { memo } from 'react'

interface WorktreeViewProps {
  result: string
  action: string
}

interface BranchesData {
  branches?: Array<{ name: string; current: boolean }>
}

interface WorktreeStatusData {
  active?: boolean
  worktree?: string | null
  workdir?: string
  branch?: string
  message?: string
}

export const WorktreeView = memo(function WorktreeView({ result, action }: WorktreeViewProps) {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(result) as Record<string, unknown>
  } catch {
    return <pre className="text-xs bg-bg-primary p-1.5 rounded overflow-x-auto max-h-[60vh] break-words">{result}</pre>
  }

  switch (action) {
    case 'list_branches':
      return renderBranches(parsed as BranchesData)
    case 'status':
      return renderStatus(parsed as WorktreeStatusData)
    case 'create':
    case 'attach':
    case 'close':
      return renderActionResult(parsed as WorktreeStatusData)
    default:
      return (
        <pre className="text-xs bg-bg-primary p-1.5 rounded overflow-x-auto max-h-[60vh] break-words">{result}</pre>
      )
  }
})

function renderBranches(data: BranchesData) {
  const branches = data.branches ?? []
  if (branches.length === 0) {
    return <div className="text-xs text-text-muted italic">No branches found</div>
  }

  return (
    <div className="space-y-1 text-xs">
      <div className="text-text-muted mb-1">Local branches:</div>
      {branches.map((b) => (
        <div key={b.name} className="flex items-center gap-2 font-mono">
          <span className={b.current ? 'text-accent-success' : 'text-text-muted'}>{b.current ? '●' : '○'}</span>
          <span className={b.current ? 'text-text-primary font-medium' : 'text-text-secondary'}>{b.name}</span>
          {b.current && <span className="text-[10px] text-accent-primary">(current)</span>}
        </div>
      ))}
    </div>
  )
}

function renderStatus(data: WorktreeStatusData) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-text-muted">Worktree active:</span>
        <span className={data.active ? 'text-accent-success font-medium' : 'text-text-muted'}>
          {data.active ? 'Yes' : 'No'}
        </span>
      </div>
      {data.active && data.worktree && (
        <>
          <FieldRow label="Path" value={data.worktree} mono />
          {data.branch && <FieldRow label="Branch" value={data.branch} mono />}
        </>
      )}
      {!data.active && <div className="text-text-muted italic">Session is using the project root directory.</div>}
      <div className="flex items-center gap-2">
        <span className="text-text-muted">Project root:</span>
        <span className="font-mono text-text-secondary">{data.workdir}</span>
      </div>
    </div>
  )
}

function FieldRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted">{label}:</span>
      <span className={mono ? 'font-mono text-accent-primary' : 'text-text-primary'}>{value}</span>
    </div>
  )
}

function renderActionResult(data: WorktreeStatusData) {
  return (
    <div className="space-y-2 text-xs">
      {data.message && <div className="text-text-primary">{data.message}</div>}
      {data.worktree && <FieldRow label="Worktree" value={data.worktree} mono />}
      {data.branch && <FieldRow label="Branch" value={data.branch} mono />}
    </div>
  )
}
