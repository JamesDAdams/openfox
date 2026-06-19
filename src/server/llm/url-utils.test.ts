import { describe, it, expect } from 'vitest'
import {
  hasVersionPrefix,
  getVersionPrefix,
  ensureVersionPrefix,
  stripVersionPrefix,
  buildModelsUrl,
} from './url-utils.js'

describe('hasVersionPrefix', () => {
  it('returns true for /v1', () => {
    expect(hasVersionPrefix('http://localhost:8000/v1')).toBe(true)
  })

  it('returns true for /v2', () => {
    expect(hasVersionPrefix('http://localhost:8000/v2')).toBe(true)
  })

  it('returns true for /v4', () => {
    expect(hasVersionPrefix('http://localhost:8000/v4')).toBe(true)
  })

  it('returns true for /v1 with trailing slash', () => {
    expect(hasVersionPrefix('http://localhost:8000/v1/')).toBe(true)
  })

  it('returns true for version prefix in subpath', () => {
    expect(hasVersionPrefix('https://opencode.ai/zen/go/v1')).toBe(true)
  })

  it('returns false for URL without version prefix', () => {
    expect(hasVersionPrefix('http://localhost:8000')).toBe(false)
  })

  it('returns false for URL with trailing slash only', () => {
    expect(hasVersionPrefix('http://localhost:8000/')).toBe(false)
  })

  it('returns false for version-like string in path not matching pattern', () => {
    expect(hasVersionPrefix('http://localhost:8000/v1something')).toBe(false)
  })
})

describe('getVersionPrefix', () => {
  it('returns /v1 for /v1 URL', () => {
    expect(getVersionPrefix('http://localhost:8000/v1')).toBe('/v1')
  })

  it('returns /v4 for /v4 URL', () => {
    expect(getVersionPrefix('http://localhost:8000/v4')).toBe('/v4')
  })

  it('returns null for URL without version prefix', () => {
    expect(getVersionPrefix('http://localhost:8000')).toBeNull()
  })

  it('returns /v1 for OpenCode Go URL', () => {
    expect(getVersionPrefix('https://opencode.ai/zen/go/v1')).toBe('/v1')
  })
})

describe('ensureVersionPrefix', () => {
  it('appends /v1 to URL without version prefix', () => {
    expect(ensureVersionPrefix('http://localhost:8000')).toBe('http://localhost:8000/v1')
  })

  it('does not modify URL that already has /v1', () => {
    expect(ensureVersionPrefix('http://localhost:8000/v1')).toBe('http://localhost:8000/v1')
  })

  it('does not modify URL that already has /v4', () => {
    expect(ensureVersionPrefix('http://localhost:8000/v4')).toBe('http://localhost:8000/v4')
  })

  it('strips trailing slash before appending', () => {
    expect(ensureVersionPrefix('http://localhost:8000/')).toBe('http://localhost:8000/v1')
  })

  it('uses custom default version', () => {
    expect(ensureVersionPrefix('http://localhost:8000', '/v2')).toBe('http://localhost:8000/v2')
  })

  it('does not modify OpenCode Go URL', () => {
    expect(ensureVersionPrefix('https://opencode.ai/zen/go/v1')).toBe('https://opencode.ai/zen/go/v1')
  })

  it('does not modify URL with version prefix in subpath', () => {
    expect(ensureVersionPrefix('https://api.provider.com/v4')).toBe('https://api.provider.com/v4')
  })
})

describe('stripVersionPrefix', () => {
  it('strips trailing /v1', () => {
    expect(stripVersionPrefix('http://localhost:8000/v1')).toBe('http://localhost:8000')
  })

  it('strips trailing /v4', () => {
    expect(stripVersionPrefix('http://localhost:8000/v4')).toBe('http://localhost:8000')
  })

  it('strips trailing /v1 with slash', () => {
    expect(stripVersionPrefix('http://localhost:8000/v1/')).toBe('http://localhost:8000')
  })

  it('returns unchanged URL without version prefix', () => {
    expect(stripVersionPrefix('http://localhost:8000')).toBe('http://localhost:8000')
  })

  it('strips /v1 from OpenCode Go URL', () => {
    expect(stripVersionPrefix('https://opencode.ai/zen/go/v1')).toBe('https://opencode.ai/zen/go')
  })

  it('does not strip version prefix in middle of path', () => {
    expect(stripVersionPrefix('http://localhost:8000/v1/models')).toBe('http://localhost:8000/v1/models')
  })
})

describe('buildModelsUrl', () => {
  it('builds models URL from URL without version prefix', () => {
    expect(buildModelsUrl('http://localhost:8000')).toBe('http://localhost:8000/v1/models')
  })

  it('builds models URL from URL with /v1', () => {
    expect(buildModelsUrl('http://localhost:8000/v1')).toBe('http://localhost:8000/v1/models')
  })

  it('builds models URL from URL with /v4', () => {
    expect(buildModelsUrl('http://localhost:8000/v4')).toBe('http://localhost:8000/v4/models')
  })

  it('builds models URL from OpenCode Go URL', () => {
    expect(buildModelsUrl('https://opencode.ai/zen/go/v1')).toBe('https://opencode.ai/zen/go/v1/models')
  })
})
