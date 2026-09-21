import { describe, expect, it } from 'vitest'
import { snapshotFor } from '../data/snapshots'
import type { MoveAnalysis, Passport } from '../types'
import { buildDecisionMemo } from './decision'

const passport = (overrides: Partial<Passport> = {}): Passport => ({
  ...snapshotFor('rNVDAUSDT'),
  state: 'PASS',
  checks: snapshotFor('rNVDAUSDT').checks.map((check) => ({ ...check, state: 'pass' as const })),
  ...overrides,
})

const noMoveAnalysis = {
  verdicts: { likelyCatalyst: { state: 'NO_MATERIAL_MOVE' }, whatWouldChange: ['A move above 20 bps.'] },
  metrics: { move: { detected: false, reason: 'Largest measured move was 9 bps.' } },
} as MoveAnalysis

describe('decision memo', () => {
  it('waits when the passport cannot verify a required reference', () => {
    const result = buildDecisionMemo(passport({ state: 'UNVERIFIABLE' }), null)
    expect(result.disposition).toBe('WAIT')
  })

  it('rejects a catalyst thesis when there is no material move', () => {
    const result = buildDecisionMemo(passport(), noMoveAnalysis)
    expect(result.disposition).toBe('REJECT_THESIS')
    expect(result.changeConditions).toContain('A move above 20 bps.')
  })

  it('investigates a caution state instead of presenting it as cleared', () => {
    const cautious = passport({ state: 'CAUTION', checks: [{ ...passport().checks[0], state: 'caution' }] })
    expect(buildDecisionMemo(cautious, null).disposition).toBe('INVESTIGATE')
  })

  it('marks a fully supported passport ready for human review, never as a trade instruction', () => {
    expect(buildDecisionMemo(passport(), null).label).toBe('Ready for human review')
  })
})
