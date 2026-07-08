import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockStat, mockReadFile } = vi.hoisted(() => {
  const mockStat = vi.fn()
  const mockReadFile = vi.fn()
  return { mockStat, mockReadFile }
})

vi.mock('node:fs/promises', () => ({
  stat: mockStat,
  readFile: mockReadFile,
}))

import type { ToolContext } from './types.js'
import type { CodeLocation, SymbolInfo } from '../lsp/server.js'
import { traceCodeTool } from './trace-code.js'

function mockLocation(overrides: Partial<CodeLocation> = {}): CodeLocation {
  return { path: '/project/src/file.ts', line: 10, character: 5, endLine: 10, endCharacter: 20, ...overrides }
}

function mockSymbolInfo(overrides: Partial<SymbolInfo> = {}): SymbolInfo {
  return {
    name: 'rebuildTools',
    kind: 'Function',
    location: mockLocation(),
    ...overrides,
  }
}

describe('trace_code tool', () => {
  const mockContext: ToolContext = {
    workdir: '/project',
    sessionId: 'test-session',
    sessionManager: {} as any,
    lspManager: {
      isAvailableFor: vi.fn().mockReturnValue(true),
      seedAndFindWorkspaceSymbol: vi.fn().mockResolvedValue([mockSymbolInfo()]),
      getDefinition: vi.fn().mockResolvedValue([]),
      getReferences: vi.fn().mockResolvedValue([]),
      getTypeDefinition: vi.fn().mockResolvedValue([]),
      getHoverInfo: vi.fn().mockResolvedValue(null),
      getInstallHint: vi.fn().mockReturnValue(null),
    } as any,
  }

  const defaultArgs = { symbol: 'rebuildTools', file: 'src/file.ts' }

  beforeEach(() => {
    mockStat.mockReset()
    mockReadFile.mockReset()
    // Default: file exists and has content
    mockStat.mockResolvedValue({ mtimeMs: 1000 })
    mockReadFile.mockResolvedValue('const x = 1\nconst y = 2\n')
  })

  it('rejects missing symbol', async () => {
    const result = await traceCodeTool.execute({ file: 'src/file.ts' } as any, mockContext)
    expect(result.success).toBe(false)
    expect(result.error).toContain('symbol')
  })

  it('rejects missing file', async () => {
    const result = await traceCodeTool.execute({ symbol: 'foo' } as any, mockContext)
    expect(result.success).toBe(false)
    expect(result.error).toContain('file')
  })

  it('rejects depth beyond max', async () => {
    const result = await traceCodeTool.execute({ ...defaultArgs, depth: 10 }, mockContext)
    expect(result.success).toBe(false)
    expect(result.error).toContain('5')
  })

  it('rejects invalid direction', async () => {
    const result = await traceCodeTool.execute({ ...defaultArgs, direction: 'sideways' }, mockContext)
    expect(result.success).toBe(false)
    expect(result.error).toContain('direction')
  })

  it('returns error when LSP unavailable', async () => {
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: undefined,
    }
    const result = await traceCodeTool.execute(defaultArgs, ctx)
    expect(result.success).toBe(false)
    expect(result.error).toContain('LSP')
  })

  it('returns error when symbol not found', async () => {
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        seedAndFindWorkspaceSymbol: vi.fn().mockResolvedValue([]),
      } as any,
    }
    const result = await traceCodeTool.execute({ symbol: 'nonexistent', file: 'src/file.ts' }, ctx)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('returns error when seed file does not exist', async () => {
    mockStat.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const result = await traceCodeTool.execute(defaultArgs, mockContext)
    expect(result.success).toBe(false)
    expect(result.error).toContain('File not found')
  })

  it('traces definition (down direction)', async () => {
    const defLoc = mockLocation({ path: '/project/src/def.ts', line: 42, character: 0, endLine: 42, endCharacter: 10 })
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        getDefinition: vi.fn().mockResolvedValue([defLoc]),
        getReferences: vi.fn().mockResolvedValue([]),
        getTypeDefinition: vi.fn().mockResolvedValue([]),
      } as any,
    }

    const result = await traceCodeTool.execute({ ...defaultArgs, direction: 'down' }, ctx)
    expect(result.success).toBe(true)
    expect(result.output).toContain('rebuildTools')
    expect(result.output).toContain('src/def.ts')
    expect(result.output).toContain('42')
    expect(result.output).toContain('definition')
  })

  it('traces references (up direction)', async () => {
    const refLoc = mockLocation({
      path: '/project/src/user.ts',
      line: 100,
      character: 5,
      endLine: 100,
      endCharacter: 18,
    })
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        getDefinition: vi.fn().mockResolvedValue([]),
        getReferences: vi.fn().mockResolvedValue([refLoc]),
        getTypeDefinition: vi.fn().mockResolvedValue([]),
      } as any,
    }

    const result = await traceCodeTool.execute({ ...defaultArgs, direction: 'up' }, ctx)
    expect(result.success).toBe(true)
    expect(result.output).toContain('rebuildTools')
    expect(result.output).toContain('src/user.ts')
    expect(result.output).toContain('100')
    expect(result.output).toContain('references')
  })

  it('traces both directions by default', async () => {
    const defLoc = mockLocation({ path: '/project/src/def.ts', line: 42, character: 0 })
    const refLoc = mockLocation({ path: '/project/src/user.ts', line: 100, character: 5 })
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        getDefinition: vi.fn().mockResolvedValue([defLoc]),
        getReferences: vi.fn().mockResolvedValue([refLoc]),
        getTypeDefinition: vi.fn().mockResolvedValue([]),
      } as any,
    }

    const result = await traceCodeTool.execute(defaultArgs, ctx)
    expect(result.success).toBe(true)
    expect(result.output).toContain('definition')
    expect(result.output).toContain('references')
  })

  it('includes type definition when available', async () => {
    const typeLoc = mockLocation({ path: '/project/src/types.ts', line: 5, character: 0 })
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        getDefinition: vi.fn().mockResolvedValue([]),
        getReferences: vi.fn().mockResolvedValue([]),
        getTypeDefinition: vi.fn().mockResolvedValue([typeLoc]),
      } as any,
    }

    const result = await traceCodeTool.execute({ ...defaultArgs, direction: 'down' }, ctx)
    expect(result.success).toBe(true)
    expect(result.output).toContain('type-definition')
    expect(result.output).toContain('src/types.ts')
  })

  it('respects depth limit', async () => {
    const def1 = mockLocation({ path: '/project/src/a.ts', line: 1, character: 0 })
    const def2 = mockLocation({ path: '/project/src/b.ts', line: 2, character: 0 })
    const def3 = mockLocation({ path: '/project/src/c.ts', line: 3, character: 0 })

    const getDefinitionFn = vi.fn()
    getDefinitionFn.mockResolvedValueOnce([def1])
    getDefinitionFn.mockResolvedValueOnce([def2])
    getDefinitionFn.mockResolvedValueOnce([def3])

    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        getDefinition: getDefinitionFn,
        getReferences: vi.fn().mockResolvedValue([]),
        getTypeDefinition: vi.fn().mockResolvedValue([]),
      } as any,
    }

    const result = await traceCodeTool.execute({ ...defaultArgs, direction: 'down', depth: 2 }, ctx)
    expect(result.success).toBe(true)
    expect(result.output).toContain('src/a.ts')
    expect(result.output).toContain('src/b.ts')
    expect(result.output).not.toContain('src/c.ts')
  })

  it('deduplicates identical locations', async () => {
    const sameLoc = mockLocation({ path: '/project/src/dup.ts', line: 50, character: 0 })
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        getDefinition: vi.fn().mockResolvedValue([sameLoc, sameLoc]),
        getReferences: vi.fn().mockResolvedValue([sameLoc]),
        getTypeDefinition: vi.fn().mockResolvedValue([]),
      } as any,
    }

    const result = await traceCodeTool.execute({ ...defaultArgs, direction: 'both' }, ctx)
    expect(result.success).toBe(true)
    expect(result.output).toContain('Nodes: 2')
    expect(result.output).toContain('Edges: 1')
  })

  it('returns only start location at depth 0', async () => {
    const defLoc = mockLocation({ path: '/project/src/other.ts', line: 99, character: 0 })
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        getDefinition: vi.fn().mockResolvedValue([defLoc]),
        getReferences: vi.fn().mockResolvedValue([]),
        getTypeDefinition: vi.fn().mockResolvedValue([]),
      } as any,
    }

    const result = await traceCodeTool.execute({ ...defaultArgs, direction: 'down', depth: 0 }, ctx)
    expect(result.success).toBe(true)
    // Depth 0 should only have the start node, no traversal
    expect(result.output).toContain('Nodes: 1')
    expect(result.output).not.toContain('src/other.ts')
  })

  it('collapses many nodes in the same file', async () => {
    const manyRefs = Array.from({ length: 7 }, (_, i) =>
      mockLocation({ path: '/project/src/hot.ts', line: i * 10, character: 0 }),
    )
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        getDefinition: vi.fn().mockResolvedValue([]),
        getReferences: vi.fn().mockResolvedValue(manyRefs),
        getTypeDefinition: vi.fn().mockResolvedValue([]),
      } as any,
    }

    const result = await traceCodeTool.execute({ ...defaultArgs, direction: 'up' }, ctx)
    expect(result.success).toBe(true)
    // More than 5 nodes in a single file → collapsed summary
    expect(result.output).toContain('× 7 in')
    expect(result.output).toContain('reference')
  })

  it('suppresses edge listing when too many edges', async () => {
    // Create 25 edges by having 25 references
    const manyRefs = Array.from({ length: 25 }, (_, i) =>
      mockLocation({ path: `/project/src/r${i}.ts`, line: i, character: 0 }),
    )
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        getDefinition: vi.fn().mockResolvedValue([]),
        getReferences: vi.fn().mockResolvedValue(manyRefs),
        getTypeDefinition: vi.fn().mockResolvedValue([]),
      } as any,
    }

    const result = await traceCodeTool.execute({ ...defaultArgs, direction: 'up' }, ctx)
    expect(result.success).toBe(true)
    expect(result.output).toContain('suppressed')
    expect(result.output).toContain('too many')
  })

  it('deduplicates when same location appears as both def and ref', async () => {
    const sharedLoc = mockLocation({ path: '/project/src/shared.ts', line: 30, character: 0 })
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        getDefinition: vi.fn().mockResolvedValue([sharedLoc]),
        getReferences: vi.fn().mockResolvedValue([sharedLoc]),
        getTypeDefinition: vi.fn().mockResolvedValue([]),
      } as any,
    }

    const result = await traceCodeTool.execute({ ...defaultArgs, direction: 'both' }, ctx)
    expect(result.success).toBe(true)
    // Start node + shared location = 2 nodes (deduplicated)
    expect(result.output).toContain('Nodes: 2')
    // One edge from start to shared location
    expect(result.output).toContain('Edges: 1')
  })

  it('gracefully handles nonexistent files for snippets', async () => {
    const refLoc = mockLocation({ path: '/project/src/nonexistent.ts', line: 5, character: 0 })
    const ctx: ToolContext = {
      ...mockContext,
      lspManager: {
        ...mockContext.lspManager,
        getDefinition: vi.fn().mockResolvedValue([]),
        getReferences: vi.fn().mockResolvedValue([refLoc]),
        getTypeDefinition: vi.fn().mockResolvedValue([]),
      } as any,
    }

    const result = await traceCodeTool.execute({ ...defaultArgs, direction: 'up' }, ctx)
    expect(result.success).toBe(true)
    // Should still show the reference location even if snippet can't be read
    expect(result.output).toContain('src/nonexistent.ts')
    expect(result.output).toContain('5')
  })

  it('has correct tool definition', () => {
    expect(traceCodeTool.name).toBe('trace_code')
    expect(traceCodeTool.definition.function.name).toBe('trace_code')
    const params = traceCodeTool.definition.function.parameters as any
    expect(params.required).toContain('symbol')
    expect(params.required).toContain('file')
    expect(params.properties.symbol).toBeDefined()
    expect(params.properties.file).toBeDefined()
    expect(params.properties.depth).toBeDefined()
    expect(params.properties.direction).toBeDefined()
  })
})
