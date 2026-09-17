import { describe, expect, it } from 'vitest'
import {
  buildVerdicts,
  classifyHeadline,
  detectMove,
  driftSeries,
  pickReference,
  rankHeadlines,
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
    expect(result.note).toMatch(/current/i)
  })

  it('abstains when no reference quote was retrieved', () => {
    const result = pickReference([], AFTERHOURS)
    expect(result.chosen).toBeNull()
    expect(result.stale).toBe(true)
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
    expect(move.reason).toMatch(/below the 30 bps event threshold/i)
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
