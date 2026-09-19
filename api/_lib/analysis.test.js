import { describe, expect, it } from 'vitest'
import {
  buildVerdicts,
  classifyHeadline,
  detectMove,
  driftSeries,
  pickReference,
  priceLabel,
  rankHeadlines,
  referenceEvidence,
  sessionOf,
  spreadOf,
  turnoverAcceleration,
  validateCitations,
} from './analysis.js'

// All instants below are UTC. U.S. regular session is 13:30–20:00 UTC in EDT.
const REGULAR = Date.parse('2026-09-17T14:00:00Z')
const PREMARKET = Date.parse('2026-09-17T09:00:00Z')
const AFTERHOURS = Date.parse('2026-09-17T21:00:00Z')
const OVERNIGHT = Date.parse('2026-09-17T02:00:00Z')
const WEEKEND = Date.parse('2026-09-19T15:00:00Z')

const bar = (minutesFromStart, close, turnover = 1000) => ({
  timestamp: Date.parse('2026-09-17T12:00:00Z') + minutesFromStart * 60_000,
  open: close,
  high: close,
  low: close,
  close,
  volume: 10,
  turnover,
})

describe('session labelling', () => {
  it('maps each UTC instant to the correct U.S. session', () => {
    expect(sessionOf(REGULAR)).toBe('regular')
    expect(sessionOf(PREMARKET)).toBe('premarket')
    expect(sessionOf(AFTERHOURS)).toBe('afterhours')
    expect(sessionOf(OVERNIGHT)).toBe('overnight')
    expect(sessionOf(WEEKEND)).toBe('overnight')
  })
})

describe('reference selection', () => {
  it('prefers the freshest quote belonging to the session we are in', () => {
    const result = pickReference([
      { id: 'regular', price: 366.0, timestampMs: AFTERHOURS - 65 * 60_000, session: 'regular' },
      { id: 'afterhours', price: 366.4, timestampMs: AFTERHOURS - 2 * 60_000, session: 'afterhours' },
    ], AFTERHOURS)
    expect(result.chosen.id).toBe('afterhours')
    expect(result.chosen.ageSeconds).toBe(120)
  })

  it('marks an outdated reference as stale instead of pretending it is current', () => {
    const result = pickReference([
      { id: 'regular', price: 366.0, timestampMs: AFTERHOURS - 300 * 60_000, session: 'regular' },
    ], AFTERHOURS)
    expect(result.chosen.id).toBe('regular')
    expect(result.stale).toBe(true)
    expect(result.note).toMatch(/not the current/i)
  })

  it('treats a closed underlying market as drift, not a tradable basis', () => {
    const result = pickReference([
      { id: 'regular', price: 366.0, timestampMs: WEEKEND - 40 * 60 * 60_000, session: 'regular' },
    ], WEEKEND)
    expect(result.stale).toBe(true)
    expect(result.underlyingTradable).toBe(false)
    expect(result.note).toMatch(/underlying market is closed/i)
  })

  it('accepts a fresh same-session reference as a real basis', () => {
    const result = pickReference([
      { id: 'afterhours', price: 366.4, timestampMs: AFTERHOURS - 60_000, session: 'afterhours' },
    ], AFTERHOURS)
    expect(result.stale).toBe(false)
    expect(result.staleReason).toBeNull()
    expect(result.note).toMatch(/current/i)
  })

  // While the underlying cannot trade, the price it last traded at is the correct
  // basis, and it must be usable without an authenticated live quote.
  it('falls back to the last official close while the market is closed', () => {
    const result = pickReference([], WEEKEND, {
      dailyCloses: [{ dateKey: '2026-09-04', close: 366.0 }, { dateKey: '2026-09-08', close: 373.5 }],
    })
    expect(result.kind).toBe('official-close')
    expect(result.chosen.price).toBe(373.5)
    expect(result.closeDateKey).toBe('2026-09-08')
    expect(result.stale).toBe(false)
    expect(result.staleReason).toBeNull()
    expect(result.underlyingTradable).toBe(false)
    expect(result.note).toMatch(/last official close of 373.5 is the correct basis/i)
  })

  it('prefers a live same-session quote over the official close', () => {
    const result = pickReference([
      { id: 'afterhours', price: 366.4, timestampMs: AFTERHOURS - 60_000, session: 'afterhours' },
    ], AFTERHOURS, { dailyCloses: [{ dateKey: '2026-09-04', close: 366.0 }] })
    expect(result.kind).toBe('live-quote')
    expect(result.chosen.id).toBe('afterhours')
  })

  // Inside the main session the underlying trades continuously, so an old close is
  // not a basis: a live quote is required and its absence must stay visible.
  it('does not use an official close as a basis inside the main session', () => {
    const result = pickReference([
      { id: 'regular', price: 366.0, timestampMs: REGULAR - 400 * 60_000, session: 'regular' },
    ], REGULAR, { dailyCloses: [{ dateKey: '2026-09-03', close: 360.0 }] })
    expect(result.kind).toBeNull()
    expect(result.stale).toBe(true)
    expect(result.staleReason).toBe('quote-age')
  })

  it('reports a missing reference when neither a quote nor a close exists', () => {
    const result = pickReference([], WEEKEND, { dailyCloses: [] })
    expect(result.chosen).toBeNull()
    expect(result.stale).toBe(true)
    expect(result.staleReason).toBe('missing')
    expect(result.kind).toBeNull()
  })

  it('ignores unusable close rows rather than using a zero price', () => {
    const result = pickReference([], WEEKEND, { dailyCloses: [{ dateKey: '2026-09-08', close: 0 }, { dateKey: '2026-09-09', close: Number.NaN }] })
    expect(result.kind).toBeNull()
    expect(result.stale).toBe(true)
    expect(result.staleReason).toBe('missing')
  })

  // The failure this guards: no authenticated quote exists and the market is open,
  // so the previous close is not a basis. That must return a missing reference, not
  // throw — an exception here blocked the whole sweep and was reported as a ticker
  // outage instead.
  it('returns a missing reference, without throwing, when only a close exists during the main session', () => {
    const result = pickReference([], REGULAR, { dailyCloses: [{ dateKey: '2026-09-17', close: 360.0 }] })
    expect(result.chosen).toBeNull()
    expect(result.kind).toBeNull()
    expect(result.stale).toBe(true)
    expect(result.staleReason).toBe('missing')
    expect(result.underlyingTradable).toBe(true)
    expect(result.note).toMatch(/main session/i)
  })

  // A session label is not freshness. A stalled feed keeps reporting the current
  // session for hours, and treating that as a live basis would price-verify a
  // token against a quote that stopped updating.
  it('treats a stalled same-session quote as unable to price-verify', () => {
    const result = pickReference([
      { id: 'afterhours', price: 366.4, timestampMs: AFTERHOURS - 20 * 60_000, session: 'afterhours' },
    ], AFTERHOURS)
    expect(result.chosen.id).toBe('afterhours')
    expect(result.stale).toBe(true)
    expect(result.staleReason).toBe('quote-age')
    expect(result.note).toMatch(/1200s old/)
  })

  it('keeps a quote inside the staleness ceiling as live', () => {
    const result = pickReference([
      { id: 'afterhours', price: 366.4, timestampMs: AFTERHOURS - 299_000, session: 'afterhours' },
    ], AFTERHOURS)
    expect(result.stale).toBe(false)
  })

  it('names why a reference is not live, so a stalled feed is not called a closed market', () => {
    const closed = pickReference([{ id: 'regular', price: 366, timestampMs: WEEKEND - 40 * 60 * 60_000, session: 'regular' }], WEEKEND)
    const mismatched = pickReference([{ id: 'regular', price: 366, timestampMs: AFTERHOURS - 300 * 60_000, session: 'regular' }], AFTERHOURS)
    expect(closed.staleReason).toBe('market-closed')
    expect(mismatched.staleReason).toBe('session-mismatch')
  })

  it('abstains when no reference quote was retrieved', () => {
    const result = pickReference([], AFTERHOURS)
    expect(result.chosen).toBeNull()
    expect(result.stale).toBe(true)
    expect(result.staleReason).toBe('missing')
  })
})

describe('price formatting', () => {
  // Prices arrive as full floats, and interpolating one straight into a verdict
  // produced "the last official close of 222.27000427246094" on screen.
  it('does not put a raw float in a sentence a human reads', () => {
    expect(priceLabel(222.27000427246094)).toBe('222.27')
    expect(priceLabel(178.9499969482422)).toBe('178.95')
  })

  it('keeps meaning for a sub-dollar token and drops trailing zeros', () => {
    expect(priceLabel(1.5)).toBe('1.5')
    expect(priceLabel(0.500123456)).toBe('0.500123')
    expect(priceLabel(1000)).toBe('1000')
  })

  it('says unavailable rather than NaN when there is no price', () => {
    expect(priceLabel(null)).toBe('unavailable')
    expect(priceLabel(Number.NaN)).toBe('unavailable')
  })

  it('uses the formatted price in the official-close note', () => {
    const result = pickReference([], AFTERHOURS, {
      dailyCloses: [{ dateKey: '2026-09-18', ts: AFTERHOURS - 86_400_000, close: 222.27000427246094, source: 'official daily close' }],
    })
    expect(result.kind).toBe('official-close')
    expect(result.note).toContain('222.27')
    expect(result.note).not.toContain('222.27000427246094')
  })
})

describe('reference evidence provenance', () => {
  const officialClose = {
    chosen: { price: 336.1300048828125, timestampMs: AFTERHOURS - 86_400_000, session: 'closed', ageSeconds: null, source: 'Yahoo Finance chart API' },
    candidates: [],
    stale: false,
    staleReason: null,
    kind: 'official-close',
    closeDateKey: '2026-09-18',
    underlyingTradable: false,
    currentSession: 'overnight',
    note: 'The underlying is not in its main session (Overnight / closed), so the last official close of 336.13 is the correct basis.',
  }

  // The desk exists to catch misattributed evidence, so its own evidence panel must
  // not attribute a keyless daily close to the authenticated Stock+ feed.
  it('credits the source that actually answered, not Stock+', () => {
    const record = referenceEvidence(officialClose, AFTERHOURS)
    expect(record.source).toBe('Yahoo Finance chart API')
    expect(record.source).not.toMatch(/Stock\+/)
    expect(record.endpoint).toBe('/v8/finance/chart?interval=1d')
  })

  it('describes an official close by its session date, never a null age', () => {
    const record = referenceEvidence(officialClose, AFTERHOURS)
    expect(record.summary).toContain('2026-09-18')
    expect(record.summary).toContain('336.13')
    expect(record.summary).not.toMatch(/null/)
    expect(record.summary).not.toContain('336.1300048828125')
  })

  it('still credits Stock+ for a live quote, where that is the truth', () => {
    const record = referenceEvidence({
      chosen: { price: 222.27, timestampMs: AFTERHOURS, session: 'regular', ageSeconds: 42, source: 'Bitget Stock+' },
      candidates: [], stale: false, staleReason: null, kind: 'live-quote', underlyingTradable: true, currentSession: 'regular',
      note: 'Reference belongs to the current Regular session window and is 42s old.',
    }, AFTERHOURS)
    expect(record.source).toBe('Bitget Stock+ quote')
    expect(record.summary).toContain('age 42s')
    expect(record.summary).not.toMatch(/null/)
  })

  it('marks a missing reference unknown and carries the reason through', () => {
    const record = referenceEvidence({ chosen: null, candidates: [], stale: true, staleReason: 'missing', kind: null, underlyingTradable: false, currentSession: 'regular', note: 'No reference price was retrievable.' }, AFTERHOURS)
    expect(record.state).toBe('unknown')
    expect(record.summary).toContain('No reference price was retrievable')
  })
})

describe('move detection', () => {
  const quiet = Array.from({ length: 16 }, (_, i) => bar(i * 5, 100))
  const repricing = [
    ...Array.from({ length: 12 }, (_, i) => bar(i * 5, 100)),
    bar(60, 100.5),
    bar(65, 101.0),
    bar(70, 101.0),
    bar(75, 101.0),
  ]

  it('reports no event when the market simply did not move', () => {
    const move = detectMove(quiet)
    expect(move.detected).toBe(false)
    expect(move.reason).toMatch(/below the 20 bps event threshold/i)
  })

  it('detects the repricing and locates where it began', () => {
    const move = detectMove(repricing)
    expect(move.detected).toBe(true)
    expect(move.direction).toBe('up')
    expect(move.moveBps).toBe(100)
    // The move started at the first bar that carried the repricing, not at the window edge.
    expect(move.startMs).toBe(repricing[12].timestamp)
    expect(move.sustained).toBe(true)
  })

  it('refuses to locate a start without enough closed candles', () => {
    const move = detectMove([bar(0, 100), bar(5, 100)])
    expect(move.detected).toBe(false)
    expect(move.reason).toMatch(/not enough closed rToken candles/i)
  })

  it('uses the alignment threshold as the event boundary', () => {
    const justOver = [...Array.from({ length: 13 }, (_, i) => bar(i * 5, 100)), bar(65, 100.25), bar(70, 100.25)]
    const justUnder = [...Array.from({ length: 13 }, (_, i) => bar(i * 5, 100)), bar(65, 100.15), bar(70, 100.15)]
    expect(detectMove(justOver).detected).toBe(true)
    expect(detectMove(justUnder).detected).toBe(false)
  })
})

describe('headline timing classification', () => {
  const moveStart = Date.parse('2026-09-17T22:21:00Z')
  const headline = (minutesBeforeMove) => ({
    id: 'h1',
    title: 'NVIDIA announces a new AI chip partnership',
    publishedMs: moveStart - minutesBeforeMove * 60_000,
  })

  it('accepts a headline published shortly before the move as a candidate', () => {
    const result = classifyHeadline(headline(3), moveStart)
    expect(result.timing).toBe('POSSIBLE')
    expect(result.deltaMinutes).toBe(3)
  })

  it('rejects a headline published well after the move as the initial cause', () => {
    const result = classifyHeadline(headline(-26), moveStart)
    expect(result.timing).toBe('TIMING_INCONSISTENT')
    expect(result.reason).toMatch(/too late to be the initial cause/i)
  })

  it('treats a headline published just after the start as reinforcement only', () => {
    const result = classifyHeadline(headline(-4), moveStart)
    expect(result.timing).toBe('POSSIBLE_CONTRIBUTING')
    expect(result.reason).toMatch(/cannot explain the start/i)
  })

  it('separates a distant headline from a timing-consistent one', () => {
    const result = classifyHeadline(headline(180), moveStart)
    expect(result.timing).toBe('DISTANT')
  })

  it('does not invent a publication time', () => {
    const result = classifyHeadline({ id: 'h2', title: 'Untimed item', publishedMs: null }, moveStart)
    expect(result.timing).toBe('TIME_UNKNOWN')
  })

  it('orders candidates with timing-consistent headlines first', () => {
    const ranked = rankHeadlines([headline(-26), headline(3), headline(180)], moveStart)
    expect(ranked.map((item) => item.timing)).toEqual(['POSSIBLE', 'DISTANT', 'TIMING_INCONSISTENT'])
  })
})

describe('drift and turnover', () => {
  it('reports drift widening against a closed reference', () => {
    const candles = [bar(0, 360), bar(5, 362), bar(10, 366)]
    const drift = driftSeries(candles, 360)
    expect(drift.currentBps).toBe(167)
    expect(drift.trend).toBe('widening')
  })

  it('flags turnover acceleration against the trailing baseline', () => {
    const quietBars = Array.from({ length: 12 }, (_, i) => bar(i * 5, 100, 1000))
    const activeBars = [bar(60, 100, 3000), bar(65, 100, 3000), bar(70, 100, 3000)]
    const result = turnoverAcceleration([...quietBars, ...activeBars])
    expect(result.ratio).toBe(3)
    expect(result.state).toBe('pass')
  })

  it('marks a wide top-of-book spread as a liquidity risk', () => {
    const result = spreadOf({ bid1Price: '100', ask1Price: '100.5', bid1Size: '10', ask1Size: '10' })
    expect(result.spreadBps).toBe(50)
    expect(result.state).toBe('fail')
  })

  it('does not claim a spread when the book was not published', () => {
    const result = spreadOf({ lastPrice: '100' })
    expect(result.spreadBps).toBeNull()
    expect(result.note).toMatch(/not published/i)
  })
})

describe('verdict assembly', () => {
  const move = { detected: true, direction: 'up', moveBps: 168, startMs: Date.parse('2026-09-17T22:21:00Z'), sustained: true, reason: 'Up 168 bps over 15 minutes.' }
  const reference = { chosen: { price: 366 }, stale: true, note: 'Reference belongs to the Overnight / closed window.' }
  const turnover = { ratio: 2.3, state: 'pass', note: 'Turnover over the last 15 minutes is 2.3× the trailing baseline.' }
  const drift = { currentBps: 168, priorBps: 24, deltaBps: 144, trend: 'widening', note: 'Drift widened 144 bps over 15 minutes.' }

  it('names a news-timed candidate when a headline precedes the move', () => {
    const verdicts = buildVerdicts({
      move,
      drift,
      turnover,
      reference,
      spread: spreadOf({ bid1Price: '366.6', ask1Price: '366.7' }),
      headlines: [{ id: 'h1', title: 'Chip partnership announced', publishedMs: move.startMs - 3 * 60_000 }],
    })
    expect(verdicts.likelyCatalyst.state).toBe('NEWS_TIMED')
    expect(verdicts.likelyCatalyst.detail).toMatch(/causation is not established/i)
    expect(verdicts.confidence.level).toBe('HIGH')
    expect(verdicts.supporting.map((item) => item.id)).toContain('turnover')
  })

  it('abstains from naming a catalyst when nothing matched the timing', () => {
    const verdicts = buildVerdicts({
      move,
      drift,
      turnover,
      reference,
      spread: spreadOf({ bid1Price: '366.6', ask1Price: '366.7' }),
      headlines: [{ id: 'h1', title: 'Analyst upgrade', publishedMs: move.startMs + 26 * 60_000 }],
    })
    expect(verdicts.likelyCatalyst.state).toBe('NO_STRONG_CATALYST')
    expect(verdicts.rejected).toHaveLength(1)
    expect(verdicts.rejected[0].detail).toMatch(/too late to be the initial cause/i)
    expect(verdicts.confidence.level).toBe('MEDIUM')
  })

  it('reports nothing to attribute when no repricing occurred', () => {
    const verdicts = buildVerdicts({ move: { detected: false, reason: 'Flat.' }, drift: null, turnover: null, reference, spread: null, headlines: [] })
    expect(verdicts.likelyCatalyst.state).toBe('NO_MATERIAL_MOVE')
    expect(verdicts.confidence.level).toBe('LOW')
  })

  it('always states what would change the conclusion', () => {
    const verdicts = buildVerdicts({ move, drift, turnover, reference, spread: null, headlines: [] })
    expect(verdicts.whatWouldChange.length).toBeGreaterThan(0)
    expect(verdicts.alternatives.length).toBeGreaterThan(0)
  })
})

describe('citation gate', () => {
  it('accepts only citations that resolve to supplied evidence', () => {
    const result = validateCitations(['a', 'zzz'], ['a', 'b'])
    expect(result.accepted).toEqual(['a'])
    expect(result.rejected).toEqual(['zzz'])
    expect(result.valid).toBe(false)
  })

  it('accepts a fully resolvable citation set', () => {
    expect(validateCitations(['a', 'b', 'a'], ['a', 'b']).valid).toBe(true)
  })

  it('rejects an empty citation set', () => {
    expect(validateCitations([], ['a']).valid).toBe(false)
  })
})
