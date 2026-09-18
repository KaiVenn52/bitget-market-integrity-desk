import { describe, expect, it } from 'vitest'
import { attachUnderlyingOutcomes, buildEpisodes, driftDistribution, etDateKey, matchEpisodes, outcomeOf, outcomeStats, stressTestVerdict } from './study.js'

// Hourly bars on the hour, in UTC. In September the U.S. regular session runs
// 13:30–20:00 UTC, so the regular hourly bars are 14:00–19:00 and everything from
// 20:00 through 13:00 the next day belongs to a closed window.
const bar = (ms, close, high = close, low = close) => ({ timestamp: ms, open: close, high, low, close, turnover: 1_000_000 })
const at = (day, hour) => Date.UTC(2026, 8, day, hour, 0)

/** A weekday session of hourly bars from 14:00 to 19:00 UTC. */
const session = (day, prices) => prices.map((price, index) => bar(at(day, 14 + index), price))

/** Closed-window bars from 20:00 UTC on `day` through 13:00 UTC the next day. */
const closedWindow = (day, prices) => {
  const hours = [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  return prices.map((price, index) => {
    const hour = hours[index]
    const date = hour >= 20 ? day : day + 1
    return bar(at(date, hour), price)
  })
}

describe('episode construction', () => {
  it('anchors a closed window to the last session close and resolves it at the next session', () => {
    const candles = [
      ...session(16, [100, 100, 100, 100, 100, 100]),
      ...closedWindow(16, Array.from({ length: 18 }, (_, i) => (i < 9 ? 100 : 101.8))),
      ...session(17, [101.8, 101.8, 101.8, 101.8, 101.8, 101.8]),
    ]
    const episodes = buildEpisodes(candles)
    expect(episodes).toHaveLength(1)
    const [episode] = episodes
    expect(episode.anchorPrice).toBe(100)
    expect(episode.windowHours).toBe(18)
    expect(episode.peakDriftBps).toBe(180)
    expect(episode.resolution.resolutionBps).toBe(180)
    expect(episode.resolution.directionMatch).toBe(true)
    expect(episode.resolution.errorBps).toBe(0)
  })

  it('treats a weekend as a single closed window', () => {
    const candles = [
      ...session(18, [200, 200, 200, 200, 200, 200]), // Friday
      // Friday 20:00 UTC through Monday 13:00 UTC
      ...[20, 21, 22, 23].map((hour) => bar(at(18, hour), 198)),
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((hour) => bar(at(19, hour), 198)),
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((hour) => bar(at(20, hour), 196)),
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((hour) => bar(at(21, hour), 194)),
      ...session(21, [194, 194, 194, 194, 194, 194]), // Monday
    ]
    const episodes = buildEpisodes(candles)
    expect(episodes).toHaveLength(1)
    expect(episodes[0].windowHours).toBe(66)
    expect(episodes[0].peakDriftBps).toBe(-300)
    expect(episodes[0].resolution.resolutionBps).toBe(-300)
  })

  it('leaves a window unresolved when no following session was retrieved', () => {
    const candles = [
      ...session(16, [100, 100, 100, 100, 100, 100]),
      ...closedWindow(16, Array.from({ length: 18 }, () => 102)),
    ]
    const [episode] = buildEpisodes(candles)
    expect(episode.resolution).toBeNull()
    expect(matchEpisodes([episode], 200)).toEqual([])
  })

  it('ignores candles that begin inside a closed window with no anchor', () => {
    const candles = closedWindow(16, Array.from({ length: 18 }, () => 102))
    expect(buildEpisodes(candles)).toEqual([])
  })

  it('measures excursion in the direction the token had already moved', () => {
    const candles = [
      ...session(16, [100, 100, 100, 100, 100, 100]),
      ...closedWindow(16, Array.from({ length: 18 }, () => 101)),
      // The session runs up to 103 then closes back at 99.
      ...[103, 102, 101, 100, 99, 99].map((price, index) => bar(at(17, 14 + index), price, price + 0.5, price - 0.5)),
    ]
    const [episode] = buildEpisodes(candles)
    expect(episode.peakDriftBps).toBe(100)
    expect(episode.resolution.resolutionBps).toBe(-100)
    expect(episode.resolution.directionMatch).toBe(false)
    expect(episode.resolution.maxFavourableBps).toBe(350)
    expect(episode.resolution.maxAdverseBps).toBe(-150)
  })
})

describe('drift distribution', () => {
  const episodes = [
    { points: [{ driftBps: 0 }, { driftBps: 10 }, { driftBps: -30 }], resolution: { directionMatch: true, errorBps: 10, resolutionBps: 30 }, windowHours: 3, peakDriftBps: -30 },
    { points: [{ driftBps: 100 }, { driftBps: 478 }, { driftBps: 250 }], resolution: { directionMatch: true, errorBps: 20, resolutionBps: 500 }, windowHours: 3, peakDriftBps: 478 },
  ]

  it('summarises every closed-market observation, not just window peaks', () => {
    const distribution = driftDistribution(episodes)
    expect(distribution.observations).toBe(6)
    expect(distribution.medianAbsBps).toBe(65)
    expect(distribution.maxAbsBps).toBe(478)
  })

  it('reports how much of the tape sits beyond the alignment thresholds', () => {
    const distribution = driftDistribution(episodes)
    expect(distribution.aboveThresholdPct).toBe(66.7)
    expect(distribution.above100Pct).toBe(33.3)
    expect(distribution.above200Pct).toBe(33.3)
  })

  it('returns an empty distribution rather than zeroes when nothing was observed', () => {
    const distribution = driftDistribution([])
    expect(distribution.observations).toBe(0)
    expect(distribution.medianAbsBps).toBeNull()
    expect(distribution.aboveThresholdPct).toBeNull()
  })
})

describe('scenario matching', () => {
  const episode = (peakDriftBps, resolutionBps, windowHours = 6) => ({
    anchorMs: at(16, 19),
    windowHours,
    peakDriftBps,
    resolution: { sessionCloseMs: at(17, 19), resolutionBps, directionMatch: Math.sign(peakDriftBps) === Math.sign(resolutionBps), errorBps: Math.abs(peakDriftBps - resolutionBps), maxFavourableBps: resolutionBps + 50, maxAdverseBps: -40 },
  })
  const episodes = [episode(180, 160), episode(478, -478 === 0 ? 0 : 592), episode(-478, -592), episode(20, 5), episode(150, -30)]

  it('prefers same-direction episodes inside the band', () => {
    const matched = matchEpisodes(episodes, 170, { bandBps: 60 })
    expect(matched).toHaveLength(2)
    expect(matched.map((item) => item.peakDriftBps)).toEqual([180, 150])
  })

  it('never matches the opposite direction when same-direction history exists', () => {
    const matched = matchEpisodes(episodes, 170, { bandBps: 60 })
    expect(matched.every((item) => item.peakDriftBps > 0)).toBe(true)
  })

  it('falls back to the whole pool when nothing shares the direction', () => {
    const onlyDown = [episode(-400, -450), episode(-380, -300)]
    const matched = matchEpisodes(onlyDown, 400, { bandBps: 50 })
    expect(matched).toHaveLength(2)
  })

  it('returns nothing rather than a nearest-neighbour guess outside the band', () => {
    expect(matchEpisodes(episodes, 900, { bandBps: 50 })).toEqual([])
  })

  it('excludes windows too short to be a real closed-market episode', () => {
    const short = [episode(200, 200, 1)]
    expect(matchEpisodes(short, 200, { bandBps: 10 })).toEqual([])
  })

  // The table and the statistics read the same field, so they cannot disagree about
  // whether a given episode supported the drift.
  it('classifies each matched episode and names the close the label rests on', () => {
    const withUnderlying = {
      anchorMs: at(16, 19),
      windowHours: 6,
      peakDriftBps: 108,
      points: [{ driftBps: 108 }],
      resolution: { sessionCloseMs: at(17, 19), sessionClosePrice: 100, resolutionBps: 6, directionMatch: true, errorBps: 102, maxFavourableBps: null, maxAdverseBps: null, sessionHours: 6 },
      underlying: { resolutionBps: -140, directionMatch: false, errorBps: 248 },
    }
    const [row] = matchEpisodes([withUnderlying], 108, { bandBps: 10 })
    expect(row.outcome).toBe('contradicted')
    expect(row.usedSource).toBe('underlying')
    expect(row.usedResolutionBps).toBe(-140)
    const [tokenOnly] = matchEpisodes([{ ...withUnderlying, underlying: null }], 108, { bandBps: 10 })
    expect(tokenOnly.outcome).toBe('flat')
    expect(tokenOnly.usedSource).toBe('token')
    expect(tokenOnly.usedResolutionBps).toBe(6)
  })
})

describe('underlying outcome attachment', () => {
  const episode = (anchorMs, sessionCloseMs, peakDriftBps) => ({
    anchorMs,
    windowHours: 6,
    peakDriftBps,
    points: [{ driftBps: peakDriftBps }],
    resolution: { sessionCloseMs, sessionClosePrice: 100, resolutionBps: peakDriftBps, directionMatch: true, errorBps: 0, maxFavourableBps: null, maxAdverseBps: null, sessionHours: 6 },
  })

  it('keys daily closes by the exchange calendar date, not by UTC date', () => {
    // 2026-09-17 00:30 UTC is still 2026-09-16 in New York.
    expect(etDateKey(Date.UTC(2026, 8, 17, 0, 30))).toBe('2026-09-16')
    expect(etDateKey(Date.UTC(2026, 8, 17, 13, 30))).toBe('2026-09-17')
  })

  it('measures the underlying close-to-close move when official closes exist', () => {
    const episodes = [episode(at(16, 19), at(17, 19), 617)]
    const [attached] = attachUnderlyingOutcomes(episodes, [
      { dateKey: '2026-09-16', close: 357.01 },
      { dateKey: '2026-09-17', close: 376.37 },
    ])
    expect(attached.underlying.resolutionBps).toBe(542)
    expect(attached.underlying.directionMatch).toBe(true)
    expect(attached.underlying.errorBps).toBe(75)
  })

  it('leaves the underlying outcome null rather than substituting the token proxy', () => {
    const episodes = [episode(at(16, 19), at(17, 19), 617)]
    const [attached] = attachUnderlyingOutcomes(episodes, [])
    expect(attached.underlying).toBeNull()
    const [missingDay] = attachUnderlyingOutcomes(episodes, [{ dateKey: '2026-09-16', close: 357.01 }])
    expect(missingDay.underlying).toBeNull()
  })

  it('prefers the underlying for statistics and says so, and names the token when it must', () => {
    const episodes = attachUnderlyingOutcomes(
      [episode(at(16, 19), at(17, 19), 617)],
      [{ dateKey: '2026-09-16', close: 357.01 }, { dateKey: '2026-09-17', close: 376.37 }],
    )
    const matched = matchEpisodes(episodes, 617, { bandBps: 10 })
    const withUnderlying = outcomeStats(matched)
    expect(withUnderlying.source).toBe('underlying')
    expect(withUnderlying.medianResolutionBps).toBe(542)
    expect(stressTestVerdict(617, withUnderlying, 10).detail).toMatch(/the underlying closed in the same direction/i)

    const tokenOnly = outcomeStats(matched, { source: 'token' })
    expect(tokenOnly.source).toBe('token')
    expect(tokenOnly.medianResolutionBps).toBe(617)
    expect(stressTestVerdict(617, tokenOnly, 10).detail).toMatch(/rToken itself closed/i)
  })

  it('reports a mixed source honestly instead of claiming underlying coverage', () => {
    const covered = attachUnderlyingOutcomes([episode(at(16, 19), at(17, 19), 600)], [
      { dateKey: '2026-09-16', close: 100 },
      { dateKey: '2026-09-17', close: 106 },
    ])
    const uncovered = episode(at(17, 19), at(18, 19), 600)
    const stats = outcomeStats(matchEpisodes([...covered, uncovered], 600, { bandBps: 10 }))
    expect(stats.source).toBe('mixed')
    expect(stressTestVerdict(600, stats, 10).detail).toMatch(/mixed sources/i)
  })
})

describe('outcome statistics and verdict', () => {
  const matched = [
    { peakDriftBps: 617, resolutionBps: 542, directionMatch: true, errorBps: 75 },
    { peakDriftBps: 451, resolutionBps: 398, directionMatch: true, errorBps: 53 },
    { peakDriftBps: 166, resolutionBps: 52, directionMatch: true, errorBps: 114 },
    { peakDriftBps: 122, resolutionBps: -180, directionMatch: false, errorBps: 302 },
    { peakDriftBps: 108, resolutionBps: 5, directionMatch: true, errorBps: 103 },
  ]

  it('counts confirmations, contradictions and flats without hiding any of them', () => {
    const stats = outcomeStats(matched)
    expect(stats.episodes).toBe(5)
    expect(stats.confirmed).toBe(3)
    expect(stats.contradicted).toBe(1)
    // +5 bps is inside the alignment threshold: technically the same direction, but
    // the move the drift implied never happened, so it is flat rather than support.
    expect(stats.flat).toBe(1)
    expect(stats.materialEpisodes).toBe(4)
    expect(stats.confirmationRate).toBe(75)
    expect(stats.flatRate).toBe(20)
    // Errors are [53, 75, 103, 114, 302], so the middle value is the median.
    expect(stats.medianErrorBps).toBe(103)
  })

  it('classifies a technically-same-direction but immaterial close as flat', () => {
    expect(outcomeOf(5, 108)).toBe('flat')
    expect(outcomeOf(-5, 108)).toBe('flat')
    expect(outcomeOf(108, 108)).toBe('confirmed')
    expect(outcomeOf(-108, 108)).toBe('contradicted')
    expect(outcomeOf(null, 108)).toBe('unknown')
    expect(outcomeOf(108, 0)).toBe('unknown')
  })

  it('does not quote a rate when every episode closed flat', () => {
    const flat = [
      { peakDriftBps: 300, resolutionBps: 4, directionMatch: true, errorBps: 296 },
      { peakDriftBps: -300, resolutionBps: -9, directionMatch: true, errorBps: 291 },
    ]
    const stats = outcomeStats(flat)
    expect(stats.materialEpisodes).toBe(0)
    expect(stats.confirmationRate).toBeNull()
    const verdict = stressTestVerdict(300, stats, 100)
    expect(verdict.tone).toBe('unreliable')
    expect(verdict.headline).toMatch(/closed essentially flat/i)
    expect(verdict.detail).toMatch(/did not carry into the session/i)
  })

  it('reports flat episodes separately instead of folding them into the rate', () => {
    const verdict = stressTestVerdict(180, outcomeStats(matched), 100)
    expect(verdict.detail).toMatch(/further 1 closed essentially flat/i)
    expect(verdict.detail).toMatch(/excluded from the rate/i)
    expect(verdict.headline).toMatch(/3 of 4 materially resolved/i)
  })

  it('reports an empty sample as empty instead of as a clean record', () => {
    const stats = outcomeStats([])
    expect(stats.episodes).toBe(0)
    expect(stats.confirmationRate).toBeNull()
    const verdict = stressTestVerdict(300, stats, 100)
    expect(verdict.headline).toMatch(/No comparable episode/i)
    expect(verdict.detail).toMatch(/does not extrapolate/i)
  })

  it('calls a high confirmation rate consistent but never a forecast', () => {
    const verdict = stressTestVerdict(180, outcomeStats(matched), 100)
    expect(verdict.tone).toBe('consistent')
    expect(verdict.headline).toMatch(/3 of 4 materially resolved/i)
    expect(verdict.detail).toMatch(/historical base rate, not a forecast/i)
  })

  it('calls a coin-flip sample mixed rather than supportive', () => {
    const half = [matched[0], matched[3]]
    expect(stressTestVerdict(180, outcomeStats(half), 100).tone).toBe('mixed')
  })
})
