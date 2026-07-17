import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import type { WorktreeConfig } from '../../shared/worktree.js'

const CONFIG_FILENAME = '.openfox/worktree.json'

function getConfigPath(workdir: string): string {
  return join(resolve(workdir), CONFIG_FILENAME)
}

export async function loadWorktreeConfig(workdir: string): Promise<WorktreeConfig | null> {
  try {
    const configPath = getConfigPath(workdir)
    const raw = await readFile(configPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed.ignoredAssets) return null
    return {
      ignoredAssets: parsed.ignoredAssets,
      overrides: parsed.overrides ?? undefined,
    }
  } catch {
    return null
  }
}

export async function saveWorktreeConfig(workdir: string, config: WorktreeConfig): Promise<void> {
  const resolved = resolve(workdir)
  const dirPath = join(resolved, '.openfox')
  await mkdir(dirPath, { recursive: true })
  const configPath = getConfigPath(workdir)
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
