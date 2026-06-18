/**
 * Workflow Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  loadAllWorkflows,
  loadDefaultWorkflows,
  loadUserWorkflows,
  loadProjectWorkflows,
  findWorkflowById,
  saveWorkflow,
  deleteWorkflow,
  workflowExists,
  isDefaultWorkflow,
  getDefaultWorkflowIds,
  saveWorkflowToProject,
  deleteProjectWorkflow,
} from './registry.js'
import type { WorkflowDefinition } from './types.js'

let tempDir: string

function makeWorkflow(
  overrides: Partial<WorkflowDefinition> & { metadata: WorkflowDefinition['metadata'] },
): WorkflowDefinition {
  return {
    entryStep: 'build',
    settings: { maxIterations: 50 },
    steps: [
      {
        id: 'build',
        name: 'Build',
        type: 'agent' as const,
        phase: 'build',
        transitions: [{ when: { type: 'always' as const }, goto: '$done' }],
      },
    ],
    ...overrides,
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'workflow-registry-test-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('loadUserWorkflows', () => {
  it('should return empty array when workflows directory does not exist', async () => {
    const workflows = await loadUserWorkflows(tempDir)
    expect(workflows).toEqual([])
  })

  it('should load valid .workflow.json files', async () => {
    const workflowsDir = join(tempDir, 'workflows')
    await mkdir(workflowsDir, { recursive: true })

    const workflow = makeWorkflow({
      metadata: { id: 'test', name: 'Test', description: 'A test workflow', version: '1.0' },
    })
    await writeFile(join(workflowsDir, 'test.workflow.json'), JSON.stringify(workflow))

    const loaded = await loadUserWorkflows(tempDir)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.metadata.id).toBe('test')
    expect(loaded[0]!.metadata.name).toBe('Test')
    expect(loaded[0]!.steps).toHaveLength(1)
  })

  it('should skip files without metadata.id', async () => {
    const workflowsDir = join(tempDir, 'workflows')
    await mkdir(workflowsDir, { recursive: true })
    await writeFile(
      join(workflowsDir, 'bad.workflow.json'),
      JSON.stringify({
        metadata: { name: 'No ID' },
        steps: [{ id: 's', name: 's', type: 'agent', phase: 'build', transitions: [] }],
      }),
    )

    const workflows = await loadUserWorkflows(tempDir)
    expect(workflows).toEqual([])
  })

  it('should skip files with empty steps array', async () => {
    const workflowsDir = join(tempDir, 'workflows')
    await mkdir(workflowsDir, { recursive: true })
    await writeFile(
      join(workflowsDir, 'empty.workflow.json'),
      JSON.stringify({
        metadata: { id: 'empty', name: 'Empty' },
        steps: [],
      }),
    )

    const workflows = await loadUserWorkflows(tempDir)
    expect(workflows).toEqual([])
  })

  it('should skip invalid JSON', async () => {
    const workflowsDir = join(tempDir, 'workflows')
    await mkdir(workflowsDir, { recursive: true })
    await writeFile(join(workflowsDir, 'broken.workflow.json'), 'not valid json{{{')

    const workflows = await loadUserWorkflows(tempDir)
    expect(workflows).toEqual([])
  })

  it('should skip non-.workflow.json files', async () => {
    const workflowsDir = join(tempDir, 'workflows')
    await mkdir(workflowsDir, { recursive: true })
    await writeFile(join(workflowsDir, 'readme.md'), '# Not a workflow')

    const workflow = makeWorkflow({
      metadata: { id: 'valid', name: 'Valid', description: 'Valid', version: '1.0' },
    })
    await writeFile(join(workflowsDir, 'valid.workflow.json'), JSON.stringify(workflow))

    const workflows = await loadUserWorkflows(tempDir)
    expect(workflows).toHaveLength(1)
    expect(workflows[0]!.metadata.id).toBe('valid')
  })
})

describe('loadAllWorkflows', () => {
  it('should return default workflows when workflows directory does not exist', async () => {
    const defaults = await loadDefaultWorkflows()
    const workflows = await loadAllWorkflows(tempDir)
    expect(workflows.length).toBeGreaterThanOrEqual(defaults.length)
  })

  it('should merge defaults and user workflows', async () => {
    const workflowsDir = join(tempDir, 'workflows')
    await mkdir(workflowsDir, { recursive: true })

    const workflow = makeWorkflow({
      metadata: { id: 'test', name: 'Test', description: 'A test workflow', version: '1.0' },
    })
    await writeFile(join(workflowsDir, 'test.workflow.json'), JSON.stringify(workflow))

    const defaults = await loadDefaultWorkflows()
    const workflows = await loadAllWorkflows(tempDir)
    expect(workflows.some((w) => w.metadata.id === 'test')).toBe(true)
    expect(workflows.length).toBeGreaterThanOrEqual(defaults.length + 1)
  })

  it('should give precedence to user workflows over defaults', async () => {
    const workflowsDir = join(tempDir, 'workflows')
    await mkdir(workflowsDir, { recursive: true })

    const workflow = makeWorkflow({
      metadata: { id: 'custom', name: 'Custom', description: 'Custom', version: '1.0' },
    })
    await writeFile(join(workflowsDir, 'custom.workflow.json'), JSON.stringify(workflow))

    const workflows = await loadAllWorkflows(tempDir)
    const custom = workflows.find((w) => w.metadata.id === 'custom')
    expect(custom).toBeDefined()
  })
})

describe('loadDefaultWorkflows', () => {
  it('should load bundled default workflows', async () => {
    const defaults = await loadDefaultWorkflows()
    expect(defaults.length).toBeGreaterThanOrEqual(1)
    expect(defaults.some((w) => w.metadata.id === 'default')).toBe(true)
  })
})

describe('findWorkflowById', () => {
  it('should return the matching workflow', () => {
    const workflows = [
      makeWorkflow({ metadata: { id: 'a', name: 'A', description: 'A', version: '1' } }),
      makeWorkflow({ metadata: { id: 'b', name: 'B', description: 'B', version: '1' } }),
    ]
    const found = findWorkflowById('b', workflows)
    expect(found).toBeDefined()
    expect(found!.metadata.name).toBe('B')
  })

  it('should return undefined for non-existent id', () => {
    const workflows = [makeWorkflow({ metadata: { id: 'a', name: 'A', description: 'A', version: '1' } })]
    expect(findWorkflowById('missing', workflows)).toBeUndefined()
  })
})

describe('CRUD', () => {
  it('should save and load a workflow', async () => {
    const workflow = makeWorkflow({
      metadata: { id: 'my_wf', name: 'My Workflow', description: 'Test', version: '1.0' },
    })

    await saveWorkflow(tempDir, workflow)
    const loaded = await loadAllWorkflows(tempDir)
    const found = loaded.find((w) => w.metadata.id === 'my_wf')

    expect(found).toBeDefined()
    expect(found!.metadata.name).toBe('My Workflow')
    expect(found!.steps).toHaveLength(1)
  })

  it('should save with proper JSON formatting', async () => {
    const workflow = makeWorkflow({
      metadata: { id: 'fmt', name: 'Formatted', description: 'Test', version: '1.0' },
    })

    await saveWorkflow(tempDir, workflow)
    const raw = await readFile(join(tempDir, 'workflows', 'fmt.workflow.json'), 'utf-8')

    expect(raw).toContain('\n')
    expect(raw.endsWith('\n')).toBe(true)
    expect(JSON.parse(raw)).toEqual(workflow)
  })

  it('should delete a workflow', async () => {
    const workflow = makeWorkflow({
      metadata: { id: 'deleteme', name: 'Delete Me', description: 'Temp', version: '1' },
    })

    await saveWorkflow(tempDir, workflow)
    const result = await deleteWorkflow(tempDir, 'deleteme')
    expect(result.success).toBe(true)

    const workflows = await loadAllWorkflows(tempDir)
    expect(workflows.find((w) => w.metadata.id === 'deleteme')).toBeUndefined()
  })

  it('should not delete built-in default workflows', async () => {
    const result = await deleteWorkflow(tempDir, 'default')
    expect(result.success).toBe(false)
    expect(result.reason).toBe('Cannot delete built-in defaults')
  })

  it('should return false when deleting non-existent workflow', async () => {
    const result = await deleteWorkflow(tempDir, 'nonexistent')
    expect(result.success).toBe(false)
  })

  it('should check workflow existence', async () => {
    expect(await workflowExists(tempDir, 'nope')).toBe(false)

    await saveWorkflow(
      tempDir,
      makeWorkflow({
        metadata: { id: 'exists', name: 'Exists', description: 'E', version: '1' },
      }),
    )
    expect(await workflowExists(tempDir, 'exists')).toBe(true)
  })
})

describe('isDefaultWorkflow', () => {
  it('should correctly identify built-in default workflows', async () => {
    const defaults = await loadDefaultWorkflows()
    for (const wf of defaults) {
      expect(await isDefaultWorkflow(wf.metadata.id)).toBe(true)
    }
    expect(await isDefaultWorkflow('nonexistent-workflow')).toBe(false)
  })
})

describe('getDefaultWorkflowIds', () => {
  it('should return all default workflow IDs', async () => {
    const ids = await getDefaultWorkflowIds()
    expect(ids.length).toBeGreaterThan(0)
    expect(ids).toContain('default')
  })
})

async function createProjectWorkflowFile(projectDir: string, id: string, name: string): Promise<void> {
  const workflowsDir = join(projectDir, '.openfox', 'workflows')
  await mkdir(workflowsDir, { recursive: true })
  const workflow = makeWorkflow({ metadata: { id, name, description: `Project workflow ${id}`, version: '1.0' } })
  await writeFile(join(workflowsDir, `${id}.workflow.json`), JSON.stringify(workflow))
}

describe('loadProjectWorkflows', () => {
  it('should return empty array when project dir does not exist', async () => {
    const workflows = await loadProjectWorkflows(tempDir)
    expect(workflows).toEqual([])
  })

  it('should load valid .workflow.json files from .openfox/workflows/', async () => {
    await createProjectWorkflowFile(tempDir, 'proj-wf', 'Project Workflow')

    const workflows = await loadProjectWorkflows(tempDir)
    expect(workflows).toHaveLength(1)
    expect(workflows[0]!.metadata.id).toBe('proj-wf')
    expect(workflows[0]!.metadata.name).toBe('Project Workflow')
  })
})

describe('loadAllWorkflows with project', () => {
  it('should merge project workflows on top of user and defaults', async () => {
    await createProjectWorkflowFile(tempDir, 'proj-wf', 'Project Workflow')

    const defaults = await loadDefaultWorkflows()
    const workflows = await loadAllWorkflows(tempDir, tempDir)
    expect(workflows.some((w) => w.metadata.id === 'proj-wf')).toBe(true)
    expect(workflows.length).toBeGreaterThanOrEqual(defaults.length + 1)
  })

  it('should give precedence to project workflows over user and defaults', async () => {
    const workflowsDir = join(tempDir, 'workflows')
    await mkdir(workflowsDir, { recursive: true })
    const userWf = makeWorkflow({ metadata: { id: 'shared', name: 'User WF', description: 'U', version: '1' } })
    await writeFile(join(workflowsDir, 'shared.workflow.json'), JSON.stringify(userWf))
    await createProjectWorkflowFile(tempDir, 'shared', 'Project WF')

    const workflows = await loadAllWorkflows(tempDir, tempDir)
    const shared = workflows.find((w) => w.metadata.id === 'shared')
    expect(shared).toBeDefined()
    expect(shared!.metadata.name).toBe('Project WF')
  })

  it('should give precedence to project workflows over defaults with same id', async () => {
    await createProjectWorkflowFile(tempDir, 'default', 'Project Override')

    const workflows = await loadAllWorkflows(tempDir, tempDir)
    const overridden = workflows.find((w) => w.metadata.id === 'default')
    expect(overridden).toBeDefined()
    expect(overridden!.metadata.name).toBe('Project Override')
  })

  it('should work without project dir', async () => {
    const defaults = await loadDefaultWorkflows()
    const workflows = await loadAllWorkflows(tempDir)
    expect(workflows.length).toBeGreaterThanOrEqual(defaults.length)
  })
})

describe('CRUD project workflows', () => {
  it('should save and load a project workflow', async () => {
    const workflow = makeWorkflow({
      metadata: { id: 'proj_wf', name: 'Project WF', description: 'P', version: '1.0' },
    })

    await saveWorkflowToProject(tempDir, workflow)

    const loaded = await loadProjectWorkflows(tempDir)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.metadata.id).toBe('proj_wf')
  })

  it('should delete a project workflow', async () => {
    const workflow = makeWorkflow({
      metadata: { id: 'proj_del', name: 'Delete Project', description: 'Temp', version: '1' },
    })

    await saveWorkflowToProject(tempDir, workflow)
    expect(await loadProjectWorkflows(tempDir)).toHaveLength(1)

    const result = await deleteProjectWorkflow(tempDir, 'proj_del')
    expect(result.success).toBe(true)
    expect(await loadProjectWorkflows(tempDir)).toHaveLength(0)
  })
})
