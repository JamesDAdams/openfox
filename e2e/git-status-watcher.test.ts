import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  createTestClient,
  createTestProject,
  createTestServer,
  createProject,
  createSession,
  type TestClient,
  type TestProject,
  type TestServerHandle,
} from './utils/index.js'
import type { GitStatusPayload, GitDiffFile } from '@openfox/shared/protocol'

describe('Git Status Watcher', () => {
  let server: TestServerHandle
  let client: TestClient
  let project: TestProject

  beforeAll(async () => {
    process.env['OPENFOX_GIT_POLL_INTERVAL'] = '1000'
    server = await createTestServer()
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(async () => {
    client = await createTestClient({ url: server.wsUrl, timeout: 20_000 })
    project = await createTestProject({ template: 'git-repo' })
  })

  afterEach(async () => {
    await client.close()
    await project.cleanup()
  })

  it('updates git status after file modification via polling', async () => {
    const restProject = await createProject(server.url, { name: 'test', workdir: project.path })
    const restSession = await createSession(server.url, { projectId: restProject.id })

    await client.send('session.load', { sessionId: restSession.id })

    const initialMsg = await client.waitFor<GitStatusPayload>('git.status', undefined, 3000)
    expect(initialMsg.type).toBe('git.status')
    const initialPayload = initialMsg.payload as GitStatusPayload
    expect(initialPayload.diff.files).toHaveLength(0)

    // Wait for the first poll to complete and store the hash
    await sleep(1_500)

    client.clearEvents()

    const testFilePath = join(project.path, 'src', 'index.ts')
    await writeFile(testFilePath, '// Modified by test\n')

    // Wait for the next poll cycle to detect the change
    await sleep(1_500)

    const events = client.allEvents()
    const gitStatusEvents = events.filter((e) => e.type === 'git.status')

    expect(gitStatusEvents.length).toBeGreaterThan(0)

    const updatePayload = gitStatusEvents[0]!.payload as GitStatusPayload
    const modifiedFiles = updatePayload.diff.files.filter((f: GitDiffFile) => f.path.includes('src/index.ts'))
    expect(modifiedFiles.length).toBe(1)
    expect(modifiedFiles[0]!.status).toBe('modified')
  }, 10_000)
})
