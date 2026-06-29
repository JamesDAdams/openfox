import { describe, expect, it } from 'vitest'
import { computeEffectiveTools } from './tool-policy.js'

describe('computeEffectiveTools', () => {
  it('includes always-allowed tools for agents', () => {
    const tools = computeEffectiveTools([], 'agent')
    expect(tools.has('step_done')).toBe(true)
    expect(tools.has('return_value')).toBe(false)
  })

  it('includes always-allowed tools for sub-agents', () => {
    const tools = computeEffectiveTools([], 'sub-agent')
    expect(tools.has('return_value')).toBe(true)
    expect(tools.has('step_done')).toBe(false)
  })

  it('includes explicit allowedTools for agents', () => {
    const tools = computeEffectiveTools(['read_file', 'write_file', 'run_command'], 'agent')
    expect(tools.has('read_file')).toBe(true)
    expect(tools.has('write_file')).toBe(true)
    expect(tools.has('run_command')).toBe(true)
    expect(tools.has('step_done')).toBe(true)
  })

  it('includes explicit allowedTools for sub-agents', () => {
    const tools = computeEffectiveTools(['read_file', 'web_fetch'], 'sub-agent')
    expect(tools.has('read_file')).toBe(true)
    expect(tools.has('web_fetch')).toBe(true)
    expect(tools.has('return_value')).toBe(true)
  })

  it('strips granular action suffixes from allowedTools', () => {
    const tools = computeEffectiveTools(['session_metadata:get,add,update,remove', 'criterion:pass,fail'], 'agent')
    expect(tools.has('session_metadata')).toBe(true)
    expect(tools.has('criterion')).toBe(true)
    expect(tools.has('step_done')).toBe(true)
  })

  it('deduplicates tools that appear in both allowedTools and always-allowed', () => {
    const tools = computeEffectiveTools(['step_done'], 'agent')
    expect(tools.has('step_done')).toBe(true)
    expect(tools.size).toBe(1) // step_done appears once despite being in both
  })

  it('excludes return_value for top-level agents even if in allowedTools', () => {
    const tools = computeEffectiveTools(['read_file', 'return_value', 'write_file'], 'agent')
    expect(tools.has('read_file')).toBe(true)
    expect(tools.has('write_file')).toBe(true)
    expect(tools.has('return_value')).toBe(false)
    expect(tools.has('step_done')).toBe(true)
  })

  it('includes return_value for sub-agents', () => {
    const tools = computeEffectiveTools(['read_file', 'return_value'], 'sub-agent')
    expect(tools.has('read_file')).toBe(true)
    expect(tools.has('return_value')).toBe(true)
  })

  it('handles empty allowedTools', () => {
    const tools = computeEffectiveTools([], 'agent')
    expect(tools.size).toBe(1) // only step_done
    expect([...tools]).toEqual(['step_done'])
  })
})
