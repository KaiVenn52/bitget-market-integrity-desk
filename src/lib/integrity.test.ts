import { describe, expect, it } from 'vitest'
import { bpsBetween, buildChecks, derivePassportState, freshnessState, priceState } from './integrity'
import type { CheckState, IntegrityCheck } from '../types'

const checksWith = (...states: CheckState[]) => states.map((state, index) => ({ id: String(index), state })) as IntegrityCheck[]

describe('integrity engine', () => {
  it.each([
    [101, 100, 100],
    [99, 100, -100],
    [100, 100, 0],
  ])('computes signed premium for %s versus %s', (token, underlying, expected) => {
    expect(bpsBetween(token, underlying)).toBe(expected)
  })

  it.each([
    [-101, 'fail'],
    [-100, 'caution'],
    [-20, 'pass'],
    [0, 'pass'],
    [20, 'pass'],
    [21, 'caution'],
    [100, 'caution'],
    [101, 'fail'],
  ] as const)('classifies %s bps at the published price boundaries', (value, expected) => {
    expect(priceState(value)).toBe(expected)
  })

  it.each([
    [0, 'pass'],
    [30, 'pass'],
    [31, 'caution'],
    [120, 'caution'],
    [121, 'fail'],
  ] as const)('classifies %s-second quote age at the published freshness boundaries', (value, expected) => {
    expect(freshnessState(value)).toBe(expected)
  })

  it.each([
    [['pass', 'unknown', 'unknown'], 'UNVERIFIABLE'],
    [['pass', 'pass', 'pass'], 'PASS'],
    [['pass', 'pass', 'caution'], 'CAUTION'],
    [['pass', 'pass', 'pass', 'unknown'], 'CAUTION'],
    [['pass', 'pass', 'fail'], 'CAUTION'],
  ] as const)('derives %s from observable-state coverage', (states, expected) => {
    expect(derivePassportState(checksWith(...states))).toBe(expected)
  })

  it('uses the worse source age and preserves unknown checks in a complete passport', () => {
    const generated = buildChecks({
      symbol: 'rAAPLUSDT', underlyingSymbol: 'AAPL.US', company: 'Apple',
      tokenPrice: 100, underlyingPrice: 100, change24h: 0,
    }, 20, 121)

    expect(generated.find((check) => check.id === 'freshness')?.state).toBe('fail')
    expect(generated.find((check) => check.id === 'corporate')?.state).toBe('unknown')
    expect(generated.find((check) => check.id === 'liquidity')?.state).toBe('unknown')
    expect(derivePassportState(generated)).toBe('CAUTION')
  })
})
