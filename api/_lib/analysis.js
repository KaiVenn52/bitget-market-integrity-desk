// Deterministic move-explanation logic for Market Integrity Desk.
//
// Trust boundary: this module performs no I/O and calls no model. Every number,
// rank and verdict below is reproducible from the records the server retrieved.
// The language model narrates these results; it never produces them.

const BPS = 10000
const MINUTE = 60 * 1000

// A repricing smaller than this is not treated as an event worth explaining.
export const MOVE_THRESHOLD_BPS = 30
// A headline published inside this window before the move started is a candidate.
export const CATALYST_WINDOW_MS = 45 * MINUTE
// A headline published this long after the move started cannot explain its start.
export const REINFORCEMENT_WINDOW_MS = 15 * MINUTE

const WEEKEND = new Set(['Sat', 'Sun'])

export function etParts(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(ms))
  const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
  const hour = Number(get('hour')) % 24
  const minute = Number(get('minute'))
  const weekday = get('weekday')
  return { weekday, hour, minute, minutes: hour * 60 + minute, weekend: WEEKEND.has(weekday) }
}

/**
 * Which U.S. equity session a UTC instant falls into. A closed underlying is not
 * a broken feed, so it gets its own label instead of being treated as stale data.
 */
export function sessionOf(ms) {
  const { minutes, weekend } = etParts(ms)
  if (weekend) return 'overnight'
  if (minutes >= 570 && minutes < 960) return 'regular'
  if (minutes >= 240 && minutes < 570) return 'premarket'
  if (minutes >= 960 && minutes < 1200) return 'afterhours'
  return 'overnight'
}

export function sessionLabel(session) {
  return {
    regular: 'Regular session',
    premarket: 'Pre-market',
    afterhours: 'After-hours',
    overnight: 'Overnight / closed',
  }[session] ?? 'Unknown session'
}

export const isReferenceLive = (session) => session === 'regular'

/**
 * Choose the reference price a trader should actually compare against.
 * Preference order: a quote from the session we are in, then the freshest quote
 * available. The returned `stale` flag drives the drift-versus-basis wording.
 */
export function pickReference(candidates, nowMs) {
  const usable = (candidates ?? [])
    .filter((item) => item && Number.isFinite(item.price) && Number.isFinite(item.timestampMs))
    .map((item) => ({ ...item, ageSeconds: Math.max(0, Math.round((nowMs - item.timestampMs) / 1000)), session: item.session ?? sessionOf(item.timestampMs) }))
  if (!usable.length) return { chosen: null, candidates: [], stale: true, note: 'No reference quote was retrieved; alignment is not calculated.' }
  const current = sessionOf(nowMs)
  const sameSession = usable.filter((item) => item.session === current).sort((a, b) => a.ageSeconds - b.ageSeconds)
  const chosen = sameSession[0] ?? [...usable].sort((a, b) => a.ageSeconds - b.ageSeconds)[0]
  // The underlying can only reprice while an equity session is open. Outside one,
  // a gap is token-side drift; inside one, a gap from an earlier session is an
  // outdated reference. Both cases must be labelled, neither may be called a basis.
  const underlyingTradable = current !== 'overnight'
  const stale = !underlyingTradable || chosen.session !== current
  const note = !underlyingTradable
    ? `The underlying market is closed (${sessionLabel(current)}), so any gap is token-side drift rather than a tradable basis.`
    : chosen.session !== current
      ? `The freshest reference comes from the ${sessionLabel(chosen.session)} window, not the current ${sessionLabel(current)} window.`
      : `Reference belongs to the current ${sessionLabel(current)} window.`
  return {
    chosen,
    candidates: usable.sort((a, b) => a.ageSeconds - b.ageSeconds),
    stale,
    underlyingTradable,
    currentSession: current,
    note,
  }
}

export function spreadOf(ticker) {
  const bid = Number(ticker?.bid1Price)
  const ask = Number(ticker?.ask1Price)
  const bidSize = Number(ticker?.bid1Size)
  const askSize = Number(ticker?.ask1Size)
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
    return { spreadBps: null, bid: null, ask: null, bidSize: null, askSize: null, state: 'unknown', note: 'Top-of-book was not published in the retrieved ticker.' }
  }
  const mid = (bid + ask) / 2
  const spreadBps = Math.round(((ask - bid) / mid) * BPS)
  const state = spreadBps <= 10 ? 'pass' : spreadBps <= 40 ? 'caution' : 'fail'
  return { spreadBps, bid, ask, bidSize: Number.isFinite(bidSize) ? bidSize : null, askSize: Number.isFinite(askSize) ? askSize : null, state, note: `Top-of-book spread is ${spreadBps} bps.` }
}

export const bpsBetween = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? Math.round(((a - b) / b) * BPS) : null)

/**
 * Find the repricing worth explaining, and when it began.
 * Returns detected:false when the market simply did not move enough.
 */
export function detectMove(candles, options = {}) {
  const threshold = options.thresholdBps ?? MOVE_THRESHOLD_BPS
  const rows = (candles ?? []).filter((row) => Number.isFinite(row?.close) && Number.isFinite(row?.timestamp)).sort((a, b) => a.timestamp - b.timestamp)
  if (rows.length < 3) return { detected: false, reason: 'Not enough closed rToken candles were available to measure a move.', candlesUsed: rows.length }

  const last = rows[rows.length - 1]
  const windows = [1, 3, 12] // 5m, 15m, 60m on a five-minute series
  let best = null
  for (const span of windows) {
    const from = rows[rows.length - 1 - span]
    if (!from) continue
    const moveBps = bpsBetween(last.close, from.close)
    if (moveBps === null) continue
    if (!best || Math.abs(moveBps) > Math.abs(best.moveBps)) best = { span, moveBps, from }
  }
  if (!best || Math.abs(best.moveBps) < threshold) {
    return { detected: false, reason: `Largest repricing across 5/15/60 minutes was ${best ? Math.abs(best.moveBps) : 0} bps, below the ${threshold} bps event threshold.`, candlesUsed: rows.length, largestMoveBps: best?.moveBps ?? null }
  }

  // Walk back from the extreme to the first bar that carried 20% of the total move.
  const direction = Math.sign(best.moveBps)
  const startClose = best.from.close
  const totalBps = Math.abs(best.moveBps)
  let startIndex = rows.indexOf(best.from)
  for (let i = startIndex + 1; i <= rows.length - 1; i += 1) {
    const stepBps = Math.abs(bpsBetween(rows[i].close, startClose) ?? 0)
    if (stepBps >= totalBps * 0.2) { startIndex = i; break }
  }
  const startRow = rows[startIndex]
  const sustainedBps = bpsBetween(last.close, startRow.close) ?? best.moveBps
  const sustained = Math.sign(sustainedBps) === direction && Math.abs(sustainedBps) >= totalBps * 0.5
  return {
    detected: true,
    direction: direction > 0 ? 'up' : 'down',
    moveBps: best.moveBps,
    windowMinutes: best.span * 5,
    startMs: startRow.timestamp,
    startPrice: startRow.close,
    lastPrice: last.close,
    lastMs: last.timestamp,
    sustained,
    sustainedBps,
    candlesUsed: rows.length,
    reason: `${direction > 0 ? 'Up' : 'Down'} ${Math.abs(best.moveBps)} bps over ${best.span * 5} minutes, beginning ${new Date(startRow.timestamp).toISOString().slice(11, 16)} UTC.`,
  }
}

/**
 * Drift of the token against the chosen reference, now versus 15 minutes ago.
 * When the underlying is closed this is drift, not a tradable basis — the label
 * says which one it is so the UI cannot imply a live spread that does not exist.
 */
export function driftSeries(candles, referencePrice, options = {}) {
  const rows = (candles ?? []).filter((row) => Number.isFinite(row?.close) && Number.isFinite(row?.timestamp)).sort((a, b) => a.timestamp - b.timestamp)
  if (!Number.isFinite(referencePrice) || rows.length === 0) return { currentBps: null, priorBps: null, deltaBps: null, trend: 'unknown', series: [], note: 'No reference price was available, so no drift series was computed.' }
  const series = rows.map((row) => ({ timestamp: row.timestamp, bps: bpsBetween(row.close, referencePrice) })).filter((point) => point.bps !== null)
  if (!series.length) return { currentBps: null, priorBps: null, deltaBps: null, trend: 'unknown', series: [], note: 'No reference price was available, so no drift series was computed.' }
  const current = series[series.length - 1]
  const targetMs = current.timestamp - (options.lookbackMinutes ?? 15) * MINUTE
  const prior = [...series].reverse().find((point) => point.timestamp <= targetMs) ?? series[0]
  const deltaBps = current.bps - prior.bps
  const trend = Math.abs(deltaBps) <= 5 ? 'stable' : deltaBps > 0 ? 'widening' : 'converging'
  return {
    currentBps: current.bps,
    priorBps: prior.bps,
    deltaBps,
    trend,
    lookbackMinutes: options.lookbackMinutes ?? 15,
    series,
    note: trend === 'stable'
      ? 'Drift is unchanged over the lookback window.'
      : `Drift ${trend === 'widening' ? 'widened' : 'converged'} ${Math.abs(deltaBps)} bps over ${options.lookbackMinutes ?? 15} minutes.`,
  }
}

/** Turnover in the recent window against the trailing baseline. */
export function turnoverAcceleration(candles, options = {}) {
  const recentBars = options.recentBars ?? 3
  const baselineBars = options.baselineBars ?? 12
  const rows = (candles ?? []).filter((row) => Number.isFinite(row?.turnover)).sort((a, b) => a.timestamp - b.timestamp)
  if (rows.length < recentBars + baselineBars) return { ratio: null, recentTurnover: null, baselineTurnover: null, state: 'unknown', note: 'Not enough closed candles to compare turnover.' }
  const recent = rows.slice(-recentBars).reduce((sum, row) => sum + row.turnover, 0)
  const baselineSlice = rows.slice(-(recentBars + baselineBars), -recentBars)
  const baseline = baselineSlice.reduce((sum, row) => sum + row.turnover, 0) / (baselineSlice.length / recentBars)
  if (!Number.isFinite(baseline) || baseline <= 0) return { ratio: null, recentTurnover: recent, baselineTurnover: baseline, state: 'unknown', note: 'Baseline turnover was not positive, so acceleration was not computed.' }
  const ratio = Number((recent / baseline).toFixed(2))
  const state = ratio >= 1.5 ? 'pass' : ratio >= 0.8 ? 'caution' : 'fail'
  return { ratio, recentTurnover: recent, baselineTurnover: baseline, state, note: `Turnover over the last ${recentBars * 5} minutes is ${ratio}× the trailing baseline.` }
}

/**
 * Classify one headline against the moment the move began. The output is a
 * timing verdict, never a causal claim: a headline can be consistent with the
 * move without being shown to have caused it.
 */
export function classifyHeadline(headline, moveStartMs, options = {}) {
  const publishedMs = Number.isFinite(headline?.publishedMs) ? headline.publishedMs : null
  if (!Number.isFinite(moveStartMs)) {
    return { ...headline, timing: 'NO_MOVE_BOUNDARY', deltaMinutes: null, reason: 'No detected move boundary to compare against.' }
  }
  if (publishedMs === null) {
    return { ...headline, timing: 'TIME_UNKNOWN', deltaMinutes: null, reason: 'Publication time was not machine-readable.' }
  }
  const deltaMinutes = Math.round((moveStartMs - publishedMs) / MINUTE)
  const windowMinutes = Math.round((options.catalystWindowMs ?? CATALYST_WINDOW_MS) / MINUTE)
  const lateMinutes = Math.round((options.reinforcementWindowMs ?? REINFORCEMENT_WINDOW_MS) / MINUTE)
  if (deltaMinutes >= 0 && deltaMinutes <= windowMinutes) {
    return { ...headline, timing: 'POSSIBLE', deltaMinutes, reason: `Published ${deltaMinutes}m before the move began.` }
  }
  if (deltaMinutes < 0 && Math.abs(deltaMinutes) <= lateMinutes) {
    return { ...headline, timing: 'POSSIBLE_CONTRIBUTING', deltaMinutes, reason: `Published ${Math.abs(deltaMinutes)}m after the move began; it can reinforce but cannot explain the start.` }
  }
  if (deltaMinutes < 0) {
    return { ...headline, timing: 'TIMING_INCONSISTENT', deltaMinutes, reason: `Published ${Math.abs(deltaMinutes)}m after the move began — too late to be the initial cause.` }
  }
  return { ...headline, timing: 'DISTANT', deltaMinutes, reason: `Published ${deltaMinutes}m before the move began, outside the ${windowMinutes}m catalyst window.` }
}

export function rankHeadlines(headlines, moveStartMs, options = {}) {
  const order = { POSSIBLE: 0, POSSIBLE_CONTRIBUTING: 1, TIME_UNKNOWN: 2, DISTANT: 3, TIMING_INCONSISTENT: 4, NO_MOVE_BOUNDARY: 5 }
  return (headlines ?? [])
    .map((headline) => classifyHeadline(headline, moveStartMs, options))
    .sort((a, b) => (order[a.timing] - order[b.timing]) || (Math.abs(a.deltaMinutes ?? 9999) - Math.abs(b.deltaMinutes ?? 9999)))
}

/**
 * Assemble the explanation buckets. Deterministic by construction: the model
 * downstream may only narrate what this function already decided.
 */
export function buildVerdicts(input) {
  const { move, drift, spread, turnover, headlines, reference, session } = input
  const supporting = []
  const alternatives = []
  const rejected = []

  if (move?.detected) {
    supporting.push({ id: 'move', label: 'Observed repricing', detail: move.reason })
    if (turnover?.ratio !== null && turnover?.ratio !== undefined) supporting.push({ id: 'turnover', label: 'Turnover response', detail: turnover.note })
    if (drift?.deltaBps !== null && drift?.deltaBps !== undefined) supporting.push({ id: 'drift', label: reference?.stale ? 'Token drift versus closed reference' : 'Basis versus live reference', detail: drift.note })
  }

  const candidates = rankHeadlines(headlines, move?.detected ? move.startMs : null)
  const possible = candidates.filter((item) => item.timing === 'POSSIBLE')
  const contributing = candidates.filter((item) => item.timing === 'POSSIBLE_CONTRIBUTING')
  const late = candidates.filter((item) => item.timing === 'TIMING_INCONSISTENT')

  let likelyCatalyst
  if (!move?.detected) {
    likelyCatalyst = { state: 'NO_MATERIAL_MOVE', title: 'Nothing to attribute', detail: move?.reason ?? 'No material repricing was detected in the retrieved window.', evidenceIds: [] }
  } else if (possible.length) {
    const top = possible[0]
    likelyCatalyst = {
      state: 'NEWS_TIMED',
      title: 'News-timed repricing candidate',
      detail: `${top.title} — published ${top.deltaMinutes}m before the move began (${new Date(move.startMs).toISOString().slice(11, 16)} UTC). Timing is consistent with the move; causation is not established.`,
      evidenceIds: [top.id],
    }
  } else {
    likelyCatalyst = {
      state: 'NO_STRONG_CATALYST',
      title: 'No news-timed catalyst found',
      detail: `The repricing began at ${new Date(move.startMs).toISOString().slice(11, 16)} UTC, but no retrieved headline was published inside the ${Math.round(CATALYST_WINDOW_MS / MINUTE)}m window before it. ${candidates.length ? `${candidates.length} headline(s) were retrieved and none matched the timing.` : 'No headlines were retrievable for this instrument.'}`,
      evidenceIds: [],
    }
  }

  if (spread?.state === 'fail') alternatives.push({ id: 'liquidity', label: 'Thin top-of-book', detail: `${spread.note} A wide quoted spread can amplify a move that a deeper book would absorb.` })
  else if (spread?.state === 'caution') alternatives.push({ id: 'liquidity', label: 'Moderate quoted spread', detail: `${spread.note} Liquidity may have contributed to the size of the move.` })
  if (reference?.stale) alternatives.push({ id: 'reference', label: 'Closed reference market', detail: reference.note })
  if (contributing.length) alternatives.push({ id: contributing[0].id, label: 'Possible contributing headline', detail: contributing[0].reason })
  if (!alternatives.length) alternatives.push({ id: 'unobserved', label: 'No alternative explanation retrieved', detail: 'Depth beyond top-of-book, order flow, and off-venue activity were not observable to this desk.' })

  for (const item of late) rejected.push({ id: item.id, label: 'Timing rejected', detail: `${item.title} — ${item.reason}` })

  let level = 'LOW'
  let rule = 'No timing-consistent headline and no corroborating market response were observed.'
  if (move?.detected && possible.length && turnover?.ratio >= 1.5 && move.sustained) {
    level = 'HIGH'
    rule = 'A headline was published inside the catalyst window, turnover rose at least 1.5× the baseline, and the move sustained.'
  } else if (move?.detected && (possible.length || turnover?.ratio >= 1.5)) {
    level = 'MEDIUM'
    rule = possible.length
      ? 'A timing-consistent headline was found, but turnover or sustainment did not confirm it.'
      : 'Market response was observed without a timing-consistent headline.'
  }

  const whatWouldChange = []
  if (!possible.length && move?.detected) whatWouldChange.push('A timestamped company or macro announcement published before the move start would create a timing-consistent candidate.')
  if (reference?.stale) whatWouldChange.push('A live regular-session reference quote would separate real basis from closed-market drift.')
  if (spread?.state !== 'pass') whatWouldChange.push('Order-book depth beyond top-of-book would show whether thin liquidity amplified the move.')
  if (!move?.detected) whatWouldChange.push('A repricing above the event threshold would give the desk something to explain.')
  whatWouldChange.push('Independent confirmation that the same instrument moved on another venue would test whether this was venue-specific.')

  return {
    session: session ?? null,
    likelyCatalyst,
    supporting,
    alternatives,
    rejected,
    confidence: { level, rule },
    whatWouldChange,
    candidateCount: candidates.length,
    headlines: candidates,
  }
}

/** A citation is only accepted when it resolves to evidence the server supplied. */
export function validateCitations(evidenceIds, allowedIds) {
  const allowed = new Set(allowedIds ?? [])
  const requested = Array.isArray(evidenceIds) ? evidenceIds : []
  const accepted = [...new Set(requested.filter((id) => allowed.has(id)))]
  const rejected = [...new Set(requested.filter((id) => !allowed.has(id)))]
  return { accepted, rejected, valid: accepted.length > 0 && rejected.length === 0 }
}
