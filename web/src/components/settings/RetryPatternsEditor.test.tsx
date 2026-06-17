/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { isValidRegex } from './RetryPatternsEditor'

describe('isValidRegex', () => {
  it('returns true for valid regex', () => {
    expect(isValidRegex('hello')).toBe(true)
    expect(isValidRegex('\\d+')).toBe(true)
    expect(isValidRegex('(foo|bar)')).toBe(true)
  })

  it('returns false for invalid regex', () => {
    expect(isValidRegex('[invalid')).toBe(false)
    expect(isValidRegex('(unclosed')).toBe(false)
  })

  it('returns true for empty string', () => {
    expect(isValidRegex('')).toBe(true)
  })
})
