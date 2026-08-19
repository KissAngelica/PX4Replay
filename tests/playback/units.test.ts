import { describe, expect, it } from 'vitest'
import { formatNumber, formatPercent, formatTimeUs, radiansToDegrees } from '../../src/utils/units'

describe('unit formatting', () => {
  it('uses placeholders for missing and invalid data', () => {
    expect(formatNumber(undefined, 1, 'V')).toBe('--')
    expect(formatNumber(Number.NaN, 1, 'V')).toBe('--')
    expect(formatPercent(undefined)).toBe('--')
  })

  it('formats flight units consistently', () => {
    expect(formatNumber(22.36, 1, 'V')).toBe('22.4 V')
    expect(formatPercent(0.756)).toBe('76 %')
    expect(radiansToDegrees(-Math.PI / 2)).toBe('-90.0°')
    expect(radiansToDegrees(-Math.PI / 2, true)).toBe('270.0°')
    expect(formatTimeUs(83_450_000)).toBe('01:23.450')
  })
})
