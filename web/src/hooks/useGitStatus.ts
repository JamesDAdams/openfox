import { useEffect, useState } from 'react'
import { useSessionStore } from '../stores/session'

interface GitDiffFile {
  path: string
  status: 'modified' | 'added' | 'deleted'
  additions: number
  deletions: number
}

interface UseGitStatusResult {
  branch: string | null
  diff: {
    files: GitDiffFile[]
    loading: boolean
    error: string | null
  }
}

export function useGitStatus(): UseGitStatusResult {
  const gitStatus = useSessionStore((s) => s.gitStatus)
  const currentSession = useSessionStore((s) => s.currentSession)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentSession?.workdir) {
      setLoading(false)
    }
  }, [currentSession?.workdir])

  return {
    branch: gitStatus?.branch ?? null,
    diff: {
      files: gitStatus?.diff?.files ?? [],
      loading,
      error: null,
    },
  }
}
