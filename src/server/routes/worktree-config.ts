import { Router } from 'express'
import { loadWorktreeConfig, saveWorktreeConfig } from '../git/worktree-config.js'

export function createWorktreeConfigRoutes(): Router {
  const router = Router()

  router.get('/config', async (req, res) => {
    const workdir = req.query['workdir'] as string
    if (!workdir) return res.status(400).json({ error: 'workdir required' })
    const config = await loadWorktreeConfig(workdir)
    res.json({ config })
  })

  router.post('/config', async (req, res) => {
    const workdir = req.query['workdir'] as string
    if (!workdir) return res.status(400).json({ error: 'workdir required' })
    const { ignoredAssets, overrides } = req.body
    if (!ignoredAssets || !['symlink', 'copy', 'skip'].includes(ignoredAssets)) {
      return res.status(400).json({ error: 'ignoredAssets must be one of: symlink, copy, skip' })
    }
    try {
      const config = { ignoredAssets, overrides: overrides ?? undefined }
      await saveWorktreeConfig(workdir, config)
      res.json({ config })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save config' })
    }
  })

  return router
}
