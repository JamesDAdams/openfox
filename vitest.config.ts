import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'web/src/**/*.test.ts', 'web/src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: ['vitest-localstorage-mock'],
    env: {
      NODE_OPTIONS: '--localstorage-file=/tmp/openfox-test-localstorage.json',
    },
    // environment set per-file via @vitest-environment docblock
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/server/**/*.ts', 'src/shared/**/*.ts', 'web/src/**/*.ts', 'web/src/**/*.tsx'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.d.ts',
        'src/shared/index.ts',
        'src/shared/types.ts',
        'src/server/context.ts',
        'src/server/index.ts',
        'src/server/context/index.ts',
        'src/server/events/index.ts',
        'src/server/events/types.ts',
        'src/server/llm/index.ts',
        'src/server/llm/mock.ts',
        'src/server/llm/types.ts',
        'src/server/lsp/index.ts',
        'src/server/lsp/types.ts',
        'src/server/runner/index.ts',
        'src/server/session/index.ts',
        'src/server/ws/index.ts',
        'web/src/main.tsx',
        'web/src/components/shared/icons/index.ts',
        'web/src/stores/session/types.ts',
        'web/src/lib/types.ts',
        'web/src/components/onboarding/types.ts',
      ],
    },
  },
})
