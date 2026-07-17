export type WorktreeAssetStrategy = 'symlink' | 'copy' | 'skip'

export interface WorktreeConfig {
  ignoredAssets: WorktreeAssetStrategy
  overrides?: Record<string, WorktreeAssetStrategy>
}
