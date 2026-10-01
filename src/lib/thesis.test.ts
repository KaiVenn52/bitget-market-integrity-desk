import { describe, expect, it } from 'vitest'
import { snapshotFor } from '../data/snapshots'
import type { MoveAnalysis, Passport } from '../types'
import { assessThesis, evaluateCondition, researchGap, validCondition } from './thesis'

const passport = (changes: Partial<Passport> = {}): Passport => ({ ...snapshotFor('rNVDAUSDT'), mode: 'live', tokenQuoteAge: 1, premiumBps: 80, ...changes })
const analysis = (changes: Partial<MoveAnalysis> = {}): MoveAnalysis => ({
  symbol: 'rNVDAUSDT', evidence: [],
  reference: { chosen: { price: passport().instrument.underlyingPrice!, ageSeconds: 5, session: 'regular' }, stale: false, kind: 'live-quote', underlyingTradable: true, note: 'Fresh live quote.' },
  metrics: { move: { detected: true, candlesUsed: 40, reason: 'Measured 80 bps.' } },
  verdicts: { likelyCatalyst: { state: 'NEWS_TIMED', evidenceIds: [], detail: 'Timed candidate.' }, headlines: [] },
  news: { status: 'available' }, ...changes,
} as MoveAnalysis)

describe('explicit research hypotheses', () => {
  it('keeps the gap attached to its own source tier, including when authenticated Stock+ is missing', () => {
    const independent = analysis({ metrics: { ...analysis().metrics, drift: { currentBps: 83, priorBps: 60, deltaBps: 23, trend: 'widening', lookbackMinutes: 30 } } })
    expect(researchGap(passport({ premiumBps: null }), independent)).toBe(83)
    expect(researchGap(passport(), analysis({ reference: { ...analysis().reference, chosen: { price: 999, ageSeconds: 1, session: 'regular' } } }))).toBeNull()
  })
  it('distinguishes the stale-reference explanation from the overnight interpretation of the same gap', () => {
    const old = analysis({ reference: { ...analysis().reference, stale: true } })
    expect(assessThesis('feed', passport(), old).status).toBe('SUPPORTED')
    expect(assessThesis('overnight', passport(), old).status).toBe('OUT_OF_SCOPE')
  })
  it('never diagnoses an unavailable quote as feed lag', () => {
    const missing = analysis({ reference: { ...analysis().reference, chosen: null } })
    expect(assessThesis('feed', passport(), missing).status).toBe('UNRESOLVED')
  })
  it('does not call an expected prior close a stalled feed', () => {
    const closed = analysis({ reference: { ...analysis().reference, kind: 'reported-close', underlyingTradable: false, stale: true } })
    expect(assessThesis('feed', passport(), closed).status).toBe('OUT_OF_SCOPE')
    expect(assessThesis('overnight', passport(), closed).status).toBe('UNRESOLVED')
  })
  it('supports headline timing without claiming causation', () => {
    const result = assessThesis('news', passport(), analysis())
    expect(result.status).toBe('SUPPORTED')
    expect(result.detail).toContain('not causation')
  })
  it('cannot reject a news explanation from an unavailable feed or insufficient candles', () => {
    expect(assessThesis('news', passport(), analysis({ news: { status: 'unavailable', retrieved: 0, note: 'down' } })).status).toBe('UNRESOLVED')
    const thin = analysis({ metrics: { ...analysis().metrics, move: { detected: false, candlesUsed: 1, reason: 'Insufficient data.' } } })
    expect(assessThesis('news', passport(), thin).status).toBe('UNRESOLVED')
  })
  it('rejects only the observed short-term repricing premise when sufficient candles show no event', () => {
    const quiet = analysis({ metrics: { ...analysis().metrics, move: { detected: false, candlesUsed: 40, reason: 'Largest move 4 bps.' } } })
    expect(assessThesis('news', passport(), quiet).status).toBe('CONTRADICTED')
    expect(assessThesis('integrity', passport(), quiet).status).not.toBe('CONTRADICTED')
  })
  it('refuses to assess demonstration, stale-token or other-symbol observations', () => {
    expect(assessThesis('feed', passport({ mode: 'snapshot' }), analysis()).status).toBe('UNRESOLVED')
    expect(assessThesis('feed', passport({ tokenQuoteAge: 900 }), analysis()).status).toBe('UNRESOLVED')
    expect(assessThesis('feed', passport(), analysis({ symbol: 'rTSLAUSDT' })).status).toBe('UNRESOLVED')
  })
})

describe('observable invalidation conditions', () => {
  it('triggers a saved gap threshold only on a comparable fresh reference tier', () => {
    const rule = { metric: 'gap-within' as const, thresholdBps: 20 }
    expect(evaluateCondition(rule, 80, 'live-quote', passport({ premiumBps: 15 }), analysis()).status).toBe('TRIGGERED')
    expect(evaluateCondition(rule, 80, 'live-quote', passport(), analysis()).status).toBe('NOT_TRIGGERED')
    expect(evaluateCondition(rule, 80, 'reported-close', passport(), analysis()).status).toBe('UNVERIFIABLE')
  })
  it('does not infer reversal from a tiny fluctuation', () => {
    const rule = { metric: 'gap-reversed' as const, thresholdBps: 20 }
    expect(evaluateCondition(rule, 80, 'live-quote', passport({ premiumBps: -1 }), analysis()).status).toBe('NOT_TRIGGERED')
    expect(evaluateCondition(rule, 80, 'live-quote', passport({ premiumBps: -30 }), analysis()).status).toBe('TRIGGERED')
  })
  it('does not call a rolled prior close a reversal of the saved overnight baseline', () => {
    const closed = analysis({ reference: { ...analysis().reference, kind: 'reported-close', closeDateKey: '2026-10-02' } })
    expect(evaluateCondition({ metric: 'gap-reversed', thresholdBps: 20 }, 80, 'reported-close', passport({ premiumBps: -30 }), closed, '2026-10-01').status).toBe('UNVERIFIABLE')
  })
  it('requires a genuinely fresh same-session reference, not a reported close', () => {
    const rule = { metric: 'reference-fresh' as const, thresholdBps: 20 }
    expect(evaluateCondition(rule, 80, 'reported-close', passport(), analysis()).status).toBe('TRIGGERED')
    expect(evaluateCondition(rule, 80, 'reported-close', passport(), analysis({ reference: { ...analysis().reference, kind: 'reported-close', underlyingTradable: false } })).status).toBe('NOT_TRIGGERED')
  })
  it('leaves manual notes, missing investigations and malformed thresholds unverifiable', () => {
    expect(evaluateCondition(undefined, 80, 'live-quote', passport(), analysis()).status).toBe('UNVERIFIABLE')
    expect(evaluateCondition({ metric: 'gap-within', thresholdBps: 20 }, 80, 'live-quote', passport(), null).status).toBe('UNVERIFIABLE')
    expect(validCondition({ metric: 'gap-within', thresholdBps: NaN })).toBe(false)
    expect(validCondition({ metric: 'gap-within', thresholdBps: -10 })).toBe(false)
    expect(validCondition({ metric: '__proto__', thresholdBps: 20 })).toBe(false)
    expect(validCondition({ metric: { toString: null }, thresholdBps: 20 })).toBe(false)
  })
})
