export interface RetryLimiter {
  canRetry: () => boolean
  increment: () => void
  reset: () => void
  count: () => number
  maxRetries: () => number
}

export function createRetryLimiter(max: number): RetryLimiter {
  let current = 0

  return {
    canRetry: () => current < max,
    increment: () => {
      current += 1
    },
    reset: () => {
      current = 0
    },
    count: () => current,
    maxRetries: () => max,
  }
}
