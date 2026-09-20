// Historical stress test for a token-side drift.
//
// The gate says "the reference cannot confirm this, and the token has moved 478
// bps". That statement is useless to a human unless they can ask the obvious
// follow-up: *has this happened before, and what happened next?* This module
// answers that from the same closed rToken candles the rest of the desk uses.
//
// It retrieves nothing and calls no model. Episodes are built from session
// boundaries, outcomes are measured at the following session, and every number
// can be recomputed from the candle array.

import { MOVE_THRESHOLD_BPS, bpsBetween, etDateKey, sessionOf } from './analysis.js'

export { etDateKey }

const MINUTE = 60 * 1000

/**
 * Classify what the following session actually did.
 *
 * A drift of 108 bps that resolves to +5 bps did technically close in the same
 * direction, but calling that a confirmation would overstate the record: the move
 * the drift implied never happened. A session that closes inside the alignment
 * threshold is therefore reported as flat, not as support.
 */
export const outcomeOf = (resolutionBps, directionBps, thresholdBps = MOVE_THRESHOLD_BPS) => {
  if (!Number.isFinite(resolutionBps)) return 'unknown'
  if (Math.abs(resolutionBps) < thresholdBps) return 'flat'
  if (!Number.isFinite(directionBps) || directionBps === 0) return 'unknown'
  return Math.sign(resolutionBps) === Math.sign(directionBps) ? 'confirmed' : 'contradicted'
}

const percentile = (sorted, p) => {
  if (!sorted.length) return null
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower))
}

/**
 * Group closed-market bars into episodes anchored to the last session close.
 *
 * A closed window is any run of bars the underlying market could not trade
 * (after-hours, overnight, weekend). Its anchor is the final regular-session
 * close before the run, and its resolution is the following regular session.
 */
export function buildEpisodes(candles, options = {}) {
  const rows = (candles ?? [])
    .filter((row) => Number.isFinite(row?.timestamp) && Number.isFinite(row?.close))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((row) => ({ ...row, session: sessionOf(row.timestamp) }))
  const episodes = []
  let index = 0
  while (index < rows.length) {
    if (rows[index].session === 'regular') { index += 1; continue }
    const anchorRow = rows[index - 1]
    if (!anchorRow || anchorRow.session !== 'regular') { index += 1; continue }
    const windowRows = []
    while (index < rows.length && rows[index].session !== 'regular') {
      windowRows.push(rows[index])
      index += 1
    }
    const sessionRows = []
    while (index < rows.length && rows[index].session === 'regular') {
      sessionRows.push(rows[index])
      index += 1
    }
    const anchorPrice = anchorRow.close
    if (!Number.isFinite(anchorPrice) || anchorPrice <= 0 || !windowRows.length) continue
    const points = windowRows.map((row) => ({
      timestamp: row.timestamp,
      close: row.close,
      driftBps: bpsBetween(row.close, anchorPrice),
    })).filter((point) => point.driftBps !== null)
    if (!points.length) continue
    const peak = points.reduce((best, point) => (Math.abs(point.driftBps) > Math.abs(best.driftBps) ? point : best), points[0])
    const lastSessionRow = sessionRows[sessionRows.length - 1]
    const resolutionBps = lastSessionRow ? bpsBetween(lastSessionRow.close, anchorPrice) : null
    // Excursions are measured against the anchor in the direction the token had
    // already moved, which is the direction a trader would have acted on.
    const direction = Math.sign(peak.driftBps)
    const highs = sessionRows.map((row) => row.high).filter(Number.isFinite)
    const lows = sessionRows.map((row) => row.low).filter(Number.isFinite)
    const excursion = (price) => (Number.isFinite(price) ? bpsBetween(price, anchorPrice) : null)
    const favourable = direction >= 0 ? excursion(Math.max(...highs)) : excursion(Math.min(...lows))
    const adverse = direction >= 0 ? excursion(Math.min(...lows)) : excursion(Math.max(...highs))
    episodes.push({
      anchorMs: anchorRow.timestamp,
      anchorPrice,
      windowHours: points.length,
      points,
      peakDriftBps: peak.driftBps,
      peakMs: peak.timestamp,
      lastDriftBps: points[points.length - 1].driftBps,
      resolution: sessionRows.length && resolutionBps !== null
        ? {
          sessionCloseMs: lastSessionRow.timestamp,
          sessionClosePrice: lastSessionRow.close,
          resolutionBps,
          directionMatch: direction !== 0 && Math.sign(resolutionBps) === direction,
          errorBps: Math.abs(peak.driftBps - resolutionBps),
          maxFavourableBps: favourable,
          maxAdverseBps: adverse,
          sessionHours: sessionRows.length,
        }
        : null,
    })
  }
  return episodes
}

/**
 * Attach what the *underlying* did, when daily closes for it are available.
 *
 * The token's own session close is a proxy for the underlying, and a proxy is
 * weaker evidence than the thing itself. When reported underlying closes are retrieved the
 * desk reports both and says which one a conclusion rests on; when they are not,
 * the episode keeps a null underlying outcome rather than substituting the proxy
 * silently.
 */
export function attachUnderlyingOutcomes(episodes, dailyCloses) {
  const byDate = new Map((dailyCloses ?? []).filter((row) => Number.isFinite(row?.close)).map((row) => [row.dateKey, row.close]))
  return episodes.map((episode) => {
    if (!episode.resolution || !byDate.size) return { ...episode, underlying: null }
    const anchorClose = byDate.get(etDateKey(episode.anchorMs))
    const sessionClose = byDate.get(etDateKey(episode.resolution.sessionCloseMs))
    if (!Number.isFinite(anchorClose) || !Number.isFinite(sessionClose)) return { ...episode, underlying: null }
    const resolutionBps = bpsBetween(sessionClose, anchorClose)
    const direction = Math.sign(episode.peakDriftBps)
    return {
      ...episode,
      underlying: {
        anchorDateKey: etDateKey(episode.anchorMs),
        sessionDateKey: etDateKey(episode.resolution.sessionCloseMs),
        resolutionBps,
        directionMatch: direction !== 0 && Math.sign(resolutionBps) === direction,
        errorBps: Math.abs(episode.peakDriftBps - resolutionBps),
      },
    }
  })
}

/** Distribution of every closed-market observation, not just the peak of each window. */
export function driftDistribution(episodes, options = {}) {
  const threshold = options.thresholdBps ?? 20
  const points = episodes.flatMap((episode) => episode.points.map((point) => point.driftBps))
  if (!points.length) {
    return { observations: 0, medianAbsBps: null, p75AbsBps: null, p90AbsBps: null, p95AbsBps: null, maxAbsBps: null, aboveThresholdPct: null, above100Pct: null, above200Pct: null }
  }
  const abs = points.map(Math.abs).sort((a, b) => a - b)
  const share = (limit) => Math.round((abs.filter((value) => value > limit).length / abs.length) * 1000) / 10
  return {
    observations: points.length,
    medianAbsBps: percentile(abs, 0.5),
    p75AbsBps: percentile(abs, 0.75),
    p90AbsBps: percentile(abs, 0.9),
    p95AbsBps: percentile(abs, 0.95),
    maxAbsBps: abs[abs.length - 1],
    aboveThresholdPct: share(threshold),
    above100Pct: share(100),
    above200Pct: share(200),
  }
}

/**
 * The observed point in a closed window that looks most like the drift being asked
 * about.
 *
 * Matching on the window's peak would use information that did not exist at the time:
 * nobody watching an overnight window knows it will peak at 44 bps until it already
 * has. Every point here was observable in real time, and the outcome is identical for
 * all of them — the following session's close measured against the same anchor — so
 * choosing the closest point selects *when* the window looked like today without
 * biasing what followed it.
 */
export function matchedPointOf(episode, targetDriftBps) {
  const points = (episode?.points ?? []).filter((point) => Number.isFinite(point?.driftBps))
  if (!points.length) return null
  const targetSign = Math.sign(targetDriftBps)
  const sameDirection = points.filter((point) => Math.sign(point.driftBps) === targetSign)
  // A +40 bps window is not a precedent for a -40 bps drift, even if their
  // absolute magnitudes coincide. An empty same-direction pool is no match.
  if (!sameDirection.length) return null
  const distanceFrom = (point) => Math.abs(Math.abs(point.driftBps) - Math.abs(targetDriftBps))
  return sameDirection.reduce((best, point) => (distanceFrom(point) < distanceFrom(best) ? point : best), sameDirection[0])
}

/**
 * Find the closed-market windows that looked like the drift being asked about. This is
 * the "historically similar scenarios" step: the caller supplies today's drift, the
 * desk supplies what followed the last times it looked like this.
 *
 * Two corrections make the comparison honest. The example episode is excluded from its
 * own pool, because an episode that matches itself at zero distance inflates every
 * count it appears in. And the matching key is the drift observed inside the window,
 * not the window's peak, so the sample contains only scenarios a trader could have
 * recognised while they were happening.
 */
export function matchEpisodes(episodes, targetDriftBps, options = {}) {
  const band = options.bandBps ?? 100
  const limit = options.limit ?? 6
  const minWindowHours = options.minWindowHours ?? 2
  const excludeAnchorMs = options.excludeAnchorMs ?? null
  if (!Number.isFinite(targetDriftBps)) return []
  return (episodes ?? [])
    .filter((episode) => episode.resolution && episode.windowHours >= minWindowHours)
    .filter((episode) => excludeAnchorMs === null || episode.anchorMs !== excludeAnchorMs)
    .map((episode) => ({ episode, point: matchedPointOf(episode, targetDriftBps) }))
    .filter((candidate) => candidate.point)
    .map((candidate) => ({ ...candidate, distance: Math.abs(Math.abs(candidate.point.driftBps) - Math.abs(targetDriftBps)) }))
    .filter((candidate) => candidate.distance <= band)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ episode, point }) => {
      // The underlying close is the better measure whenever it was retrieved, and the
      // outcome is classified here so the table and the statistics can never disagree
      // about what a given episode did.
      const useUnderlying = Number.isFinite(episode.underlying?.resolutionBps)
      const usedResolutionBps = useUnderlying ? episode.underlying.resolutionBps : episode.resolution.resolutionBps
      const matchedDriftBps = point.driftBps
      const direction = Math.sign(matchedDriftBps)
      return {
        anchorMs: episode.anchorMs,
        windowHours: episode.windowHours,
        // The point-in-time basis: the drift actually observed at this stage of the
        // window, which is what a trader would have been reacting to.
        matchedDriftBps,
        matchedStageHours: Math.round(((point.timestamp - episode.anchorMs) / 3_600_000) * 10) / 10,
        peakDriftBps: episode.peakDriftBps,
        sessionCloseMs: episode.resolution.sessionCloseMs,
        resolutionBps: episode.resolution.resolutionBps,
        directionMatch: direction !== 0 && Math.sign(episode.resolution.resolutionBps) === direction,
        errorBps: Math.abs(matchedDriftBps - episode.resolution.resolutionBps),
        maxFavourableBps: episode.resolution.maxFavourableBps,
        maxAdverseBps: episode.resolution.maxAdverseBps,
        underlyingResolutionBps: episode.underlying?.resolutionBps ?? null,
        underlyingDirectionMatch: Number.isFinite(episode.underlying?.resolutionBps) && direction !== 0 && Math.sign(episode.underlying.resolutionBps) === direction,
        underlyingErrorBps: Number.isFinite(episode.underlying?.resolutionBps) ? Math.abs(matchedDriftBps - episode.underlying.resolutionBps) : null,
        outcome: outcomeOf(usedResolutionBps, matchedDriftBps),
        usedResolutionBps,
        usedSource: useUnderlying ? 'underlying' : 'token',
      }
    })
}

/**
 * Summarise a matched set into the sentence a trader actually needs: how often
 * the drift was confirmed, how often it was wrong, and by how much.
 *
 * `source` selects which resolution is summarised. The underlying is preferred
 * when it was retrieved, because the token is only a proxy for it.
 */
export function outcomeStats(matched, options = {}) {
  const preferUnderlying = options.source !== 'token'
  const rows = matched
    .map((item) => {
      const useUnderlying = preferUnderlying && Number.isFinite(item.underlyingResolutionBps)
      const usedResolutionBps = useUnderlying ? item.underlyingResolutionBps : item.resolutionBps
      return {
        ...item,
        usedSource: useUnderlying ? 'underlying' : 'token',
        usedResolutionBps,
        usedDirectionMatch: useUnderlying ? item.underlyingDirectionMatch : item.directionMatch,
        usedErrorBps: useUnderlying ? item.underlyingErrorBps : item.errorBps,
        outcome: outcomeOf(usedResolutionBps, item.matchedDriftBps),
      }
    })
    .filter((item) => Number.isFinite(item.usedResolutionBps))
  if (!rows.length) {
    return { episodes: 0, confirmed: 0, contradicted: 0, flat: 0, materialEpisodes: 0, confirmationRate: null, flatRate: null, medianErrorBps: null, medianResolutionBps: null, worstErrorBps: null, direction: null, source: null }
  }
  const errors = rows.map((item) => item.usedErrorBps).sort((a, b) => a - b)
  const resolutions = rows.map((item) => item.usedResolutionBps).sort((a, b) => a - b)
  const confirmed = rows.filter((item) => item.outcome === 'confirmed').length
  const contradicted = rows.filter((item) => item.outcome === 'contradicted').length
  const flat = rows.filter((item) => item.outcome === 'flat').length
  const materialEpisodes = confirmed + contradicted
  const source = rows.every((item) => item.usedSource === 'underlying') ? 'underlying' : rows.every((item) => item.usedSource === 'token') ? 'token' : 'mixed'
  return {
    episodes: rows.length,
    confirmed,
    contradicted,
    flat,
    materialEpisodes,
    // The rate is quoted over episodes that actually resolved, because counting a
    // flat close as support would inflate it and counting it as a failure would
    // understate it. Flats are reported separately instead of being folded in.
    confirmationRate: materialEpisodes ? Math.round((confirmed / materialEpisodes) * 100) : null,
    flatRate: Math.round((flat / rows.length) * 100),
    medianErrorBps: percentile(errors, 0.5),
    medianResolutionBps: percentile(resolutions, 0.5),
    worstErrorBps: errors[errors.length - 1],
    direction: rows[0].matchedDriftBps >= 0 ? 'up' : 'down',
    source,
    rows,
  }
}

/** The single sentence the UI shows above the table, phrased without prediction. */
export function stressTestVerdict(targetDriftBps, stats, band) {
  if (!stats.episodes) {
    return {
      headline: 'No comparable episode in the retrieved window',
      detail: `No same-direction closed-market episode within ${band} bps of ${targetDriftBps} bps had a measurable following session. Opposite-direction windows are not substitutes; the desk does not extrapolate from an empty sample.`,
    }
  }
  const flatNote = stats.flat
    ? ` A further ${stats.flat} closed essentially flat, inside the ${MOVE_THRESHOLD_BPS} bps threshold, so they neither confirm nor contradict the drift and are excluded from the rate.`
    : ''
  if (!stats.materialEpisodes) {
    return {
      headline: `All ${stats.episodes} comparable episodes closed essentially flat`,
      detail: `Across ${stats.episodes} earlier same-direction closed-market windows within ${band} bps of the current ${targetDriftBps} bps, every following session closed inside the ${MOVE_THRESHOLD_BPS} bps threshold. The drift did not carry into the session in this sample, and there is no material outcome to quote a rate from.`,
      tone: 'unreliable',
    }
  }
  const rate = stats.confirmationRate
  const tone = rate >= 75 ? 'consistent' : rate >= 50 ? 'mixed' : 'unreliable'
  const measured = stats.source === 'underlying'
    ? 'the underlying closed in the same direction'
    : stats.source === 'mixed'
      ? 'the following session closed in the same direction (mixed sources: underlying closes where retrieved, the rToken itself otherwise)'
      : 'the rToken itself closed in the same direction (Yahoo-reported underlying closes were not retrieved)'
  return {
    headline: `${stats.confirmed} of ${stats.materialEpisodes} materially resolved episodes moved the same way as the drift`,
    detail: `Across ${stats.episodes} earlier same-direction closed-market windows that were within ${band} bps of the current ${targetDriftBps} bps at some point while the market was shut, ${measured} ${stats.confirmed} times out of the ${stats.materialEpisodes} that resolved materially (${rate}%), and moved against it ${stats.contradicted} times.${flatNote} Median error between the observed drift and the eventual close is ${stats.medianErrorBps} bps. This is a historical base rate, not a forecast: the sample is small and the desk states the outcome rather than a probability of profit.`,
    tone,
  }
}
