import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncIgnoredAssets } from './worktree.js'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  symlink: vi.fn(),
  cp: vi.fn(),
  stat: vi.fn(),
}))

vi.mock('../utils/logger.js', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { readFile, symlink, cp, stat } from 'node:fs/promises'

const PROJECT_DIR = '/tmp/project'
const WORKTREE_PATH = '/tmp/project/worktrees/test-branch'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('syncIgnoredAssets', () => {
  it('does nothing when .gitignore is missing', async () => {
    vi.mocked(readFile).mockRejectedValue({ code: 'ENOENT' })
    await syncIgnoredAssets(PROJECT_DIR, WORKTREE_PATH, { ignoredAssets: 'symlink' })
    expect(symlink).not.toHaveBeenCalled()
    expect(cp).not.toHaveBeenCalled()
  })

  it('symlinks ignored paths with symlink strategy', async () => {
    vi.mocked(readFile).mockResolvedValue('node_modules/\n.env\n')
    vi.mocked(stat)
      .mockResolvedValueOnce({} as any) // node_modules exists in source
      .mockRejectedValueOnce({ code: 'ENOENT' }) // node_modules not in worktree
      .mockResolvedValueOnce({} as any) // .env exists in source
      .mockRejectedValueOnce({ code: 'ENOENT' }) // .env not in worktree
    vi.mocked(symlink).mockResolvedValue(undefined)

    await syncIgnoredAssets(PROJECT_DIR, WORKTREE_PATH, { ignoredAssets: 'symlink' })

    expect(symlink).toHaveBeenCalledTimes(2)
    expect(symlink).toHaveBeenCalledWith('/tmp/project/node_modules', '/tmp/project/worktrees/test-branch/node_modules')
    expect(symlink).toHaveBeenCalledWith('/tmp/project/.env', '/tmp/project/worktrees/test-branch/.env')
  })

  it('copies ignored paths with copy strategy', async () => {
    vi.mocked(readFile).mockResolvedValue('node_modules/\n')
    vi.mocked(stat)
      .mockResolvedValueOnce({} as any) // exists in source
      .mockRejectedValueOnce({ code: 'ENOENT' }) // not in worktree
    vi.mocked(cp).mockResolvedValue(undefined)

    await syncIgnoredAssets(PROJECT_DIR, WORKTREE_PATH, { ignoredAssets: 'copy' })

    expect(cp).toHaveBeenCalledTimes(1)
    expect(cp).toHaveBeenCalledWith('/tmp/project/node_modules', '/tmp/project/worktrees/test-branch/node_modules', {
      recursive: true,
    })
  })

  it('skips paths that already exist in worktree', async () => {
    vi.mocked(readFile).mockResolvedValue('node_modules/\n')
    vi.mocked(stat)
      .mockResolvedValueOnce({} as any) // exists in source
      .mockResolvedValueOnce({} as any) // already exists in worktree

    await syncIgnoredAssets(PROJECT_DIR, WORKTREE_PATH, { ignoredAssets: 'symlink' })

    expect(symlink).not.toHaveBeenCalled()
  })

  it('skips paths that do not exist in source', async () => {
    vi.mocked(readFile).mockResolvedValue('node_modules/\n')
    vi.mocked(stat).mockRejectedValue({ code: 'ENOENT' }) // doesn't exist in source

    await syncIgnoredAssets(PROJECT_DIR, WORKTREE_PATH, { ignoredAssets: 'symlink' })

    expect(symlink).not.toHaveBeenCalled()
  })

  it('respects per-path overrides', async () => {
    vi.mocked(readFile).mockResolvedValue('node_modules/\n.vendor/\n')
    vi.mocked(stat)
      .mockResolvedValueOnce({} as any) // node_modules exists
      .mockRejectedValueOnce({ code: 'ENOENT' }) // not in worktree
      .mockResolvedValueOnce({} as any) // .vendor exists
      .mockRejectedValueOnce({ code: 'ENOENT' }) // not in worktree
    vi.mocked(symlink).mockResolvedValue(undefined)
    vi.mocked(cp).mockResolvedValue(undefined)

    await syncIgnoredAssets(PROJECT_DIR, WORKTREE_PATH, {
      ignoredAssets: 'symlink',
      overrides: { node_modules: 'copy' },
    })

    expect(cp).toHaveBeenCalledTimes(1) // node_modules copied
    expect(symlink).toHaveBeenCalledTimes(1) // .vendor symlinked
  })

  it('handles skip strategy gracefully', async () => {
    vi.mocked(readFile).mockResolvedValue('node_modules/\n')
    vi.mocked(stat)
      .mockResolvedValueOnce({} as any) // exists in source
      .mockRejectedValueOnce({ code: 'ENOENT' }) // not in worktree

    await syncIgnoredAssets(PROJECT_DIR, WORKTREE_PATH, { ignoredAssets: 'skip' })

    expect(symlink).not.toHaveBeenCalled()
    expect(cp).not.toHaveBeenCalled()
  })

  it('continues on symlink error and logs warning', async () => {
    vi.mocked(readFile).mockResolvedValue('node_modules/\n.env\n')
    vi.mocked(stat)
      .mockResolvedValueOnce({} as any) // node_modules exists
      .mockRejectedValueOnce({ code: 'ENOENT' }) // not in worktree
      .mockResolvedValueOnce({} as any) // .env exists
      .mockRejectedValueOnce({ code: 'ENOENT' }) // not in worktree
    vi.mocked(symlink)
      .mockRejectedValueOnce(new Error('permission denied')) // first fails
      .mockResolvedValueOnce(undefined) // second succeeds

    await syncIgnoredAssets(PROJECT_DIR, WORKTREE_PATH, { ignoredAssets: 'symlink' })

    expect(symlink).toHaveBeenCalledTimes(2)
  })
})
