// Historical stress test endpoint.
//
// Answers the question the gate raises but cannot answer: when the token drifted
// like this before, what happened next? It retrieves closed hourly rToken candles
// and, when reachable, the underlying's Yahoo-reported daily closes, then hands both to
// the deterministic study module.
//
// The response is a historical base rate with its sample size attached. It is not
// a forecast, and the endpoint never returns a trade recommendation.

import { MOVE_THRESHOLD_BPS, sessionLabel, sessionOf } from './_lib/analysis.js'
import { attempt, fetchCandles, fetchDailyCloses, INSTRUMENTS, toCandle } from './_lib/sources.js'
import { attachUnderlyingOutcomes, buildEpisodes, driftDistribution, matchEpisodes, outcomeStats, stressTestVerdict } from './_lib/study.js'

export const config = { maxDuration: 30 }

// 500 hourly candles is roughly three weeks, which is enough to contain several
// closed-market episodes without pretending to be a long history.
const CANDLE_LIMIT = 500
const SOURCE_TIMEOUT_MS = 12_000
const DEFAULT_BAND_BPS = 100
const DEFAULT_MIN_WINDOW_HOURS = 2

/** Drift of the most recent closed candle against the last session close before it. */
function currentState(candles) {
  const last = candles[candles.length - 1]
  if (!last) return null
  const session = sessionOf(last.timestamp)
  let anchor = null
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    if (sessionOf(candles[index].timestamp) === 'regular') { anchor = candles[index]; break }
  }
  const anchorPrice = anchor && anchor.timestamp <= last.timestamp ? anchor.close : null
  const driftBps = Number.isFinite(anchorPrice) && anchorPrice > 0 ? Math.round(((last.close - anchorPrice) / anchorPrice) * 10_000) : null
  return {
    lastCandleMs: last.timestamp,
    lastClose: last.close,
    session,
    sessionLabel: sessionLabel(session),
    underlyingTradable: session === 'regular',
    anchorMs: anchor?.timestamp ?? null,
    anchorPrice,
    driftBps,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const symbol = String((req.query?.symbol ?? req.body?.symbol) || 'rTSLAUSDT')
  const meta = INSTRUMENTS.get(symbol)
  if (!meta) return res.status(400).json({ error: 'Unsupported symbol', supported: [...INSTRUMENTS.keys()] })

  const bandBps = Math.max(10, Math.min(1000, Number(req.query?.bandBps) || DEFAULT_BAND_BPS))
  const minWindowHours = Math.max(1, Number(req.query?.minWindowHours) || DEFAULT_MIN_WINDOW_HOURS)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS)

  try {
    const [candleResult, daily] = await Promise.all([
      attempt(() => fetchCandles(symbol, '1H', CANDLE_LIMIT, controller.signal), { data: [] }),
      fetchDailyCloses(meta.ticker),
    ])

    const candles = (candleResult.data ?? [])
      .map(toCandle)
      .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.close))
      .sort((a, b) => a.timestamp - b.timestamp)

    if (candles.length < 48) {
      return res.status(200).json({
        symbol,
        generatedAt: new Date().toISOString(),
        available: false,
        reason: `Only ${candles.length} closed hourly candles were retrieved; a stress test needs at least 48 to contain a closed-market episode.`,
        sourceErrors: [candleResult.error].filter(Boolean),
      })
    }

    const episodes = attachUnderlyingOutcomes(buildEpisodes(candles), daily.closes)
    const distribution = driftDistribution(episodes)
    const current = currentState(candles)

    // A stress test only means something for a material token-side drift. Inside a
    // live session the gap against the last close is near zero by construction, so
    // matching that number would dress up a meaningless comparison as evidence.
    // When the market is open the endpoint tests the most recent closed-market
    // episode instead, and says that is what it did.
    const requested = Number(req.query?.driftBps)
    const resolved = episodes.filter((episode) => episode.resolution)
    const latestEpisode = resolved[resolved.length - 1] ?? null
    let targetDriftBps = null
    let targetSource = 'none'
    if (Number.isFinite(requested)) {
      targetDriftBps = Math.round(requested)
      targetSource = 'requested'
    } else if (current && !current.underlyingTradable && current.driftBps !== null) {
      targetDriftBps = current.driftBps
      targetSource = 'live closed-market drift'
    } else if (latestEpisode) {
      targetDriftBps = latestEpisode.peakDriftBps
      targetSource = 'most recent closed-market episode'
    }

    const material = Number.isFinite(targetDriftBps) && Math.abs(targetDriftBps) >= MOVE_THRESHOLD_BPS
    // When the example is itself a past episode, it must not also be counted as its own
    // precedent: matching an episode against a pool containing itself adds a guaranteed
    // zero-distance "same direction" row and inflates every count.
    const excludeAnchorMs = targetSource === 'most recent closed-market episode' ? latestEpisode.anchorMs : null
    const matched = material ? matchEpisodes(episodes, targetDriftBps, { bandBps, minWindowHours, excludeAnchorMs }) : []
    const stats = outcomeStats(matched)
    const verdict = !material
      ? {
        headline: 'No material drift to stress test',
        detail: Number.isFinite(targetDriftBps)
          ? `The drift being tested is ${targetDriftBps} bps, inside the ${MOVE_THRESHOLD_BPS} bps alignment threshold, so the desk does not treat it as an event and does not compare it to history. Run the test against a closed-market drift of at least ${MOVE_THRESHOLD_BPS} bps.`
          : 'The retrieved candles did not produce a drift against a session close, so no historical comparison was made.',
        tone: 'unknown',
      }
      : stressTestVerdict(targetDriftBps, stats, bandBps)
    const targetContext = targetSource === 'live closed-market drift'
      ? `The underlying market is closed and the token is ${targetDriftBps} bps from its last session close.`
      : targetSource === 'most recent closed-market episode'
        ? `The underlying market is open, so there is no live token-side drift to test. The comparison below uses the most recent closed-market episode (${new Date(latestEpisode.anchorMs).toISOString().slice(0, 10)}, peak ${latestEpisode.peakDriftBps} bps) as the example, and that episode is excluded from the sample it is compared against.`
        : targetSource === 'requested'
          ? `The drift being tested was supplied by the caller (${targetDriftBps} bps).`
          : 'No drift was available to test.'

    const withUnderlying = episodes.filter((episode) => episode.underlying).length
    const evidence = [
      { id: 'candles', title: 'Closed hourly rToken candles', summary: `${candles.length} hourly candles from ${new Date(candles[0].timestamp).toISOString()} to ${new Date(candles[candles.length - 1].timestamp).toISOString()}.`, state: 'pass', source: 'Bitget UTA public market data', endpoint: `/api/v3/market/candles?interval=1H&limit=${CANDLE_LIMIT}`, retrievedAt: new Date().toISOString() },
      { id: 'episodes', title: 'Closed-market episodes', summary: `${episodes.length} closed-market windows were built, ${episodes.filter((episode) => episode.resolution).length} of them with a measurable following session.`, state: 'pass', source: 'Derived from session boundaries (America/New_York)', endpoint: 'Derived', retrievedAt: new Date().toISOString() },
      { id: 'distribution', title: 'Drift distribution', summary: `${distribution.observations} closed-market observations; median ${distribution.medianAbsBps} bps, 90th percentile ${distribution.p90AbsBps} bps, maximum ${distribution.maxAbsBps} bps; ${distribution.aboveThresholdPct}% beyond the 20 bps alignment threshold.`, state: 'pass', source: 'Deterministic computation over candles', endpoint: 'Derived', retrievedAt: new Date().toISOString() },
      { id: 'matched', title: 'Matched historical episodes', summary: `${matched.length} earlier same-direction episodes were within ${bandBps} bps of the ${targetDriftBps} bps being tested at a point that was observable while the market was shut${excludeAnchorMs ? '; the example episode is excluded from this sample' : ''}.`, state: matched.length ? 'pass' : 'unknown', source: 'Deterministic point-in-time episode matching', endpoint: 'Derived', retrievedAt: new Date().toISOString() },
      { id: 'underlying-closes', title: 'Yahoo-reported underlying daily closes', summary: daily.note, state: daily.closes.length ? 'pass' : 'unknown', source: 'Yahoo Finance chart API', endpoint: '/v8/finance/chart?interval=1d', retrievedAt: new Date().toISOString() },
      { id: 'session', title: 'Session context', summary: current ? `The latest candle belongs to the ${current.sessionLabel}; the underlying ${current.underlyingTradable ? 'can' : 'cannot'} currently reprice.` : 'Session context unavailable.', state: 'pass', source: 'US equity session calendar (America/New_York)', endpoint: 'Derived', retrievedAt: new Date().toISOString() },
    ]

    return res.status(200).json({
      symbol,
      company: meta.company,
      generatedAt: new Date().toISOString(),
      available: true,
      mode: 'live',
      reasoningMode: 'rules',
      lookback: { candles: candles.length, from: new Date(candles[0].timestamp).toISOString(), to: new Date(candles[candles.length - 1].timestamp).toISOString() },
      target: { driftBps: targetDriftBps, bandBps, minWindowHours, source: targetSource, material, context: targetContext },
      current,
      distribution,
      stats: (({ rows, ...rest }) => rest)(stats),
      verdict,
      matched,
      episodes: episodes.map((episode) => ({
        anchorMs: episode.anchorMs,
        anchorPrice: episode.anchorPrice,
        windowHours: episode.windowHours,
        peakDriftBps: episode.peakDriftBps,
        resolutionBps: episode.resolution?.resolutionBps ?? null,
        directionMatch: episode.resolution?.directionMatch ?? null,
        underlyingResolutionBps: episode.underlying?.resolutionBps ?? null,
        underlyingDirectionMatch: episode.underlying?.directionMatch ?? null,
      })),
      coverage: { episodes: episodes.length, resolved: episodes.filter((episode) => episode.resolution).length, withUnderlying },
      evidence,
      sourceErrors: [candleResult.error, daily.closes.length ? null : daily.note].filter(Boolean),
    })
  } catch (error) {
    return res.status(503).json({ error: 'Stress test unavailable', detail: String(error instanceof Error ? error.message : error).slice(0, 200) })
  } finally {
    clearTimeout(timer)
  }
}
