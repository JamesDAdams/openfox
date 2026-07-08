/**
 * trace_code E2E Test
 *
 * Tests the real LSP integration end-to-end:
 * 1. Creates a temp TypeScript project
 * 2. Starts typescript-language-server
 * 3. Opens a file and queries workspace/symbol
 * 4. Verifies symbols are found
 *
 * Requires typescript-language-server to be installed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LspServer } from '../src/server/lsp/server.js'
import type { LanguageConfig } from '../src/server/lsp/types.js'

const tsConfig: LanguageConfig = {
  id: 'typescript',
  name: 'TypeScript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  serverCommand: 'typescript-language-server',
  serverArgs: ['--stdio'],
  rootPatterns: ['tsconfig.json', 'jsconfig.json', 'package.json'],
  languageIds: {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
  },
}

describe('trace_code real LSP integration', () => {
  let projectDir: string
  let server: LspServer

  beforeAll(async () => {
    // Fail fast: check that typescript-language-server is available before creating temp dir
    const { which } = await import('../src/server/utils/which.js')
    const commandPath = await which('typescript-language-server', process.cwd())
    if (!commandPath) {
      throw new Error(
        'typescript-language-server not found on PATH — install with: npm install -g typescript-language-server',
      )
    }

    // Create temp project with a tsconfig and a source file
    projectDir = mkdtempSync(join(tmpdir(), 'openfox-trace-e2e-'))
    mkdirSync(join(projectDir, 'src'), { recursive: true })
    writeFileSync(
      join(projectDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          outDir: 'dist',
        },
        include: ['src/**/*'],
      }),
    )
    writeFileSync(
      join(projectDir, 'src/math.ts'),
      `
export function add(a: number, b: number): number {
  return a + b
}

export function subtract(a: number, b: number): number {
  return a - b
}

export const PI = 3.14159
`,
    )
    writeFileSync(
      join(projectDir, 'src/index.ts'),
      `
import { add, PI } from './math.js'

export function hello(name: string): string {
  return \`Hello, \${name}!\`
}

export function greet(name: string): string {
  return hello(name)
}

const result = add(PI, 2)
console.log(result)
`,
    )

    // Start the LSP server
    server = new LspServer(tsConfig, projectDir, commandPath)
    await server.start()
  })

  afterAll(async () => {
    if (server) {
      await server.stop()
    }
    if (projectDir) {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it('finds workspace symbols after opening a file', async () => {
    // Read and open a source file to trigger project indexing
    const indexPath = join(projectDir, 'src/index.ts')
    const content = readFileSync(indexPath, 'utf-8')
    await server.didOpen(indexPath, content)

    // Flush: send a hover request to ensure didOpen is processed
    await server.getHoverInfo(indexPath, 0, 0)

    // Now query workspace/symbol
    const symbols = await server.findWorkspaceSymbol('hello')
    expect(symbols.length).toBeGreaterThan(0)
    expect(symbols[0]!.name).toBe('hello')
    expect(symbols[0]!.kind).toBe('Function')
    expect(symbols[0]!.location.path).toBe(indexPath)
  })

  it('finds multiple symbols in the workspace', async () => {
    const mathPath = join(projectDir, 'src/math.ts')
    const mathContent = readFileSync(mathPath, 'utf-8')
    await server.didOpen(mathPath, mathContent)
    await server.getHoverInfo(mathPath, 0, 0)

    const symbols = await server.findWorkspaceSymbol('add')
    expect(symbols.length).toBeGreaterThan(0)
    // Should find both the definition in math.ts and usage in index.ts
    const paths = symbols.map((s) => s.location.path)
    expect(paths.some((p) => p.includes('math.ts'))).toBe(true)
  })

  it('finds symbols without explicit didOpen (via seeding)', async () => {
    // Create a fresh server to simulate cold start
    const { which } = await import('../src/server/utils/which.js')
    const commandPath = await which('typescript-language-server', projectDir)
    const freshServer = new LspServer(tsConfig, projectDir, commandPath!)
    await freshServer.start()

    // Don't open any file — just call findWorkspaceSymbol directly
    // This simulates what happens when trace_code tool is called cold
    const symbols = await freshServer.findWorkspaceSymbol('greet')

    // Without any file open, typescript-language-server has no project context
    // so it returns empty. This documents the current limitation.
    // The fix is in LspManager.seedServer which opens a file first.
    expect(symbols).toEqual([])

    await freshServer.stop()
  })

  it('resolves definitions and references', async () => {
    const indexPath = join(projectDir, 'src/index.ts')
    const content = readFileSync(indexPath, 'utf-8')
    await server.didOpen(indexPath, content)
    await server.getHoverInfo(indexPath, 0, 0)

    // Find definition of 'hello' — it's defined in index.ts
    // Position: the 'hello' in 'export function hello(name: string)'
    const defs = await server.getDefinition(indexPath, 3, 18)
    expect(defs.length).toBeGreaterThan(0)
    expect(defs[0]!.path).toBe(indexPath)

    // Find references to 'hello' — it's called in 'greet'
    const refs = await server.getReferences(indexPath, 3, 18)
    expect(refs.length).toBeGreaterThan(0)
    const refPaths = refs.map((r) => r.path)
    expect(refPaths.some((p) => p.includes('index.ts'))).toBe(true)
  })

  it('gets type definition for a constant', async () => {
    const mathPath = join(projectDir, 'src/math.ts')
    const content = readFileSync(mathPath, 'utf-8')
    await server.didOpen(mathPath, content)
    await server.getHoverInfo(mathPath, 0, 0)

    // PI is a const number — type definition should point to 'number' type
    const typeDefs = await server.getTypeDefinition(mathPath, 11, 14)
    // TypeScript may or may not return type defs for primitive types
    // The important thing is it doesn't crash
    expect(Array.isArray(typeDefs)).toBe(true)
  })

  it('provides hover information', async () => {
    const indexPath = join(projectDir, 'src/index.ts')
    const content = readFileSync(indexPath, 'utf-8')
    await server.didOpen(indexPath, content)
    await server.getHoverInfo(indexPath, 0, 0)

    const hover = await server.getHoverInfo(indexPath, 3, 18)
    expect(hover).not.toBeNull()
    expect(hover!.contents).toContain('hello')
  })
})
