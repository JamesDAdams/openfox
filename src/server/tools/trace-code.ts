import { stat, readFile } from 'node:fs/promises'
import { createTool } from './tool-helpers.js'
import type { CodeLocation, SymbolInfo } from '../lsp/server.js'
import type { LspManagerInterface } from '../lsp/types.js'

interface TraceCodeArgs {
  symbol: string
  file: string
  depth?: number
  direction?: 'up' | 'down' | 'both'
}

interface GraphNode {
  location: CodeLocation
  depth: number
  relation: 'match' | 'definition' | 'reference' | 'type-definition'
  symbolName: string
  symbolKind?: string
}

function graphNode(
  location: CodeLocation,
  depth: number,
  relation: GraphNode['relation'],
  symbolName: string,
  symbolKind?: string,
): GraphNode {
  const node: GraphNode = { location, depth, relation, symbolName }
  if (symbolKind) node.symbolKind = symbolKind
  return node
}

interface Edge {
  from: string
  to: string
  relation: string
}

const MAX_DEPTH = 5
const VALID_DIRECTIONS = ['up', 'down', 'both'] as const
const SNIPPET_RADIUS = 2
const CACHE_MAX_SIZE = 50

function locationKey(loc: CodeLocation): string {
  return `${loc.path}:${loc.line}:${loc.character}`
}

function formatLocation(loc: CodeLocation, workdir: string): string {
  const relPath = loc.path.startsWith(workdir) ? loc.path.slice(workdir.length + 1) : loc.path
  return `${relPath}:${loc.line + 1}:${loc.character}`
}

interface CacheEntry {
  mtimeMs: number
  lines: string[]
}

const fileCache = new Map<string, CacheEntry>()

async function getCachedLines(path: string, approvedPaths: Set<string>): Promise<string[]> {
  if (!approvedPaths.has(path)) return []

  const cached = fileCache.get(path)
  if (cached) {
    try {
      const stats = await stat(path)
      if (stats.mtimeMs === cached.mtimeMs) {
        return cached.lines
      }
    } catch {
      // File deleted or inaccessible, treat as uncached
    }
  }

  try {
    const stats = await stat(path)
    const content = await readFile(path, 'utf-8')
    const lines = content.split('\n')
    fileCache.set(path, { mtimeMs: stats.mtimeMs, lines })
    if (fileCache.size > CACHE_MAX_SIZE) {
      const oldest = fileCache.keys().next()
      if (!oldest.done && oldest.value !== undefined) {
        fileCache.delete(oldest.value)
      }
    }
    return lines
  } catch {
    return []
  }
}

async function getSnippet(
  path: string,
  line: number,
  approvedPaths: Set<string>,
  radius: number = SNIPPET_RADIUS,
): Promise<string> {
  const lines = await getCachedLines(path, approvedPaths)
  if (lines.length === 0) return ''

  const start = Math.max(0, line - radius)
  const end = Math.min(lines.length - 1, line + radius)
  const lineNumWidth = String(end + 1).length
  const result: string[] = []

  for (let i = start; i <= end; i++) {
    const gutter = i === line ? '>' : ' '
    const lineNum = String(i + 1).padStart(lineNumWidth)
    result.push(`${gutter} ${lineNum}│ ${lines[i] ?? ''}`)
  }

  return result.join('\n')
}

function formatEdgeLabel(relation: string): string {
  switch (relation) {
    case 'definition':
      return 'definition'
    case 'references':
      return 'reference'
    case 'type-definition':
      return 'type definition'
    default:
      return relation
  }
}

async function collectNodes(
  lsp: LspManagerInterface,
  startLocations: CodeLocation[],
  symbolName: string,
  symbolKind: string | undefined,
  maxDepth: number,
  direction: 'up' | 'down' | 'both',
): Promise<{ nodes: GraphNode[]; edges: Edge[] }> {
  const visited = new Set<string>()
  const nodes: GraphNode[] = []
  const edges: Edge[] = []

  const queue: { location: CodeLocation; depth: number; relation: GraphNode['relation']; parentKey?: string }[] =
    startLocations.map((loc) => ({ location: loc, depth: 0, relation: 'match' }))

  let idx = 0
  while (idx < queue.length) {
    const item = queue[idx]!
    idx++
    const key = locationKey(item.location)

    if (visited.has(key)) continue
    visited.add(key)

    nodes.push(graphNode(item.location, item.depth, item.relation, symbolName, symbolKind))

    if (item.parentKey) {
      const relation =
        item.relation === 'definition'
          ? 'definition'
          : item.relation === 'type-definition'
            ? 'type-definition'
            : 'references'
      edges.push({ from: item.parentKey, to: key, relation })
    }

    if (item.depth >= maxDepth) continue

    const { path, line, character } = item.location

    if (direction === 'down' || direction === 'both') {
      const defs = await lsp.getDefinition(path, line, character)
      for (const def of defs) {
        const defKey = locationKey(def)
        if (!visited.has(defKey)) {
          queue.push({ location: def, depth: item.depth + 1, relation: 'definition', parentKey: key })
        }
      }

      const typeDefs = await lsp.getTypeDefinition(path, line, character)
      for (const td of typeDefs) {
        const tdKey = locationKey(td)
        if (!visited.has(tdKey)) {
          queue.push({ location: td, depth: item.depth + 1, relation: 'type-definition', parentKey: key })
        }
      }
    }

    if (direction === 'up' || direction === 'both') {
      const refs = await lsp.getReferences(path, line, character)
      for (const ref of refs) {
        const refKey = locationKey(ref)
        if (!visited.has(refKey)) {
          queue.push({ location: ref, depth: item.depth + 1, relation: 'reference', parentKey: key })
        }
      }
    }
  }

  return { nodes, edges }
}

async function formatOutput(
  symbolName: string,
  direction: string,
  depth: number,
  nodes: GraphNode[],
  edges: Edge[],
  workdir: string,
  approvedPaths: Set<string>,
): Promise<string> {
  const lines: string[] = []
  lines.push(`Symbol: ${symbolName}`)
  lines.push(`Direction: ${direction} | Depth: ${depth}`)
  lines.push(`Nodes: ${nodes.length} | Edges: ${edges.length}`)
  lines.push('')

  if (nodes.length === 0) {
    lines.push('No results found.')
    return lines.join('\n')
  }

  // Group by depth
  const byDepth = new Map<number, GraphNode[]>()
  for (const node of nodes) {
    const group = byDepth.get(node.depth) ?? []
    group.push(node)
    byDepth.set(node.depth, group)
  }

  for (const [depth, group] of [...byDepth.entries()].sort(([a], [b]) => a - b)) {
    lines.push(`── Depth ${depth} ──`)

    // Group references by file to reduce noise
    const fileGroups = new Map<string, GraphNode[]>()
    for (const node of group) {
      const fileKey = node.location.path
      const fileGroup = fileGroups.get(fileKey) ?? []
      fileGroup.push(node)
      fileGroups.set(fileKey, fileGroup)
    }

    for (const [filePath, fileNodes] of fileGroups) {
      const relPath = filePath.startsWith(workdir) ? filePath.slice(workdir.length + 1) : filePath

      if (fileNodes.length > 5) {
        // Collapse: show file summary instead of individual lines
        const kinds = [...new Set(fileNodes.map((n) => formatEdgeLabel(n.relation)))]
        lines.push(`  ${kinds.join(', ')} × ${fileNodes.length} in ${relPath}`)
      } else {
        for (const node of fileNodes) {
          const label = formatEdgeLabel(node.relation)
          const kind = node.symbolKind ? ` (${node.symbolKind})` : ''
          const loc = formatLocation(node.location, workdir)
          lines.push(`  ${label}: ${loc}${kind}`)
          const snippet = await getSnippet(node.location.path, node.location.line, approvedPaths)
          if (snippet) {
            for (const snipLine of snippet.split('\n')) {
              lines.push(`    ${snipLine}`)
            }
          }
        }
      }
    }
    lines.push('')
  }

  // List edges (only if few enough to be useful)
  if (edges.length > 0 && edges.length <= 20) {
    lines.push('Edges:')
    for (const edge of edges) {
      lines.push(`  ${edge.from} ──${edge.relation}──▶ ${edge.to}`)
    }
    lines.push('')
  } else if (edges.length > 20) {
    lines.push(`Edges: ${edges.length} total (suppressed, too many to display individually)`)
    lines.push('')
  }

  return lines.join('\n')
}

export const traceCodeTool = createTool<TraceCodeArgs>(
  'trace_code',
  {
    type: 'function',
    function: {
      name: 'trace_code',
      description:
        'Trace a symbol through the codebase using LSP-powered static analysis. ' +
        'Finds definitions, references, and type definitions up to a configurable depth. ' +
        'Returns a graph of locations with inline code snippets for each node.',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Symbol name to trace (e.g., "rebuildTools", "handleSubmit", "UserProfile")',
          },
          file: {
            type: 'string',
            description:
              'File path containing the symbol. Used to seed the LSP server and detect the language. Relative to the working directory.',
          },
          depth: {
            type: 'number',
            description:
              'Graph traversal depth (default: 1, max: 5). How many hops to follow. Start with 1 for immediate defs+refs.',
            default: 1,
          },
          direction: {
            type: 'string',
            enum: ['up', 'down', 'both'],
            description: '"down" follows definitions, "up" finds references, "both" does both (default).',
            default: 'both',
          },
        },
        required: ['symbol', 'file'],
      },
    },
  },
  async (args, context, helpers) => {
    const symbol = args.symbol?.trim()
    if (!symbol) {
      return helpers.error('symbol is required')
    }

    const file = args.file?.trim()
    if (!file) {
      return helpers.error('file is required')
    }

    const depth = args.depth ?? 1
    if (depth > MAX_DEPTH) {
      return helpers.error(`depth cannot exceed ${MAX_DEPTH}`)
    }

    const direction = args.direction ?? 'both'
    if (!VALID_DIRECTIONS.includes(direction)) {
      return helpers.error(`direction must be one of: ${VALID_DIRECTIONS.join(', ')}`)
    }

    const lsp = context.lspManager
    if (!lsp) {
      return helpers.error('LSP is not available. The trace_code tool requires a running LSP server.')
    }

    const fullPath = helpers.resolvePath(file)

    // Check file exists before calling LSP
    try {
      await stat(fullPath)
    } catch {
      return helpers.error(`File not found: "${file}". Check that the path exists.`)
    }

    // Seed the LSP server with the file and find the symbol
    let symbols: SymbolInfo[]
    try {
      symbols = await lsp.seedAndFindWorkspaceSymbol(symbol, fullPath)
    } catch {
      return helpers.error(`Failed to search for symbol "${symbol}". LSP may not be responding.`)
    }

    if (symbols.length === 0) {
      const installHint = lsp.getInstallHint(fullPath)
      const hint = installHint ? ` ${installHint}` : ''
      return helpers.error(
        `Symbol "${symbol}" not found in "${file}". Check that the symbol name is correct and that the LSP server has indexed the project.${hint}`,
      )
    }

    // Collect starting locations from symbol matches
    const startLocations = symbols.map((s) => s.location)
    const symbolKind = symbols[0]!.kind

    const { nodes, edges } = await collectNodes(lsp, startLocations, symbol, symbolKind, depth, direction)

    // Collect all unique file paths from discovered nodes and check path access
    const allPaths = [...new Set(nodes.map((n) => n.location.path))]
    await helpers.checkPathAccess(allPaths)
    const approvedPaths = new Set(allPaths)

    const output = await formatOutput(symbol, direction, depth, nodes, edges, context.workdir, approvedPaths)
    return helpers.success(output)
  },
)
