import { create } from 'zustand'
import type { WorktreeConfig } from '@shared/worktree.js'
import { authFetch } from '../lib/api'

interface WorktreeConfigStore {
  config: WorktreeConfig | null
  loading: boolean

  fetchConfig: (workdir: string) => Promise<void>
  saveConfig: (workdir: string, config: WorktreeConfig) => Promise<void>
}

export const useWorktreeConfigStore = create<WorktreeConfigStore>()((set) => ({
  config: null,
  loading: false,

  fetchConfig: async (workdir) => {
    set({ loading: true })
    try {
      const res = await authFetch(`/api/worktree/config?workdir=${encodeURIComponent(workdir)}`)
      const data = await res.json()
      set({ config: data.config ?? null, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  saveConfig: async (workdir, config) => {
    const res = await authFetch(`/api/worktree/config?workdir=${encodeURIComponent(workdir)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) throw new Error('Failed to save worktree config')
    const data = await res.json()
    set({ config: data.config ?? config })
  },
}))
