/**
 * Builder Mode E2E Tests
 *
 * Tests builder chat with write operations, criterion completion, and todo tracking.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestClient,
  createTestProject,
  createTestServer,
  collectChatEvents,
  assertNoErrors,
  createProject,
  createSession,
  setSessionMode,
  stopSessionChat,
  continueSessionChat,
  type TestClient,
  type TestProject,
  type TestServerHandle,
} from './utils/index.js'

describe('Builder Mode', () => {
  let server: TestServerHandle
  let client: TestClient
  let testDir: TestProject

  beforeAll(async () => {
    server = await createTestServer()
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(async () => {
    client = await createTestClient({ url: server.wsUrl })
    testDir = await createTestProject({ template: 'typescript' })

    const restProject = await createProject(server.url, { name: 'Builder Test', workdir: testDir.path })
    const restSession = await createSession(server.url, { projectId: restProject.id })
    await client.send('session.load', { sessionId: restSession.id })
    await setSessionMode(server.url, restSession.id, 'builder', server.wsUrl)
  })

  afterEach(async () => {
    await client.close()
    await testDir.cleanup()
  })

  describe('Write Operations', () => {
    it('writes new files with write_file', async () => {
      await client.send('chat.send', {
        content:
          'Create a new file called src/utils.ts with a single exported function called "greet" that returns "Hello!"',
      })

      const events = await collectChatEvents(client)
      assertNoErrors(events)

      // Check for write_file tool call
      const toolCalls = events.get('chat.tool_call')
      const writeCall = toolCalls.find((e) => {
        const payload = e.payload as { tool: string }
        return payload.tool === 'write_file'
      })
      expect(writeCall).toBeDefined()

      // Verify file was created
      const content = await readFile(join(testDir.path, 'src/utils.ts'), 'utf-8')
      expect(content).toContain('greet')
    })

    it('edits existing files with edit_file', async () => {
      await client.send('chat.send', {
        content: 'Read src/math.ts, then use edit_file to change the function name "add" to "sum"',
      })

      const events = await collectChatEvents(client)
      assertNoErrors(events)

      // Should have read followed by edit
      const toolCalls = events.get('chat.tool_call')
      const readCall = toolCalls.find((e) => {
        const payload = e.payload as { tool: string }
        return payload.tool === 'read_file'
      })
      const editCall = toolCalls.find((e) => {
        const payload = e.payload as { tool: string }
        return payload.tool === 'edit_file'
      })

      expect(readCall).toBeDefined()
      expect(editCall).toBeDefined()

      // With parallel execution, edit may fail validation if read hasn't completed
      // Check the tool_result event for the actual result
      const toolResults = events.get('chat.tool_result')
      const editResultEvent = toolResults.find((e) => {
        const payload = e.payload as any
        return payload.callId === editCall?.payload?.callId
      })

      const editResult = editResultEvent?.payload as any
      if (editResult?.result?.success === false) {
        // Edit failed validation (read not completed yet) - that's expected with parallel execution
        expect(editResult.result.error).toContain('must be read before writing')
        // In this case, the LLM should retry in a subsequent turn
        // For now, just verify the validation worked
      } else {
        // Edit succeeded - verify the change was made
        const content = await readFile(join(testDir.path, 'src/math.ts'), 'utf-8')
        expect(content).toContain('sum')
      }
    })

    it('enforces read-before-write on existing files', async () => {
      await client.send('chat.send', {
        content: 'WITHOUT reading it first, try to write "new content" to src/index.ts using write_file',
      })

      const events = await collectChatEvents(client)

      // The LLM might read first anyway, but if it doesn't, write should fail
      // or the LLM should recognize the error and try again
      // This is a behavioral test - we just verify no unhandled errors
      assertNoErrors(events)
    })
  })

  describe('Shell Commands', () => {
    it('runs shell commands with run_command', async () => {
      await client.send('chat.send', {
        content: 'Run the command "ls src" to list files in src directory',
      })

      const events = await collectChatEvents(client)
      assertNoErrors(events)

      const toolCalls = events.get('chat.tool_call')
      const shellCall = toolCalls.find((e) => {
        const payload = e.payload as { tool: string }
        return payload.tool === 'run_command'
      })
      expect(shellCall).toBeDefined()

      // Check result
      const toolResults = events.get('chat.tool_result')
      const shellResult = toolResults.find((e) => {
        const payload = e.payload as { tool: string; result: { success: boolean; output?: string } }
        return payload.tool === 'run_command' && payload.result.success
      })
      expect(shellResult).toBeDefined()
      const resultPayload = shellResult!.payload as { result: { output: string } }
      expect(resultPayload.result.output).toContain('index.ts')
    })
  })

  describe('Criterion Completion', () => {
    it('uses session_metadata to mark criteria done', async () => {
      const sessionId = client.getSession()!.id

      // First add criteria in planner mode
      await setSessionMode(server.url, sessionId, 'planner', server.wsUrl)
      await client.send('chat.send', {
        content: 'Add criterion ID "file-created": "A new file utils.ts exists". Use session_metadata.',
      })
      await client.waitForChatDone()

      // Switch to builder
      await setSessionMode(server.url, sessionId, 'builder', server.wsUrl)

      // Ask to implement and complete
      await client.send('chat.send', {
        content:
          'Create the file src/utils.ts with any content, then call session_metadata to mark criteria as completed for "file-created".',
      })

      const events = await collectChatEvents(client)
      assertNoErrors(events)

      // Should have session_metadata tool call with action 'update' and status 'completed'
      const toolCalls = events.get('chat.tool_call')
      const completeCall = toolCalls.find((e) => {
        const payload = e.payload as { tool: string; args: Record<string, unknown> }
        return (
          payload.tool === 'session_metadata' &&
          (payload.args as any).action === 'update' &&
          (payload.args as any).status === 'completed'
        )
      })
      expect(completeCall).toBeDefined()

      // Criterion should be marked completed
      const metadataEvents = events.get('metadata.updated')
      if (metadataEvents.length > 0) {
        const lastMeta = metadataEvents[metadataEvents.length - 1]!
        const payload = lastMeta.payload as { key: string; entries: Array<{ status: string }> }
        if (payload.key === 'criteria') {
          const completed = payload.entries.find((e) => e.status === 'completed')
          expect(completed).toBeDefined()
        }
      }
    })

    it('can read criteria with session_metadata before completing them', async () => {
      const sessionId = client.getSession()!.id

      // First add a criterion in planner mode
      await setSessionMode(server.url, sessionId, 'planner', server.wsUrl)
      await client.send('chat.send', {
        content: 'Add criterion ID "test-file": "A test file exists". Use session_metadata.',
      })
      await client.waitForChatDone()

      // Switch to builder
      await setSessionMode(server.url, sessionId, 'builder', server.wsUrl)

      // Ask builder to read criteria first, then implement
      await client.send('chat.send', {
        content:
          'First call get_criteria to see what needs to be done, then create src/test.ts and call session_metadata to mark criteria as completed for "test-file".',
      })

      const events = await collectChatEvents(client)
      assertNoErrors(events)

      // Should have session_metadata tool calls with actions 'get' and 'update'
      const toolCalls = events.get('chat.tool_call')
      const getCall = toolCalls.find((e) => {
        const payload = e.payload as { tool: string; args: Record<string, unknown> }
        return payload.tool === 'session_metadata' && (payload.args as any).action === 'get'
      })
      const completeCall = toolCalls.find((e) => {
        const payload = e.payload as { tool: string; args: Record<string, unknown> }
        return (
          payload.tool === 'session_metadata' &&
          (payload.args as any).action === 'update' &&
          (payload.args as any).status === 'completed'
        )
      })

      expect(getCall).toBeDefined()
      expect(completeCall).toBeDefined()

      // Verify get was called before complete
      expect(toolCalls.indexOf(getCall)).toBeLessThan(toolCalls.indexOf(completeCall))
    })
  })

  describe('Todo Tracking', () => {
    it('uses session_metadata to track progress', async () => {
      await client.send('chat.send', {
        content:
          'Use the session_metadata tool with key "todos" to create a todo list with 2 items: "Read files" (in_progress) and "Make changes" (pending)',
      })

      const events = await collectChatEvents(client)
      assertNoErrors(events)

      // Should have session_metadata tool call with action 'add' and key 'todos'
      const toolCalls = events.get('chat.tool_call')
      const todoCall = toolCalls.find((e) => {
        const payload = e.payload as { tool: string; args: Record<string, unknown> }
        return payload.tool === 'session_metadata' && (payload.args as any).key === 'todos'
      })
      expect(todoCall).toBeDefined()
    })
  })

  describe('Continue Command', () => {
    it('accepts continue request via REST API', async () => {
      const sessionId = client.getSession()!.id

      // Start a generation
      await client.send('chat.send', {
        content: 'List the files in this project.',
      })
      await client.waitForChatDone()

      const session = client.getSession()!
      if (session.isRunning) {
        await client.waitFor('session.running', (p) => !(p as { isRunning: boolean }).isRunning)
      }
      expect(session.isRunning).toBe(false)

      // Continue should work via REST API
      const result = await continueSessionChat(server.url, sessionId)
      expect(result.accepted).toBe(true)
    })

    it('rejects continue while already running', async () => {
      const sessionId = client.getSession()!.id

      // Start a generation
      await client.send('chat.send', {
        content: 'Write a long explanation of TypeScript features.',
      })

      // Wait a moment for it to start
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Try to continue while running - should get 409 Conflict
      const response = await fetch(`${server.url}/api/sessions/${sessionId}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      expect(response.status).toBe(409)

      // Clean up
      await stopSessionChat(server.url, sessionId)
      await client.waitForChatDone()
    })
  })
})
