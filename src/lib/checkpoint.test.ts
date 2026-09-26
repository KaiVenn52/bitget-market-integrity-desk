import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotFor } from '../data/snapshots'
import type { Passport } from '../types'
import { compareCheckpoint, makeCheckpoint, readCheckpoint, removeCheckpoint, saveCheckpoint } from './checkpoint'
import { buildDecisionMemo } from './decision'

const observedAt = '2026-09-26T08:00:00.000Z'
const laterAt = '2026-09-26T09:00:00.000Z'
const livePassport = (): Passport => ({ ...snapshotFor('rNVDAUSDT'), mode: 'live', scannedAt: observedAt, premiumBps: 42 })
const checkpoint = () => {
  const passport = livePassport()
  const result = makeCheckpoint(passport, null, buildDecisionMemo(passport, null), 'The gap reflects new information.', 'The next equity session fails to confirm it.', '2026-09-26T08:02:00.000Z')
  if (!result) throw new Error('Fixture failed to create checkpoint')
  return result
}

function mockStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  } })
  return values
}

afterEach(() => vi.unstubAllGlobals())

describe('thesis checkpoint', () => {
  it('refuses to freeze the opening demonstration fixture', () => {
    const fixture = snapshotFor('rNVDAUSDT')
    expect(makeCheckpoint(fixture, null, buildDecisionMemo(fixture, null), 'My thesis', 'My condition')).toBeNull()
  })

  it('requires both user-authored fields and bounds stored text', () => {
    const passport = livePassport()
    const memo = buildDecisionMemo(passport, null)
    expect(makeCheckpoint(passport, null, memo, '', 'Condition')).toBeNull()
    expect(makeCheckpoint(passport, null, memo, 'Thesis', '')).toBeNull()
    const result = makeCheckpoint(passport, null, memo, 'T'.repeat(600), 'C'.repeat(400))
    expect(result?.thesis).toHaveLength(500)
    expect(result?.changeCondition).toHaveLength(300)
  })

  it('saves one symbol without exposing its thesis under another symbol', () => {
    mockStorage()
    expect(saveCheckpoint(checkpoint())).toBe(true)
    expect(readCheckpoint('rNVDAUSDT')?.thesis).toBe('The gap reflects new information.')
    expect(readCheckpoint('rAAPLUSDT')).toBeNull()
    expect(removeCheckpoint('rNVDAUSDT')).toBe(true)
    expect(readCheckpoint('rNVDAUSDT')).toBeNull()
  })

  it('rejects malformed local records and unavailable storage without crashing', () => {
    const values = mockStorage()
    values.set('mid.thesis-checkpoint.v1.rNVDAUSDT', '{broken')
    expect(readCheckpoint('rNVDAUSDT')).toBeNull()
    values.set('mid.thesis-checkpoint.v1.rNVDAUSDT', JSON.stringify({ ...checkpoint(), symbol: 'rAAPLUSDT' }))
    expect(readCheckpoint('rNVDAUSDT')).toBeNull()
    values.set('mid.thesis-checkpoint.v1.rNVDAUSDT', JSON.stringify({ ...checkpoint(), referenceBasis: { forged: true } }))
    expect(readCheckpoint('rNVDAUSDT')).toBeNull()
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked') } })
    expect(readCheckpoint('rNVDAUSDT')).toBeNull()
    expect(saveCheckpoint(checkpoint())).toBe(false)
    expect(removeCheckpoint('rNVDAUSDT')).toBe(false)
  })

  it('does not compare a fixture, a different symbol, or the same scan', () => {
    const saved = checkpoint()
    const passport = livePassport()
    const memo = buildDecisionMemo(passport, null)
    expect(compareCheckpoint(saved, passport, memo, null).ready).toBe(false)
    expect(compareCheckpoint(saved, { ...passport, mode: 'snapshot', scannedAt: laterAt }, memo, null).ready).toBe(false)
    expect(compareCheckpoint(saved, { ...passport, instrument: { ...passport.instrument, symbol: 'rAAPLUSDT' }, scannedAt: laterAt }, memo, null).ready).toBe(false)
  })

  it('shows a later decision, check, and source change without judging the free-text thesis', () => {
    const saved = checkpoint()
    const passport = livePassport()
    const later: Passport = {
      ...passport,
      scannedAt: laterAt,
      premiumBps: 75,
      state: 'UNVERIFIABLE',
      checks: passport.checks.map((check) => check.id === passport.checks[0].id ? { ...check, state: 'unknown', result: 'UNVERIFIABLE' } : check),
      evidence: passport.evidence.map((item) => item.id === passport.evidence[0].id ? { ...item, summary: 'Reference source unavailable.' } : item),
    }
    const review = compareCheckpoint(saved, later, buildDecisionMemo(later, null), null)
    expect(review.ready).toBe(true)
    expect(review.decisionChanged).toBe(true)
    expect(review.referenceChanged).toBe(false)
    expect(review.premiumDeltaBps).toBe(33)
    expect(review.checkChanges.some((item) => item.after.includes('UNVERIFIABLE'))).toBe(true)
    expect(review.evidenceChanges.some((item) => item.after.includes('Reference source unavailable'))).toBe(true)
  })

  it('distinguishes a new scan with unchanged content from the same scan', () => {
    const saved = checkpoint()
    const later = { ...livePassport(), scannedAt: laterAt }
    const review = compareCheckpoint(saved, later, buildDecisionMemo(later, null), null)
    expect(review.ready).toBe(true)
    expect(review.decisionChanged).toBe(false)
    expect(review.checkChanges).toEqual([])
    expect(review.evidenceChanges).toEqual([])
  })

  it('does not report a changed check when only its age text advances', () => {
    const saved = checkpoint()
    const later = { ...livePassport(), scannedAt: laterAt, checks: livePassport().checks.map((check, index) => index === 0 ? { ...check, result: `${check.result} · 2s later` } : check) }
    expect(compareCheckpoint(saved, later, buildDecisionMemo(later, null), null).checkChanges).toEqual([])
  })

  it('surfaces a change in reference tier without calling it thesis confirmation', () => {
    const saved = checkpoint()
    const later = { ...livePassport(), scannedAt: laterAt }
    const memo = { ...buildDecisionMemo(later, null), referenceBasis: 'Reported prior close, not a live quote.' }
    expect(compareCheckpoint(saved, later, memo, null).referenceChanged).toBe(true)
  })
})
