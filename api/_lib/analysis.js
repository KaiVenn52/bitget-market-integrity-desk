// Deterministic move-explanation logic for Market Integrity Desk.
//
// Trust boundary: this module performs no I/O and calls no model. Every number,
// rank and verdict below is reproducible from the records the server retrieved.
// The language model narrates these results; it never produces them.

const BPS = 10000
const MINUTE = 60 * 1000

// Published alignment thresholds. These are the single source of truth on the
// server; the browser mirror in src/lib/integrity.ts must match them.
export const ALIGNMENT_PASS_BPS = 20
export const ALIGNMENT_FAIL_BPS = 100
// A repricing smaller than this is not treated as an event worth explaining.
// Deliberately the same number as the alignment pass threshold: a move that
// would break alignment is a move worth explaining.
export const MOVE_THRESHOLD_BPS = ALIGNMENT_PASS_BPS
// A headline published inside this window before the move started is a candidate.
export const CATALYST_WINDOW_MS = 45 * MINUTE
// A headline published this long after the move started cannot explain its start.
export const REINFORCEMENT_WINDOW_MS = 15 * MINUTE

/** Alignment state from a signed premium, using the published thresholds. */
export function alignmentStateOf(premiumBps) {
  if (!Number.isFinite(premiumBps)) return 'unknown'
  const distance = Math.abs(premiumBps)
  if (distance <= ALIGNMENT_PASS_BPS) return 'pass'
  if (distance <= ALIGNMENT_FAIL_BPS) return 'caution'
  return 'fail'
}

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

// --- U.S. equity market calendar ---------------------------------------------
//
// Time-of-day alone is not a session. Christmas morning is a weekday at 10:00 ET, and
// the desk used to call it a regular session: it would then demand a live quote from a
// market that was shut and treat a reported prior close as a stale reference. The
// calendar is computed from the published NYSE rules rather than stored as a table, so
// it cannot silently expire.

const DAY_MS = 86_400_000

/** Meeus/Jones/Butcher Gregorian Easter Sunday, which Good Friday hangs off. */
function easterSunday(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return Date.UTC(year, month - 1, day)
}

const keyOfUtc = (ms) => new Date(ms).toISOString().slice(0, 10)
const weekdayOfKey = (key) => new Date(`${key}T12:00:00Z`).getUTCDay()
const shiftKey = (key, days) => keyOfUtc(Date.parse(`${key}T12:00:00Z`) + days * DAY_MS)

/** The nth given weekday of a month, as a date key. `weekday` is 0=Sun. */
function nthWeekday(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const offset = (weekday - first.getUTCDay() + 7) % 7
  return keyOfUtc(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7))
}

/** The last given weekday of a month, as a date key. */
function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0))
  const offset = (last.getUTCDay() - weekday + 7) % 7
  return keyOfUtc(Date.UTC(year, month, 0 - offset))
}

/**
 * When a fixed-date holiday is actually observed: a Saturday holiday closes the market
 * the Friday before it, a Sunday holiday the Monday after.
 */
function observedFixed(year, month, day) {
  const key = keyOfUtc(Date.UTC(year, month - 1, day))
  const weekday = weekdayOfKey(key)
  if (weekday === 6) return shiftKey(key, -1)
  if (weekday === 0) return shiftKey(key, 1)
  return key
}

const isWeekdayKey = (key) => {
  const weekday = weekdayOfKey(key)
  return weekday !== 0 && weekday !== 6
}

const calendarCache = new Map()

function calendarFor(year) {
  const cached = calendarCache.get(year)
  if (cached) return cached
  const closed = new Map()
  // A holiday observed on Dec 31 belongs to the previous year's calendar.
  const add = (key, name) => { if (key.slice(0, 4) === String(year)) closed.set(key, name) }
  add(observedFixed(year, 1, 1), "New Year's Day")
  add(nthWeekday(year, 1, 1, 3), 'Martin Luther King Jr. Day')
  add(nthWeekday(year, 2, 1, 3), "Washington's Birthday")
  add(keyOfUtc(easterSunday(year) - 2 * DAY_MS), 'Good Friday')
  add(lastWeekday(year, 5, 1), 'Memorial Day')
  add(observedFixed(year, 6, 19), 'Juneteenth National Independence Day')
  add(observedFixed(year, 7, 4), 'Independence Day')
  add(nthWeekday(year, 9, 1, 1), 'Labor Day')
  add(nthWeekday(year, 11, 4, 4), 'Thanksgiving Day')
  add(observedFixed(year, 12, 25), 'Christmas Day')
  // Half days: the regular session ends at 13:00 ET instead of 16:00 ET.
  const early = new Set([shiftKey(nthWeekday(year, 11, 4, 4), 1)])
  for (const key of [keyOfUtc(Date.UTC(year, 11, 24)), keyOfUtc(Date.UTC(year, 6, 3))]) {
    if (!closed.has(key) && isWeekdayKey(key)) early.add(key)
  }
  const entry = { closed, early }
  calendarCache.set(year, entry)
  return entry
}

/**
 * The state of the U.S. equity market on a New York calendar date.
 *
 * `closed` means shut for the whole day, which is the same trading state as an
 * overnight window and is deliberately given the same session label. `earlyClose` means
 * a half day, which moves the end of the regular session to 13:00 ET.
 */
export function usMarketCalendar(dateKey) {
  const year = Number(String(dateKey).slice(0, 4))
  if (!Number.isFinite(year) || year < 1970 || year > 2200) return { closed: false, earlyClose: false, name: null }
  const { closed, early } = calendarFor(year)
  const name = closed.get(dateKey) ?? null
  return { closed: Boolean(name), earlyClose: !name && early.has(dateKey), name }
}

const REGULAR_OPEN_MINUTES = 570
const REGULAR_CLOSE_MINUTES = 960
const EARLY_CLOSE_MINUTES = 780

/**
 * Which U.S. equity session a UTC instant falls into. A closed underlying is not
 * a broken feed, so it gets its own label instead of being treated as stale data.
 */
export function sessionOf(ms) {
  const { minutes, weekend } = etParts(ms)
  if (weekend) return 'overnight'
  const { closed, earlyClose } = usMarketCalendar(etDateKey(ms))
  if (closed) return 'overnight'
  const close = earlyClose ? EARLY_CLOSE_MINUTES : REGULAR_CLOSE_MINUTES
  if (minutes >= REGULAR_OPEN_MINUTES && minutes < close) return 'regular'
  if (minutes >= 240 && minutes < REGULAR_OPEN_MINUTES) return 'premarket'
  if (minutes >= close && minutes < 1200) return 'afterhours'
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

// A quote older than this cannot price-verify anything, even inside a session
// whose label matches. Session labels alone are not freshness: a stalled feed
// still reports "Intraday" hours later.
export const REFERENCE_STALE_SECONDS = 300
// A daily close is a session boundary, not an evergreen price. Five calendar
// days covers an ordinary weekend plus a U.S. market holiday, while refusing a
// feed that has silently stopped publishing for a week or longer.
export const REPORTED_CLOSE_MAX_AGE_DAYS = 5

/** ET calendar date of an instant, used to line a token up with reported daily closes. */
export function etDateKey(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms))
  const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Format a price for a sentence a human reads.
 *
 * Prices arrive as full floats, so interpolating one directly produces a verdict
 * that reads "the reported close of 222.27000427246094", which looks like a
 * dump of a variable rather than a market fact. Precision scales with magnitude so
 * a sub-dollar token keeps its meaning, and trailing zeros are dropped.
 */
export function priceLabel(value) {
  if (!Number.isFinite(value)) return 'unavailable'
  const magnitude = Math.abs(value)
  const decimals = magnitude >= 100 ? 2 : magnitude >= 1 ? 3 : 6
  return Number(value.toFixed(decimals)).toString()
}

/**
 * Choose the reference price a trader should actually compare against.
 *
 * Preference order: a quote from the session we are in, then — while the main
 * session is not running — the latest Yahoo-reported daily close. The latter
 * is a secondary-source comparison baseline, not a live price or an
 * exchange-certified close. A quote is only a live basis while its own session
 * is running.
 *
 * `stale` means no reference could be established at all, and `staleReason` says
 * why, so the UI can never call a stalled feed a closed market. `kind` records what
 * the chosen reference actually is, and every verdict that rests on it repeats it.
 */
export function pickReference(candidates, nowMs, options = {}) {
  const usable = (candidates ?? [])
    .filter((item) => item && Number.isFinite(item.price) && Number.isFinite(item.timestampMs))
    .map((item) => ({ ...item, ageSeconds: Math.max(0, Math.round((nowMs - item.timestampMs) / 1000)), session: item.session ?? sessionOf(item.timestampMs) }))
  const current = sessionOf(nowMs)
  const sameSession = usable.filter((item) => item.session === current).sort((a, b) => a.ageSeconds - b.ageSeconds)
  const chosen = sameSession[0] ?? [...usable].sort((a, b) => a.ageSeconds - b.ageSeconds)[0]
  const closes = (options.dailyCloses ?? []).filter((row) => row && Number.isFinite(row.close) && row.close > 0)
  const latestClose = closes.length ? closes[closes.length - 1] : null
  const nowDateMs = Date.parse(`${etDateKey(nowMs)}T00:00:00Z`)
  const keyedCloseDateMs = latestClose?.dateKey ? Date.parse(`${latestClose.dateKey}T00:00:00Z`) : Number.NaN
  const closeDateMs = Number.isFinite(keyedCloseDateMs) ? keyedCloseDateMs : Number(latestClose?.ts)
  const closeAgeDays = Number.isFinite(closeDateMs) ? Math.floor((nowDateMs - closeDateMs) / 86_400_000) : null
  const reportedCloseUsable = Boolean(latestClose && closeAgeDays !== null && closeAgeDays >= 0 && closeAgeDays <= REPORTED_CLOSE_MAX_AGE_DAYS)
  const reportedCloseFailure = latestClose && !reportedCloseUsable
    ? `The latest reported daily close is ${closeAgeDays === null ? 'undated' : `${closeAgeDays} calendar days old`}, beyond the ${REPORTED_CLOSE_MAX_AGE_DAYS}-day ceiling, so it is not used as a reference.`
    : null

  // The main session is the only window where the underlying trades continuously,
  // so inside it a live quote is the only valid basis.
  const liveQuote = chosen && chosen.session === current && chosen.ageSeconds <= REFERENCE_STALE_SECONDS ? chosen : null
  const useReportedClose = !liveQuote && current !== 'regular' && reportedCloseUsable

  if (!liveQuote && !useReportedClose) {
    // No quote can serve as a basis. Either nothing was retrieved at all, or the
    // main session is running — where the previous close is not a basis because the
    // underlying is trading at a different price right now.
    if (!chosen) {
      const note = reportedCloseFailure
        ? reportedCloseFailure
        : latestClose
          ? 'No reference quote was retrieved, and a prior-session close cannot stand in for one while the underlying is in its main session, so there is no basis to compare against.'
        : 'No reference quote or reported daily close was retrieved; alignment is not calculated.'
      return { chosen: null, candidates: [], stale: true, staleReason: 'missing', kind: null, underlyingTradable: current !== 'overnight', currentSession: current, note }
    }
    const underlyingTradable = current !== 'overnight'
    const staleReason = underlyingTradable ? (chosen.session !== current ? 'session-mismatch' : 'quote-age') : 'market-closed'
    const note = staleReason === 'session-mismatch'
      ? `The freshest reference comes from the ${sessionLabel(chosen.session)} window, not the current ${sessionLabel(current)} window, and no reported daily close was retrieved to stand in for it.`
      : staleReason === 'quote-age'
        ? `The freshest reference quote is ${chosen.ageSeconds}s old, beyond the ${REFERENCE_STALE_SECONDS}s ceiling for a live basis, so the reference cannot price-verify this token right now.`
        : reportedCloseFailure ?? 'The underlying market is closed and no reported daily close was retrieved, so there is no reference to compare against.'
    return { chosen, candidates: usable.sort((a, b) => a.ageSeconds - b.ageSeconds), stale: true, staleReason, kind: null, underlyingTradable, currentSession: current, note }
  }

  if (useReportedClose) {
    return {
      chosen: { price: latestClose.close, timestampMs: latestClose.ts ?? closeDateMs, session: 'closed', ageSeconds: null, source: latestClose.source ?? 'Daily-close source unspecified' },
      candidates: usable.sort((a, b) => a.ageSeconds - b.ageSeconds),
      stale: false,
      staleReason: null,
      kind: 'reported-close',
      closeDateKey: latestClose.dateKey ?? null,
      underlyingTradable: false,
      currentSession: current,
      note: `The underlying is not in its main session (${sessionLabel(current)}), so the prior-session close of ${priceLabel(latestClose.close)} reported by ${latestClose.source ?? 'an unspecified source'} is the available comparison baseline, not a live or exchange-certified price. Any gap against it is token-side movement the underlying has not confirmed.`,
    }
  }

  return {
    chosen: liveQuote,
    candidates: usable.sort((a, b) => a.ageSeconds - b.ageSeconds),
    stale: false,
    staleReason: null,
    kind: 'live-quote',
    underlyingTradable: true,
    currentSession: current,
    note: `Reference belongs to the current ${sessionLabel(current)} window and is ${liveQuote.ageSeconds}s old.`,
  }
}

/**
 * The evidence record for the reference price.
 *
 * Provenance has to name the source that actually answered. A reported close is
 * retrieved from the keyless daily-close feed, not from Stock+, and it has a session
 * date rather than a quote age — so labelling it "Bitget Stock+ quote" with
 * "age nulls" would be both a misattribution and unreadable. That is the exact class
 * of error this desk exists to catch, so it must not make it itself.
 *
 * @param reference - the value returned by `pickReference`.
 * @param nowMs - the instant the evidence was retrieved.
 */
export function referenceEvidence(reference, nowMs) {
  const reportedClose = reference?.kind === 'reported-close'
  const chosen = reference?.chosen
  const summary = !chosen
    ? reference?.note ?? 'No reference price was retrievable.'
    : reportedClose
      ? `Reference is the reported daily close of ${priceLabel(chosen.price)} from ${reference.closeDateKey ?? 'the prior session'}, retrieved from ${chosen.source}. ${reference.note}`
      : `Reference price ${priceLabel(chosen.price)} from the ${chosen.label ?? sessionLabel(chosen.session)} window, age ${chosen.ageSeconds}s. ${reference.note}`
  return {
    id: 'reference',
    title: 'Session-aware underlying reference',
    summary,
    state: chosen ? (reference.stale ? 'caution' : 'pass') : 'unknown',
    source: reportedClose ? (chosen?.source ?? 'Daily-close source unspecified') : 'Bitget Stock+ quote',
    endpoint: reportedClose ? '/v8/finance/chart?interval=1d' : (chosen?.endpoint ?? '/api/v3/stockplus/market/quote'),
    retrievedAt: new Date(nowMs).toISOString(),
  }
}

/**
 * How long a model call may be given, derived from what is left of the function budget.
 *
 * A fixed deadline cannot be safe here. The platform kills the function at its own
 * limit, so a fixed deadline that ignores how long retrieval already took will either
 * waste budget or — worse — run past the limit, at which point the platform returns
 * nothing at all. An honest labelled fallback is strictly more useful than a 504.
 *
 * @param budgetMs - the platform's budget for the whole handler.
 * @param elapsedMs - time already spent before the model call.
 * @param reserveMs - what the handler needs to serialize its response afterwards.
 * @param ceilingMs - the most the model may ever be given.
 * @param floorMs - below this a call is not worth starting.
 */
export function modelDeadlineMs({ budgetMs, elapsedMs, reserveMs, ceilingMs, floorMs = 5_000 }) {
  return Math.max(floorMs, Math.min(ceilingMs, budgetMs - elapsedMs - reserveMs))
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
  if (reference?.stale) {
    const label = reference.staleReason === 'market-closed'
      ? 'Closed reference market'
      : reference.staleReason === 'quote-age'
        ? 'Stalled reference quote'
        : 'Reference from an earlier session'
    alternatives.push({ id: 'reference', label, detail: reference.note })
  }
  if (contributing.length) alternatives.push({ id: contributing[0].id, label: 'Possible contributing headline', detail: contributing[0].reason })
  if (!alternatives.length) alternatives.push({ id: 'unobserved', label: 'Unobserved factors', detail: 'Depth beyond top-of-book, order flow, and off-venue activity were not observable to this desk, so no alternative explanation is claimed.' })

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

/**
 * Every bracketed marker a narrative actually used, in the order it used them.
 *
 * The model is told to cite inside the prose, so the prose is what has to be checked.
 * Accepts the shapes a model plausibly emits — `[token]`, `[token, drift]`,
 * `[token][drift]` — and returns nothing for text with no markers at all, which is
 * itself a failure the caller has to treat as one.
 */
export function extractCitations(text) {
  if (typeof text !== 'string') return []
  const found = []
  for (const match of text.matchAll(/\[([^\]\n]{1,120})\]/g)) {
    for (const part of match[1].split(/[,;]/)) {
      const id = part.trim().replace(/^["'`]|["'`]$/g, '').trim()
      // Prose brackets such as "[sic]" or a bare number are not citation attempts.
      if (id && /^[A-Za-z][\w:.-]*$/.test(id)) found.push(id)
    }
  }
  return [...new Set(found)]
}

/**
 * A citation is only accepted when it resolves to evidence the server supplied.
 *
 * This checks both halves of the claim the interface makes. The `evidenceIds` array is
 * the model's own index of what it used; `brief` is the prose a reader actually reads,
 * where the same IDs appear inline. Checking only the array would let a narrative cite
 * nothing, or cite an ID the server never issued, and still be labelled verified — the
 * exact failure this desk exists to prevent. A narrative that cites nothing fails,
 * because an uncited claim is indistinguishable from a fabricated one.
 */
export function validateCitations(evidenceIds, allowedIds, brief) {
  const allowed = new Set(allowedIds ?? [])
  const requested = Array.isArray(evidenceIds) ? evidenceIds : []
  const accepted = [...new Set(requested.filter((id) => allowed.has(id)))]
  const rejected = [...new Set(requested.filter((id) => !allowed.has(id)))]

  const bodyCitations = extractCitations(brief)
  const bodyRejected = bodyCitations.filter((id) => !allowed.has(id))
  const bodyAccepted = bodyCitations.filter((id) => allowed.has(id))
  // Only meaningful when a body was supplied; the array-only callers predate this.
  const bodyChecked = typeof brief === 'string'
  const bodyCited = bodyCitations.length > 0

  return {
    accepted,
    rejected,
    bodyCitations,
    bodyAccepted,
    bodyRejected,
    bodyChecked,
    valid: accepted.length > 0 && rejected.length === 0 && (!bodyChecked || (bodyCited && bodyRejected.length === 0)),
  }
}
