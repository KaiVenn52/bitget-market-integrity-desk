import { describe, expect, it } from 'vitest'
import { alignmentStateOf, detectMove, driftSeries, pickReference, spreadOf, turnoverAcceleration } from './analysis.js'
import { evaluateGate, summarizeSweep, GATE_DECISIONS } from './gate.js'

// Fixtures mirror the exact shape `pickReference` returns. An invented flat
// shape here would make the suite pass while the endpoint failed, so the
// contract tests at the bottom feed real pipeline output into the gate.
const liveReference = {
  chosen: { price: 212.17, ageSeconds: 45, session: 'regular', label: 'Intraday' },
  stale: false,
  underlyingTradable: true,
  currentSession: 'regular',
  note: 'Reference belongs to the current Regular session window.',
}

const closedReference = {
  chosen: { price: 212.17, ageSeconds: 5400, session: 'regular', label: 'Intraday' },
  stale: true,
  underlyingTradable: false,
  currentSession: 'overnight',
  note: 'The underlying market is closed (Overnight), so any gap is token-side drift rather than a tradable basis.',
}

const base = {
  token: { price: 212.2, ageSeconds: 12 },
  reference: liveReference,
  premiumBps: 1,
  alignmentState: 'pass',
  move: { detected: false, reason: 'Largest repricing across 5/15/60 minutes was 4 bps, below the 20 bps event threshold.' },
  drift: { currentBps: 5, priorBps: 4, deltaBps: 1, trend: 'stable' },
  spread: { spreadBps: 1, state: 'pass', note: 'Top-of-book spread is 1 bps.' },
  turnover: { ratio: 1.1, state: 'pass', note: 'Turnover is near its trailing baseline.' },
}

const gate = (overrides = {}) => evaluateGate({ ...base, ...overrides })

describe('gate rules', () => {
  it('blocks when no ticker was retrieved at all', () => {
    const result = gate({ token: { price: null, ageSeconds: null } })
    expect(result.decision).toBe('BLOCKED')
    expect(result.code).toBe('TOKEN_UNAVAILABLE')
    expect(result.reason).toMatch(/source failure, not a market finding/i)
  })

  it('blocks when no underlying reference exists at all', () => {
    const result = gate({ reference: { ...liveReference, chosen: null }, premiumBps: null, alignmentState: 'unknown' })
    expect(result.decision).toBe('BLOCKED')
    expect(result.code).toBe('UNVERIFIABLE_REFERENCE')
    expect(result.reason).toMatch(/missing or unusable source, not a finding/i)
  })

  // The verdict must repeat the retrieval layer's own account of the failure. An
  // earlier version asserted its own cause and told the reader that no official
  // close existed while one had in fact been retrieved but was not a valid basis.
  it('repeats the retrieval layer note instead of asserting its own cause', () => {
    const note = 'No reference quote was retrieved, and an official close cannot stand in for one while the underlying is in its main session.'
    const result = gate({ reference: { ...liveReference, chosen: null, note }, premiumBps: null, alignmentState: 'unknown' })
    expect(result.reason).toContain(note)
    expect(result.reason).not.toMatch(/nor an official daily close was available/i)
  })

  it('blocks when the token feed itself is stale', () => {
    const result = gate({ token: { price: 212.2, ageSeconds: 240 } })
    expect(result.decision).toBe('BLOCKED')
    expect(result.code).toBe('TOKEN_FEED_STALE')
    expect(result.headline).toMatch(/240s/)
  })

  it('blocks a live reference that disagrees beyond the fail threshold', () => {
    const result = gate({ premiumBps: -180, alignmentState: 'fail' })
    expect(result.decision).toBe('BLOCKED')
    expect(result.code).toBe('ALIGNMENT_BREAK')
    expect(result.headline).toMatch(/-180 bps/)
  })

  it('waits, rather than blocks, on a material drift against a closed reference', () => {
    const result = gate({ reference: closedReference, drift: { currentBps: -478, priorBps: -470, deltaBps: -8, trend: 'widening' } })
    expect(result.decision).toBe('WAIT')
    expect(result.code).toBe('STALE_REFERENCE_DRIFT')
    expect(result.reason).toMatch(/478 bps/)
  })

  it('waits when a stale quote is aligned but still cannot verify the token', () => {
    const result = gate({ reference: closedReference, drift: { currentBps: -8, priorBps: -6, deltaBps: -2, trend: 'stable' } })
    expect(result.decision).toBe('WAIT')
    expect(result.code).toBe('STALE_REFERENCE_UNCONFIRMED')
    expect(result.reason).toMatch(/does not verify the current market state/)
  })

  it('does not let a regular-session stale quote clear a live market', () => {
    const staleRegular = { ...closedReference, currentSession: 'regular', note: 'The quote is 907s old.' }
    const result = gate({ reference: staleRegular, drift: { currentBps: 5, priorBps: 3, deltaBps: 2, trend: 'stable' } })
    expect(result.decision).toBe('WAIT')
    expect(result.code).toBe('STALE_REFERENCE_UNCONFIRMED')
  })

  it('flags a premium inside the caution band without calling it a break', () => {
    const result = gate({ premiumBps: 46, alignmentState: 'caution' })
    expect(result.decision).toBe('INVESTIGATE')
    expect(result.code).toBe('ALIGNMENT_CAUTION')
    expect(result.reason).toMatch(/unresolved rather than as a break/i)
  })

  it('flags a repricing it measured but did not explain', () => {
    const result = gate({ move: { detected: true, moveBps: 180, windowMinutes: 60, reason: 'Up 180 bps over 60 minutes, beginning 16:08 UTC.' } })
    expect(result.decision).toBe('INVESTIGATE')
    expect(result.code).toBe('UNEXPLAINED_REPRICING')
    expect(result.reason).toMatch(/did not retrieve headlines/i)
    expect(result.nextStep).toMatch(/attribution/i)
  })

  it('flags a quoted spread wide enough to distort the observed price', () => {
    const result = gate({ spread: { spreadBps: 240, state: 'fail', note: 'Top-of-book spread is 240 bps.' } })
    expect(result.decision).toBe('INVESTIGATE')
    expect(result.code).toBe('WIDE_SPREAD')
  })

  it('does not clear an aligned reported close when the quoted spread is wide', () => {
    const result = gate({
      reference: { ...closedReference, kind: 'reported-close', stale: false },
      premiumBps: 0,
      alignmentState: 'pass',
      drift: { currentBps: 0, priorBps: 0, deltaBps: 0, trend: 'stable' },
      spread: { spreadBps: 200, state: 'fail', note: 'Top-of-book spread is 200 bps.' },
    })
    expect(result.decision).toBe('INVESTIGATE')
    expect(result.code).toBe('WIDE_SPREAD')
  })

  it('does not clear an aligned reported close when a material repricing was measured', () => {
    const result = gate({
      reference: { ...closedReference, kind: 'reported-close', stale: false },
      premiumBps: 0,
      alignmentState: 'pass',
      drift: { currentBps: 0, priorBps: 0, deltaBps: 0, trend: 'stable' },
      move: { detected: true, moveBps: 90, windowMinutes: 15, reason: 'Up 90 bps.' },
    })
    expect(result.decision).toBe('INVESTIGATE')
    expect(result.code).toBe('UNEXPLAINED_REPRICING')
  })

  it('clears a state whose observable checks agree', () => {
    const result = gate()
    expect(result.decision).toBe('CLEAR')
    expect(result.code).toBe('STATE_CONSISTENT')
    expect(result.reason).toMatch(/premium \+1 bps/)
  })
})

describe('gate precedence', () => {
  it('reports a missing reference ahead of every other problem', () => {
    const result = gate({
      reference: { ...liveReference, chosen: null },
      premiumBps: null,
      alignmentState: 'unknown',
      token: { price: 212.2, ageSeconds: 900 },
      move: { detected: true, moveBps: 400, windowMinutes: 60, reason: 'Up 400 bps.' },
    })
    expect(result.code).toBe('UNVERIFIABLE_REFERENCE')
  })

  it('reports a stale token feed ahead of an alignment break', () => {
    const result = gate({ token: { price: 212.2, ageSeconds: 300 }, premiumBps: 200, alignmentState: 'fail' })
    expect(result.code).toBe('TOKEN_FEED_STALE')
  })

  it('routes a closed reference to the drift path even when a break would otherwise fire', () => {
    const result = gate({ reference: closedReference, premiumBps: 150, alignmentState: 'fail', drift: { currentBps: 150, priorBps: 140, deltaBps: 10, trend: 'widening' } })
    expect(result.code).toBe('STALE_REFERENCE_DRIFT')
    expect(result.decision).toBe('WAIT')
  })

  it('treats the closed-reference path as more specific than a detected move', () => {
    const result = gate({
      reference: closedReference,
      drift: { currentBps: 300, priorBps: 280, deltaBps: 20, trend: 'widening' },
      move: { detected: true, moveBps: 300, windowMinutes: 60, reason: 'Up 300 bps.' },
    })
    expect(result.code).toBe('STALE_REFERENCE_DRIFT')
  })

  it('prefers a caution-band premium over a spread warning', () => {
    const result = gate({ premiumBps: 55, alignmentState: 'caution', spread: { spreadBps: 300, state: 'fail', note: 'Wide.' } })
    expect(result.code).toBe('ALIGNMENT_CAUTION')
  })
})

describe('gate output contract', () => {
  const scenarios = [
    ['no ticker', { token: { price: null, ageSeconds: null } }],
    ['unverifiable', { reference: { ...liveReference, chosen: null }, premiumBps: null, alignmentState: 'unknown' }],
    ['stale token', { token: { price: 1, ageSeconds: 400 } }],
    ['break', { premiumBps: 200, alignmentState: 'fail' }],
    ['closed drift', { reference: closedReference, drift: { currentBps: 90, priorBps: 80, deltaBps: 10, trend: 'widening' } }],
    ['closed aligned but unconfirmed', { reference: closedReference, drift: { currentBps: 3, priorBps: 2, deltaBps: 1, trend: 'stable' } }],
    ['caution', { premiumBps: 40, alignmentState: 'caution' }],
    ['move', { move: { detected: true, moveBps: 90, windowMinutes: 15, reason: 'Up 90 bps.' } }],
    ['spread', { spread: { spreadBps: 500, state: 'fail', note: 'Wide.' } }],
    ['clear', {}],
  ]

  it.each(scenarios)('always names evidence and conditions: %s', (_name, overrides) => {
    const result = gate(overrides)
    expect(GATE_DECISIONS).toContain(result.decision)
    expect(result.evidenceIds.length).toBeGreaterThan(0)
    expect(result.conditions.length).toBeGreaterThan(0)
    expect(result.headline.length).toBeGreaterThan(0)
    expect(result.meaning.length).toBeGreaterThan(0)
    expect(result.nextStep.length).toBeGreaterThan(0)
  })

  it('never recommends a trade direction', () => {
    for (const [, overrides] of scenarios) {
      const result = gate(overrides)
      const text = `${result.headline} ${result.reason} ${result.nextStep}`.toLowerCase()
      expect(text).not.toMatch(/\b(buy|sell|long|short|entry|target price)\b/)
    }
  })
})

describe('sweep summary', () => {
  const entry = (symbol, overrides) => ({ symbol, gate: gate(overrides) })

  it('reports the worst verdict rather than an average', () => {
    const summary = summarizeSweep([
      entry('rNVDAUSDT', {}),
      entry('rTSLAUSDT', { reference: closedReference, drift: { currentBps: 300, priorBps: 280, deltaBps: 20, trend: 'widening' } }),
      entry('rAAPLUSDT', { premiumBps: 45, alignmentState: 'caution' }),
    ])
    expect(summary.worst).toBe('WAIT')
    expect(summary.counts).toEqual({ CLEAR: 1, INVESTIGATE: 1, WAIT: 1, BLOCKED: 0 })
    expect(summary.headline).toMatch(/0 blocked · 1 waiting · 1 to investigate · 1 clear/)
    expect(summary.detail).toMatch(/rTSLAUSDT/)
  })

  it('clears a desk only when every instrument is clear', () => {
    const summary = summarizeSweep([entry('rNVDAUSDT', {}), entry('rAAPLUSDT', {})])
    expect(summary.worst).toBe('CLEAR')
    expect(summary.headline).toMatch(/All 2 instruments cleared/)
  })
})

// These run the real pipeline functions the sweep calls, so a change to the
// reference contract breaks the suite instead of silently blocking production.
describe('gate contract with the analysis pipeline', () => {
  const regularNoon = Date.UTC(2026, 8, 18, 16, 0) // 12:00 ET, regular session
  const overnight = Date.UTC(2026, 8, 18, 6, 0) // 02:00 ET, market closed

  const pipeline = (atMs, referencePrice, tokenPrice) => {
    const candles = Array.from({ length: 40 }, (_, i) => ({
      timestamp: atMs - (40 - i) * 5 * 60_000,
      close: tokenPrice,
      turnover: 1_000_000,
    }))
    const reference = pickReference([{ session: 'regular', label: 'Intraday', price: referencePrice, timestampMs: atMs - 60_000 }], atMs)
    const premiumBps = Math.round(((tokenPrice - referencePrice) / referencePrice) * 10_000)
    return {
      reference,
      premiumBps,
      alignmentState: alignmentStateOf(premiumBps),
      move: detectMove(candles),
      drift: driftSeries(candles, reference.chosen?.price ?? null),
      spread: spreadOf({ bid1Price: '212.16', ask1Price: '212.18', bid1Size: '100', ask1Size: '120' }),
      turnover: turnoverAcceleration(candles),
      token: { price: tokenPrice, ageSeconds: 10 },
    }
  }

  it('does not mistake a fresh reference for a missing one', () => {
    const result = evaluateGate(pipeline(regularNoon, 212.17, 212.2))
    expect(result.code).not.toBe('UNVERIFIABLE_REFERENCE')
    expect(result.decision).toBe('CLEAR')
    expect(result.code).toBe('STATE_CONSISTENT')
  })

  it('reads a genuine alignment break from real pipeline output', () => {
    const result = evaluateGate(pipeline(regularNoon, 212.17, 217.0))
    expect(result.decision).toBe('BLOCKED')
    expect(result.code).toBe('ALIGNMENT_BREAK')
  })

  it('treats a stale same-session quote as a closed reference, not as a live one', () => {
    const candles = Array.from({ length: 40 }, (_, i) => ({ timestamp: overnight - (40 - i) * 5 * 60_000, close: 215.5, turnover: 1_000_000 }))
    const reference = pickReference([{ session: 'regular', label: 'Intraday', price: 212.17, timestampMs: overnight - 5 * 3600_000 }], overnight)
    const premiumBps = Math.round(((215.5 - 212.17) / 212.17) * 10_000)
    const result = evaluateGate({
      token: { price: 215.5, ageSeconds: 10 },
      reference,
      premiumBps,
      alignmentState: alignmentStateOf(premiumBps),
      move: detectMove(candles),
      drift: driftSeries(candles, reference.chosen?.price ?? null),
      spread: spreadOf({ bid1Price: '215.49', ask1Price: '215.51' }),
      turnover: turnoverAcceleration(candles),
    })
    expect(reference.stale).toBe(true)
    expect(result.decision).toBe('WAIT')
    expect(result.code).toBe('STALE_REFERENCE_DRIFT')
  })

  // The regression this guards: with an reported-close basis the premium is the
  // overnight gap, so a large number is the normal case and must never be read as
  // a live alignment break.
  it('reads a closed-market gap against an official close as drift, not a break', () => {
    const reference = pickReference([], overnight, { dailyCloses: [{ dateKey: '2026-09-18', close: 212.17 }] })
    const result = evaluateGate({
      token: { price: 222.5, ageSeconds: 10 },
      reference,
      premiumBps: Math.round(((222.5 - 212.17) / 212.17) * 10_000),
      alignmentState: alignmentStateOf(Math.round(((222.5 - 212.17) / 212.17) * 10_000)),
      move: detectMove(Array.from({ length: 40 }, (_, i) => ({ timestamp: overnight - (40 - i) * 5 * 60_000, close: 222.5, turnover: 1_000_000 }))),
      drift: { currentBps: 487, priorBps: 400, deltaBps: 87, trend: 'widening' },
      spread: spreadOf({ bid1Price: '222.49', ask1Price: '222.51' }),
      turnover: turnoverAcceleration(Array.from({ length: 40 }, (_, i) => ({ timestamp: overnight - (40 - i) * 5 * 60_000, close: 222.5, turnover: 1_000_000 }))),
    })
    expect(reference.kind).toBe('reported-close')
    expect(result.code).not.toBe('ALIGNMENT_BREAK')
    expect(result.decision).toBe('WAIT')
    expect(result.code).toBe('CLOSED_MARKET_DRIFT')
    expect(result.referenceKind).toBe('reported-close')
    expect(result.nextStep).toMatch(/stress test/i)
  })

  it('clears a token that sits at the last official close', () => {
    const reference = pickReference([], overnight, { dailyCloses: [{ dateKey: '2026-09-18', close: 212.17 }] })
    const result = evaluateGate({
      token: { price: 212.2, ageSeconds: 10 },
      reference,
      premiumBps: 1,
      alignmentState: alignmentStateOf(1),
      move: { detected: false, reason: 'no move' },
      drift: { currentBps: 1, priorBps: 0, deltaBps: 1, trend: 'stable' },
      spread: spreadOf({ bid1Price: '212.19', ask1Price: '212.21' }),
      turnover: turnoverAcceleration([]),
    })
    expect(result.decision).toBe('CLEAR')
    expect(result.code).toBe('CLOSED_MARKET_ALIGNED')
  })
})
