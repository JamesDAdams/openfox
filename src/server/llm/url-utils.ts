const VERSION_PREFIX_REGEX = /\/v\d+(\/|$)/

export function hasVersionPrefix(url: string): boolean {
  return VERSION_PREFIX_REGEX.test(url)
}

export function getVersionPrefix(url: string): string | null {
  const match = url.match(/\/v\d+/)
  return match ? match[0] : null
}

export function ensureVersionPrefix(url: string, defaultVersion = '/v1'): string {
  if (hasVersionPrefix(url)) return url
  return `${url.replace(/\/+$/, '')}${defaultVersion}`
}

export function stripVersionPrefix(url: string): string {
  return url.replace(/\/v\d+\/?$/, '')
}

export function buildModelsUrl(baseUrl: string): string {
  return `${ensureVersionPrefix(baseUrl)}/models`
}
