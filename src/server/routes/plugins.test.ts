import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPluginRoutes } from './plugins.js'
import { ProviderRegistry } from '../providers/plugins/registry.js'
import type { ProviderPluginDiagnostic } from '../providers/plugins/index.js'
import { closeDatabase, initDatabase } from '../db/index.js'
import { loadConfig } from '../config.js'

function createApp(options?: Partial<Parameters<typeof createPluginRoutes>[0]>) {
  const app = express()
  app.use(express.json())
  const providerAdapters = new ProviderRegistry({ mode: 'production', configDirectory: '/tmp/openfox' })
  const pluginDiagnostics: ProviderPluginDiagnostic[] = []
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  app.use(
    '/api/plugins',
    createPluginRoutes({
      config: { mode: 'production' } as any,
      providerAdapters,
      pluginDiagnostics,
      logger,
      ...options,
    }),
  )
  return { app, providerAdapters, pluginDiagnostics, logger }
}

describe('plugin routes', () => {
  let rootDir: string
  let server: ReturnType<express.Express['listen']>
  let baseUrl: string

  beforeEach(async () => {
    closeDatabase()
    const cfg = loadConfig()
    cfg.database.path = ':memory:'
    initDatabase(cfg)
    rootDir = await mkdtemp(join(tmpdir(), 'openfox-plugins-'))
    const { app } = createApp({
      config: { mode: 'test', providers: [] } as any,
    })
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${(server.address() as { port: number }).port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(rootDir, { recursive: true, force: true })
  })

  describe('GET /registry', () => {
    it('returns the plugin registry with plugins array', async () => {
      const res = await fetch(`${baseUrl}/api/plugins/registry`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { plugins: Array<{ name: string; displayName: string }> }
      expect(Array.isArray(body.plugins)).toBe(true)
      expect(body.plugins.length).toBeGreaterThan(0)
      expect(body.plugins[0]).toHaveProperty('name')
      expect(body.plugins[0]).toHaveProperty('displayName')
    })
  })

  describe('POST /install', () => {
    it('rejects missing githubUrl', async () => {
      const res = await fetch(`${baseUrl}/api/plugins/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('githubUrl is required')
    })

    it('rejects non-string githubUrl', async () => {
      const res = await fetch(`${baseUrl}/api/plugins/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ githubUrl: 123 }),
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('githubUrl is required')
    })

    it('rejects invalid GitHub URL format', async () => {
      const res = await fetch(`${baseUrl}/api/plugins/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ githubUrl: 'https://example.com/repo' }),
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('Invalid GitHub URL')
    })

    it('rejects malformed repository name', async () => {
      const res = await fetch(`${baseUrl}/api/plugins/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ githubUrl: 'https://github.com/user/repo<script>' }),
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('Invalid repository name')
    })
  })

  describe('GET /installed', () => {
    it('returns empty list when no plugins directory exists', async () => {
      const res = await fetch(`${baseUrl}/api/plugins/installed`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { installed: unknown[] }
      expect(body).toEqual({ installed: [] })
    })
  })

  describe('GET /:name/settings and POST /:name/settings', () => {
    it('returns settings spec and saved values', async () => {
      const appWithSpec = createApp({
        config: { mode: 'test', providers: [] } as any,
      })
      appWithSpec.providerAdapters.registerSettingsForPlugin('test-plugin', {
        title: 'Test Plugin Settings',
        description: 'Configure test plugin options',
        fields: [
          { key: 'apiKey', label: 'API Key', type: 'password', required: true },
          { key: 'enableFeature', label: 'Enable Feature', type: 'boolean', defaultValue: true },
        ],
      })
      const lServer = appWithSpec.app.listen(0)
      const lUrl = `http://localhost:${(lServer.address() as { port: number }).port}`

      try {
        const resGet1 = await fetch(`${lUrl}/api/plugins/test-plugin/settings`)
        expect(resGet1.status).toBe(200)
        const bodyGet1 = (await resGet1.json()) as {
          name: string
          hasSpec: boolean
          spec: any
          values: Record<string, unknown>
        }
        expect(bodyGet1.hasSpec).toBe(true)
        expect(bodyGet1.spec.title).toBe('Test Plugin Settings')
        expect(bodyGet1.values['enableFeature']).toBe(true)

        const resPost = await fetch(`${lUrl}/api/plugins/test-plugin/settings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ values: { apiKey: 'secret123', enableFeature: false } }),
        })
        expect(resPost.status).toBe(200)
        const bodyPost = (await resPost.json()) as { success: boolean; values: Record<string, unknown> }
        expect(bodyPost.success).toBe(true)
        expect(bodyPost.values).toEqual({ apiKey: 'secret123', enableFeature: false })

        const resGet2 = await fetch(`${lUrl}/api/plugins/test-plugin/settings`)
        const bodyGet2 = (await resGet2.json()) as { values: Record<string, unknown> }
        // password field must not be echoed back on GET
        expect(bodyGet2.values).toEqual({ enableFeature: false })
      } finally {
        lServer.close()
      }
    })
  })

  describe('DELETE /:name', () => {
    it('rejects plugin name with dots', async () => {
      const res = await fetch(`${baseUrl}/api/plugins/my.plugin`, {
        method: 'DELETE',
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('Invalid plugin name')
    })

    it('rejects plugin name with special characters', async () => {
      const res = await fetch(`${baseUrl}/api/plugins/my-plugin<script>`, {
        method: 'DELETE',
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('Invalid plugin name')
    })
  })
})
