export function gitSpawnEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  delete env['GIT_DIR']
  delete env['GIT_INDEX_FILE']
  delete env['GIT_WORK_TREE']
  delete env['GIT_PREFIX']
  return env
}
