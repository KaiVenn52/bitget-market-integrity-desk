import { describe, expect, it } from 'vitest'
import { bpsBetween, derivePassportState, freshnessState, priceState } from './integrity'
import type { IntegrityCheck } from '../types'

describe('integrity engine', () => {
  it('computes signed premium in basis points', () => { expect(bpsBetween(101, 100)).toBe(100); expect(bpsBetween(99, 100)).toBe(-100) })
  it('uses published price thresholds', () => { expect(priceState(20)).toBe('pass'); expect(priceState(21)).toBe('caution'); expect(priceState(101)).toBe('fail') })
  it('uses published freshness thresholds', () => { expect(freshnessState(30)).toBe('pass'); expect(freshnessState(31)).toBe('caution'); expect(freshnessState(121)).toBe('fail') })
  it('abstains when fewer than three checks are observable', () => { const checks = [{ state: 'pass' }, { state: 'unknown' }, { state: 'unknown' }] as IntegrityCheck[]; expect(derivePassportState(checks)).toBe('UNVERIFIABLE') })
})
