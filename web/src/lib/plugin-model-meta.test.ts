import { describe, expect, it } from 'vitest'
import { formatPluginPrice, formatPluginPricingTooltip } from './plugin-model-meta.js'

describe('formatPluginPrice', () => {
  it('formats input/output rates with currency symbol', () => {
    expect(formatPluginPrice({ input: 0.15, output: 0.6, currency: 'USD' })).toBe('$0.15/0.60')
    expect(formatPluginPrice({ input: 1, output: 2, currency: 'EUR' })).toBe('€1.00/2.00')
  })

  it('falls back to currency code when unknown', () => {
    expect(formatPluginPrice({ input: 0.1, currency: 'CHF' })).toBe('CHF 0.10/?')
  })

  it('includes cache rates and discount', () => {
    expect(
      formatPluginPrice({
        input: 0.5,
        output: 1.5,
        cacheRead: 0.05,
        cacheWrite: 0.2,
        discountPercent: 20,
        currency: 'USD',
      }),
    ).toBe('$0.50/1.50 · $0.05/0.20 cache · -20.00%')
  })

  it('returns null when nothing is priced', () => {
    expect(formatPluginPrice({})).toBeNull()
    expect(formatPluginPrice({ discountPercent: 0 })).toBeNull()
  })
})

describe('formatPluginPricingTooltip', () => {
  it('formats detailed tooltip with all rates, discount and lastUpdatedAt', () => {
    const tooltip = formatPluginPricingTooltip({
      input: 0.15,
      output: 0.6,
      cacheRead: 0.075,
      cacheWrite: 0.3,
      discountPercent: 20,
      currency: 'USD',
      lastUpdatedAt: '2026-09-22',
    })
    expect(tooltip).toBe(
      'Input: $0.15 / 1M tokens\nOutput: $0.60 / 1M tokens\nCache read: $0.075 / 1M tokens\nCache write: $0.30 / 1M tokens\nDiscount: -20.00%\nUpdated: 2026-09-22',
    )
  })

  it('returns undefined when no rates are provided', () => {
    expect(formatPluginPricingTooltip({})).toBeUndefined()
  })
})
