import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { whichMock, detectLanguageMock, getSupportedLanguagesMock, nextStartImpls, serverInstances } = vi.hoisted(
  () => ({
    whichMock: vi.fn(),
    detectLanguageMock: vi.fn(),
    getSupportedLanguagesMock: vi.fn(),
    nextStartImpls: [] as Array<(instance: any) => Promise<void>>,
    serverInstances: [] as any[],
  }),
)

vi.mock('../utils/which.js', () => ({
  which: whichMock,
}))

vi.mock('./languages.js', () => ({
  detectLanguage: detectLanguageMock,
  getSupportedLanguages: getSupportedLanguagesMock,
}))

vi.mock('./server.js', () => {
  class MockLspServer {
    config: any
    workdir: string
    commandPath: string
    running = false
    state = 'stopped'
    diagnostics = [] as any[]
    openDocsCount = 0
    start = vi.fn(async () => {
      const impl = nextStartImpls.shift()
      if (impl) {
        await impl(this)
        return
      }
      this.running = true
      this.state = 'running'
    })
    stop = vi.fn(async () => {
      this.running = false
      this.state = 'stopped'
    })
    didChange = vi.fn(async () => {})
    didOpen = vi.fn(async (_path: string, _content: string) => {
      this.openDocsCount++
    })
    getDiagnosticsWithWait = vi.fn(async () => this.diagnostics)
    getDiagnostics = vi.fn(() => this.diagnostics)
    isRunning = vi.fn(() => this.running)
    getState = vi.fn(() => this.state)
    getLanguage = vi.fn(() => this.config.id ?? 'unknown')
    hasOpenDocuments = vi.fn(() => this.openDocsCount > 0)
    getExtensions = vi.fn(() => this.config.extensions ?? [])
    findWorkspaceSymbol = vi.fn(async (_query: string) => [])
    getDefinition = vi.fn(async () => [])
    getReferences = vi.fn(async () => [])
    getTypeDefinition = vi.fn(async () => [])
    getHoverInfo = vi.fn(async () => null)

    constructor(config: any, workdir: string, commandPath: string) {
      this.config = config
      this.workdir = workdir
      this.commandPath = commandPath
      serverInstances.push(this)
    }
  }

  return { LspServer: MockLspServer }
})

import { LspManager, getLspManager, shutdownAllLspManagers, shutdownLspManager } from './manager.js'

const tsConfig = {
  id: 'typescript',
  name: 'TypeScript',
  extensions: ['.ts'],
  serverCommand: 'typescript-language-server',
  serverArgs: ['--stdio'],
  rootPatterns: ['tsconfig.json'],
}

const sqlConfig = {
  id: 'sql',
  name: 'SQL',
  extensions: ['.sql'],
  serverCommand: 'sql-language-server',
  serverArgs: ['up', '--method', 'stdio'],
  rootPatterns: [],
  installHint: 'npm install -g sql-language-server',
}

describe('LspManager', () => {
  beforeEach(() => {
    whichMock.mockReset()
    detectLanguageMock.mockReset()
    nextStartImpls.length = 0
    serverInstances.length = 0
  })

  afterEach(async () => {
    await shutdownAllLspManagers()
  })

  it('returns empty diagnostics when language is unsupported or server is unavailable', async () => {
    detectLanguageMock.mockReturnValue(null)
    const manager = new LspManager('/tmp/project', 'session-1')

    await expect(manager.notifyFileChange('/tmp/project/file.unknown', 'x')).resolves.toEqual([])
    expect(manager.getDiagnostics('/tmp/project/file.unknown')).toEqual([])
    expect(manager.isAvailableFor('/tmp/project/file.unknown')).toBe(false)

    detectLanguageMock.mockReturnValue(tsConfig)
    whichMock.mockResolvedValue(null)

    await expect(manager.notifyFileChange('/tmp/project/file.ts', 'x')).resolves.toEqual([])
    expect(manager.isAvailableFor('/tmp/project/file.ts')).toBe(false)
  })

  it('starts a server, reuses it, and exposes diagnostics and status', async () => {
    detectLanguageMock.mockReturnValue(tsConfig)
    whichMock.mockResolvedValue('/usr/bin/typescript-language-server')
    const manager = new LspManager('/tmp/project', 'session-1')

    const firstPromise = manager.notifyFileChange('/tmp/project/file.ts', 'const x = 1')
    await firstPromise

    expect(serverInstances).toHaveLength(1)
    const server = serverInstances[0]!
    server.diagnostics = [
      {
        path: '/tmp/project/file.ts',
        severity: 'error',
        message: 'boom',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        source: 'ts',
      },
    ]

    await expect(manager.notifyFileChange('/tmp/project/file.ts', 'const x = 2')).resolves.toEqual(server.diagnostics)
    expect(whichMock).toHaveBeenCalledTimes(1)
    expect(server.start).toHaveBeenCalledTimes(1)
    expect(server.didChange).toHaveBeenCalledTimes(2)
    expect(manager.getDiagnostics('/tmp/project/file.ts')).toEqual(server.diagnostics)
    expect(manager.isAvailableFor('/tmp/project/file.ts')).toBe(true)
    expect(manager.getStatus()).toEqual([{ language: 'typescript', state: 'running' }])
  })

  it('shares a pending server startup across concurrent requests', async () => {
    detectLanguageMock.mockReturnValue(tsConfig)
    whichMock.mockResolvedValue('/usr/bin/typescript-language-server')

    let release!: () => void
    nextStartImpls.push(async (instance) => {
      await new Promise<void>((resolve) => {
        release = () => {
          instance.running = true
          instance.state = 'running'
          resolve()
        }
      })
    })

    const manager = new LspManager('/tmp/project', 'session-1')
    const first = manager.notifyFileChange('/tmp/project/file.ts', 'a')
    const second = manager.notifyFileChange('/tmp/project/file.ts', 'b')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(serverInstances).toHaveLength(1)
    release()
    await Promise.all([first, second])
    expect(serverInstances[0]?.start).toHaveBeenCalledTimes(1)
  })

  it('marks failed starts unavailable and swallows change errors', async () => {
    detectLanguageMock.mockReturnValue(tsConfig)
    whichMock.mockResolvedValue('/usr/bin/typescript-language-server')
    nextStartImpls.push(async () => {
      throw new Error('failed to boot')
    })

    const manager = new LspManager('/tmp/project', 'session-1')
    await expect(manager.notifyFileChange('/tmp/project/file.ts', 'x')).resolves.toEqual([])
    expect(manager.isAvailableFor('/tmp/project/file.ts')).toBe(false)

    const freshManager = new LspManager('/tmp/project', 'session-2')
    whichMock.mockResolvedValue('/usr/bin/typescript-language-server')
    await freshManager.notifyFileChange('/tmp/project/file.ts', 'x')
    const server = serverInstances.at(-1)!
    server.didChange.mockRejectedValueOnce(new Error('change failed'))

    await expect(freshManager.notifyFileChange('/tmp/project/file.ts', 'y')).resolves.toEqual([])
  })

  describe('getInstallHint', () => {
    it('returns hint when server is unavailable and hint is configured', async () => {
      detectLanguageMock.mockReturnValue(sqlConfig)
      whichMock.mockResolvedValue(null)
      const manager = new LspManager('/tmp/project', 'session-hint-1')

      // Trigger server start so it gets marked unavailable
      await manager.notifyFileChange('/tmp/project/query.sql', 'SELECT 1')

      expect(manager.getInstallHint('/tmp/project/query.sql')).toBe('npm install -g sql-language-server')
    })

    it('returns null when no installHint is configured', async () => {
      detectLanguageMock.mockReturnValue(tsConfig)
      whichMock.mockResolvedValue(null)
      const manager = new LspManager('/tmp/project', 'session-hint-2')

      await manager.notifyFileChange('/tmp/project/file.ts', 'x')

      expect(manager.getInstallHint('/tmp/project/file.ts')).toBeNull()
    })

    it('returns null when server is available', async () => {
      detectLanguageMock.mockReturnValue(sqlConfig)
      whichMock.mockResolvedValue('/usr/bin/sql-language-server')
      const manager = new LspManager('/tmp/project', 'session-hint-3')

      await manager.notifyFileChange('/tmp/project/query.sql', 'SELECT 1')

      expect(manager.getInstallHint('/tmp/project/query.sql')).toBeNull()
    })

    it('returns null when no matching language config', async () => {
      detectLanguageMock.mockReturnValue(null)
      const manager = new LspManager('/tmp/project', 'session-hint-4')

      expect(manager.getInstallHint('/tmp/project/file.unknown')).toBeNull()
    })

    it('returns hint only once per session (one-shot)', async () => {
      detectLanguageMock.mockReturnValue(sqlConfig)
      whichMock.mockResolvedValue(null)
      const manager = new LspManager('/tmp/project', 'session-hint-5')

      await manager.notifyFileChange('/tmp/project/query.sql', 'SELECT 1')

      expect(manager.getInstallHint('/tmp/project/query.sql')).toBe('npm install -g sql-language-server')
      expect(manager.getInstallHint('/tmp/project/query.sql')).toBeNull()
    })
  })

  describe('findWorkspaceSymbol', () => {
    beforeEach(() => {
      whichMock.mockReset()
      detectLanguageMock.mockReset()
      getSupportedLanguagesMock.mockReset()
      nextStartImpls.length = 0
      serverInstances.length = 0
    })

    it('queries existing running server and returns results', async () => {
      detectLanguageMock.mockReturnValue(tsConfig)
      whichMock.mockResolvedValue('/usr/bin/typescript-language-server')
      const manager = new LspManager('/tmp/project', 'session-fws-1')

      // Start a server by opening a file
      await manager.notifyFileChange('/tmp/project/file.ts', 'const x = 1')
      const server = serverInstances[0]!
      server.findWorkspaceSymbol.mockResolvedValueOnce([
        {
          name: 'myFunc',
          kind: 'Function',
          location: { path: '/tmp/project/file.ts', line: 0, character: 0, endLine: 0, endCharacter: 10 },
        },
      ])

      const results = await manager.findWorkspaceSymbol('myFunc')
      expect(results).toHaveLength(1)
      expect(results[0]!.name).toBe('myFunc')
      expect(server.findWorkspaceSymbol).toHaveBeenCalledWith('myFunc')
    })

    it('seedAndFindWorkspaceSymbol starts server, opens file, and queries', async () => {
      detectLanguageMock.mockReturnValue(tsConfig)
      whichMock.mockResolvedValue('/usr/bin/typescript-language-server')
      const manager = new LspManager('/tmp/project', 'session-fws-2')

      // Create the seed file
      const fs = await import('node:fs')
      const path = await import('node:path')
      fs.mkdirSync(path.join('/tmp/project', 'src'), { recursive: true })
      fs.writeFileSync('/tmp/project/src/index.ts', 'export const myFunc = () => 42')

      await manager.seedAndFindWorkspaceSymbol('myFunc', '/tmp/project/src/index.ts')

      // Server should have been created
      expect(serverInstances.length).toBeGreaterThanOrEqual(1)
      const startedServer = serverInstances.find((s: any) => s.running)
      expect(startedServer).toBeDefined()
      // didOpen was called with the seed file
      expect(startedServer.didOpen).toHaveBeenCalledWith('/tmp/project/src/index.ts', expect.any(String))
      // findWorkspaceSymbol was called
      expect(startedServer.findWorkspaceSymbol).toHaveBeenCalledWith('myFunc')
    })

    it('seedAndFindWorkspaceSymbol returns empty when language not detected', async () => {
      detectLanguageMock.mockReturnValue(null)
      const manager = new LspManager('/tmp/project', 'session-fws-3')

      const results = await manager.seedAndFindWorkspaceSymbol('myFunc', '/tmp/project/file.unknown')
      expect(results).toEqual([])
    })

    it('seedAndFindWorkspaceSymbol returns empty when server cannot start', async () => {
      detectLanguageMock.mockReturnValue(tsConfig)
      whichMock.mockResolvedValue(null) // server not found
      const manager = new LspManager('/tmp/project', 'session-fws-4')

      const results = await manager.seedAndFindWorkspaceSymbol('myFunc', '/tmp/project/file.ts')
      expect(results).toEqual([])
    })
  })

  it('manages session-scoped registry lifecycle', async () => {
    const first = getLspManager('session-a', '/tmp/project')
    const second = getLspManager('session-a', '/tmp/project')
    const third = getLspManager('session-b', '/tmp/project')
    expect(first).toBe(second)
    expect(first).not.toBe(third)

    const shutdownSpyA = vi.spyOn(first, 'shutdown').mockResolvedValue(undefined)
    const shutdownSpyB = vi.spyOn(third, 'shutdown').mockResolvedValue(undefined)

    await shutdownLspManager('session-a')
    expect(shutdownSpyA).toHaveBeenCalledTimes(1)

    await shutdownAllLspManagers()
    expect(shutdownSpyB).toHaveBeenCalledTimes(1)
  })
})
