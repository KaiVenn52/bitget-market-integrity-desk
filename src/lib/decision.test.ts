import { describe, expect, it } from 'vitest'
import { snapshotFor } from '../data/snapshots'
import type { MoveAnalysis, Passport, StudyResult } from '../types'
import { buildDecisionMemo } from './decision'

const passport = (overrides: Partial<Passport> = {}): Passport => ({
  ...snapshotFor('rNVDAUSDT'),
  state: 'PASS',
  checks: snapshotFor('rNVDAUSDT').checks.map((check) => ({ ...check, state: 'pass' as const })),
  ...overrides,
})

const noMoveAnalysis = {
  verdicts: { likelyCatalyst: { state: 'NO_MATERIAL_MOVE' }, whatWouldChange: ['A move above 20 bps.'], headlines: [] },
  metrics: { move: { detected: false, reason: 'Largest measured move was 9 bps.' } },
} as unknown as MoveAnalysis

const closedMarketStudy = {
  available: true,
  target: { driftBps: 83 },
  current: { underlyingTradable: false },
  stats: { episodes: 6, confirmationRate: 83 },
  verdict: {
    headline: '5 of 6 materially resolved episodes moved the same way as the drift.',
    detail: 'This is a historical base rate, not a forecast: the sample is small.',
    tone: 'caution',
  },
} as StudyResult

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

  it('treats the reported prior close as the closed-market basis, not broken data', () => {
    const checks = passport().checks.map((check) => check.id === 'freshness'
      ? { ...check, state: 'fail' as const, detail: 'Underlying 226628s old.' }
      : check.id === 'alignment'
        ? { ...check, state: 'caution' as const }
        : check)
    const result = buildDecisionMemo(passport({ state: 'UNVERIFIABLE', premiumBps: 83, checks }), null, closedMarketStudy)

    expect(result.label).toBe('Wait for the underlying session')
    expect(result.headline).toContain('cannot reprice yet')
    expect(result.referenceBasis).toContain('reported prior close')
    expect(result.friction.map((item) => item.label)).not.toContain('Fixture timestamps')
    expect(result.friction).toContainEqual(expect.objectContaining({ label: 'Closed-market drift', detail: '+83 bps from the reported prior close.' }))
    expect(result.missingConfirmation[0]).toContain('live quote')
  })

  it('carries the historical base rate and sample size into the decision', () => {
    const result = buildDecisionMemo(passport(), null, closedMarketStudy)
    expect(result.baseRate).toEqual(expect.objectContaining({ sampleSize: 6, confirmationRate: 83, targetDriftBps: 83 }))
    expect(result.baseRate?.detail).toContain('not a forecast')
  })

  it('does not manufacture a base rate from an empty comparison sample', () => {
    const emptyStudy = { ...closedMarketStudy, stats: { ...closedMarketStudy.stats, episodes: 0 } }
    expect(buildDecisionMemo(passport(), null, emptyStudy).baseRate).toBeNull()
  })
})
