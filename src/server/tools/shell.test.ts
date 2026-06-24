import { describe, it, expect } from 'vitest'
import { hasBackgroundAmpersand } from './shell.js'

describe('hasBackgroundAmpersand', () => {
  it('detects trailing & as background operator', () => {
    expect(hasBackgroundAmpersand('npm run dev &')).toBe(true)
  })

  it('detects trailing & with whitespace', () => {
    expect(hasBackgroundAmpersand('npm run dev & ')).toBe(true)
  })

  it('detects trailing & with semicolon', () => {
    expect(hasBackgroundAmpersand('npm run dev &;')).toBe(true)
  })

  it('detects trailing & with semicolon and whitespace', () => {
    expect(hasBackgroundAmpersand('npm run dev &; ')).toBe(true)
  })

  it('detects redirect then background', () => {
    expect(hasBackgroundAmpersand('cmd > file &')).toBe(true)
  })

  it('rejects logical AND (&&)', () => {
    expect(hasBackgroundAmpersand('cmd1 && cmd2')).toBe(false)
  })

  it('rejects stderr pipe (|&)', () => {
    expect(hasBackgroundAmpersand('cmd1 |& cmd2')).toBe(false)
  })

  it('rejects redirect syntax with &>', () => {
    expect(hasBackgroundAmpersand('cmd &> file')).toBe(false)
  })

  it('rejects redirect syntax with >&', () => {
    expect(hasBackgroundAmpersand('cmd >& file')).toBe(false)
  })

  it('rejects 2>&1 redirect', () => {
    expect(hasBackgroundAmpersand('cmd 2>&1')).toBe(false)
  })

  it('rejects & in the middle of a command', () => {
    expect(hasBackgroundAmpersand('cmd & other_cmd')).toBe(false)
  })

  it('rejects normal command without &', () => {
    expect(hasBackgroundAmpersand('npm run test')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(hasBackgroundAmpersand('')).toBe(false)
  })

  it('rejects command ending with &&', () => {
    expect(hasBackgroundAmpersand('cmd &&')).toBe(false)
  })

  it('rejects command ending with |&', () => {
    expect(hasBackgroundAmpersand('cmd |&')).toBe(false)
  })

  it('detects & after compound command with &&', () => {
    expect(hasBackgroundAmpersand('cmd1 && cmd2 &')).toBe(true)
  })

  it('rejects & followed by redirect (cmd & 2>&1)', () => {
    expect(hasBackgroundAmpersand('cmd & 2>&1')).toBe(false)
  })

  it('rejects mid-command & (cmd1 & cmd2)', () => {
    expect(hasBackgroundAmpersand('cmd1 & cmd2')).toBe(false)
  })

  it('rejects & before shell comment (cmd & # comment)', () => {
    expect(hasBackgroundAmpersand('cmd & # comment')).toBe(false)
  })
})
