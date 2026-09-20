// Integrity sweep: gate every supported instrument in one pass.
//
// This is the desk's own work, not the trader's question. It retrieves the same
// sources the analysis endpoint uses, measures each instrument deterministically,
// and asks the gate whether the *market state* can be trusted. It retrieves no
// headlines and calls no model: a sweep is cheap enough to run on demand, and an
// unexplained repricing is handed to the attribution endpoint rather than
// guessed at here.
//
// The output is an audit trail. Each entry names the evidence it rests on, the
// conditions that would change the verdict, and the next research step — so a
// human can disagree with the gate on the record rather than on vibes.

import {
  alignmentStateOf,
  bpsBetween,
  detectMove,
  driftSeries,
  pickReference,
  referenceEvidence,
  sessionLabel,
  sessionOf,
  spreadOf,
  turnoverAcceleration,
} from './_lib/analysis.js'
import { evaluateGate, summarizeSweep } from './_lib/gate.js'
import { attempt, fetchCandles, fetchDailyCloses, fetchReferenceQuotes, fetchTicker, INSTRUMENTS, SYMBOLS, toCandle } from './_lib/sources.js'

export const config = { maxDuration: 30 }

const SOURCE_TIMEOUT_MS = 12_000
const CANDLE_LIMIT = 200

/** Evidence records use the same IDs as the attribution endpoint. */
function buildEvidence({ symbol, now, token, tokenAge, candles, reference, drift, spread, turnover, move }) {
  const evidence = []
  // A failed retrieval is still a record. Emitting it keeps every gate verdict
  // citable: the alternative is a verdict that cites evidence the desk does not
  // hold, which the sweep's own integrity check flags as a defect.
  if (!token || !Number.isFinite(Number(token.lastPrice))) {
    evidence.push({
      id: 'token',
      title: 'Live rToken ticker',
      summary: 'The rToken ticker endpoint did not return a usable row in this sweep, so no token price was observed.',
      state: 'unknown',
      source: 'Bitget UTA public market data',
      endpoint: '/api/v3/market/tickers',
      retrievedAt: new Date(now).toISOString(),
    })
  } else {
    evidence.push({
      id: 'token',
      title: 'Live rToken ticker',
      summary: `${symbol} last price ${Number(token.lastPrice)} USDT, source age ${tokenAge}s.`,
      state: tokenAge <= 30 ? 'pass' : tokenAge <= 120 ? 'caution' : 'fail',
      source: 'Bitget UTA public market data',
      endpoint: '/api/v3/market/tickers',
      retrievedAt: new Date(now).toISOString(),
    })
  }
  if (candles.length) {
    evidence.push({
      id: 'candles',
      title: 'Closed rToken candles',
      summary: `${candles.length} closed five-minute candles from ${new Date(candles[0].timestamp).toISOString()} to ${new Date(candles[candles.length - 1].timestamp).toISOString()}.`,
      state: 'pass',
      source: 'Bitget UTA public market data',
      endpoint: '/api/v3/market/candles?interval=5m',
      retrievedAt: new Date(now).toISOString(),
    })
    evidence.push({
      id: 'move',
      title: 'Repricing detection',
      summary: move.reason,
      state: move.detected ? 'caution' : 'pass',
      source: 'Deterministic 5/15/60-minute scan',
      endpoint: 'Derived from candles',
      retrievedAt: new Date(now).toISOString(),
    })
  }
  // Provenance has to name the source that actually answered, so the reference
  // record is built in one place and shared with the analysis endpoint.
  evidence.push(referenceEvidence(reference, now))
  evidence.push({
    id: 'drift',
    title: 'Drift versus reference',
    summary: drift.currentBps == null ? drift.note : `Drift is ${drift.currentBps} bps now versus ${drift.priorBps} bps ${drift.lookbackMinutes} minutes ago (${drift.trend}).`,
    state: drift.currentBps == null ? 'unknown' : Math.abs(drift.currentBps) <= 20 ? 'pass' : Math.abs(drift.currentBps) <= 100 ? 'caution' : 'fail',
    source: 'Deterministic computation over candles',
    endpoint: 'Derived',
    retrievedAt: new Date(now).toISOString(),
  })
  evidence.push({
    id: 'spread',
    title: 'Top-of-book spread',
    summary: spread.note,
    state: spread.state,
    source: 'Bitget UTA public market data',
    endpoint: '/api/v3/market/tickers',
    retrievedAt: new Date(now).toISOString(),
  })
  evidence.push({
    id: 'turnover',
    title: 'Turnover acceleration',
    summary: turnover.note,
    state: turnover.state,
    source: 'Bitget UTA public market data',
    endpoint: '/api/v3/market/candles?interval=5m',
    retrievedAt: new Date(now).toISOString(),
  })
  evidence.push({
    id: 'session',
    title: 'Session context',
    summary: `Current window is the ${sessionLabel(reference.currentSession ?? sessionOf(now))}; the underlying ${reference.underlyingTradable ? 'can' : 'cannot'} currently reprice.`,
    state: 'pass',
    source: 'US equity session calendar (America/New_York)',
    endpoint: 'Derived',
    retrievedAt: new Date(now).toISOString(),
  })
  return evidence
}

async function sweepOne(symbol, meta, signal) {
  const now = Date.now()
  const [tickerResult, candleResult, referenceQuotes, dailyCloses] = await Promise.all([
    attempt(() => fetchTicker(symbol, signal), { data: null }),
    attempt(() => fetchCandles(symbol, '5m', CANDLE_LIMIT, signal), { data: [] }),
    fetchReferenceQuotes(meta, signal),
    fetchDailyCloses(meta.ticker).then((result) => result.closes).catch(() => []),
  ])

  const token = (tickerResult.data ?? []).find?.((item) => String(item.symbol).toLowerCase() === symbol.toLowerCase()) ?? tickerResult.data?.[0] ?? null
  const candles = (candleResult.data ?? [])
    .map(toCandle)
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.close))
    .sort((a, b) => a.timestamp - b.timestamp)

  const tokenPrice = Number(token?.lastPrice)
  const tokenAge = Number.isFinite(tokenPrice)
    ? Math.max(0, Math.round((now - Number(token.ts || now)) / 1000))
    : null

  // The reported prior close is passed in so the gate has a basis while the underlying
  // cannot trade, without needing an authenticated quote to exist.
  const reference = pickReference(referenceQuotes, now, { dailyCloses })
  const referencePrice = reference.chosen?.price ?? null
  const premiumBps = Number.isFinite(tokenPrice) && referencePrice != null ? bpsBetween(tokenPrice, referencePrice) : null
  const alignmentState = alignmentStateOf(premiumBps)
  const spread = spreadOf(token)
  const move = detectMove(candles)
  const drift = driftSeries(candles, referencePrice)
  const turnover = turnoverAcceleration(candles)

  const gate = evaluateGate({
    token: { price: tokenPrice, ageSeconds: tokenAge },
    reference,
    premiumBps,
    alignmentState,
    move,
    drift,
    spread,
    turnover,
  })

  const evidence = buildEvidence({ symbol, now, token, tokenAge, candles, reference, drift, spread, turnover, move })
  const evidenceIds = new Set(evidence.map((item) => item.id))
  const unresolved = gate.evidenceIds.filter((id) => !evidenceIds.has(id))

  return {
    symbol,
    company: meta.company,
    underlyingSymbol: meta.underlyingSymbol,
    at: new Date(now).toISOString(),
    session: reference.currentSession ?? sessionOf(now),
    sessionLabel: sessionLabel(reference.currentSession ?? sessionOf(now)),
    tokenPrice: Number.isFinite(tokenPrice) ? tokenPrice : null,
    tokenQuoteAge: tokenAge,
    premiumBps,
    alignmentState,
    referencePrice,
    referenceStale: reference.stale,
    gate,
    // A gate verdict may only cite evidence the sweep actually holds. If this is
    // ever non-empty the desk would be citing a record it did not retrieve.
    unresolvedEvidenceIds: unresolved,
    metrics: {
      move,
      drift: { currentBps: drift.currentBps, priorBps: drift.priorBps, deltaBps: drift.deltaBps, trend: drift.trend, lookbackMinutes: drift.lookbackMinutes },
      spread: { spreadBps: spread.spreadBps, bid: spread.bid, ask: spread.ask, bidSize: spread.bidSize, askSize: spread.askSize, state: spread.state },
      turnover: { ratio: turnover.ratio, state: turnover.state },
    },
    sourceErrors: [tickerResult.error, candleResult.error].filter(Boolean),
    evidence,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS)
  try {
    const entries = await Promise.all(
      SYMBOLS.map(async (symbol) => {
        try {
          return await sweepOne(symbol, INSTRUMENTS.get(symbol), controller.signal)
        } catch (error) {
          const at = new Date().toISOString()
          const failed = evaluateGate({ token: { price: null, ageSeconds: null }, reference: null, premiumBps: null, alignmentState: 'unknown', move: { detected: false, reason: 'Sweep failed before measurement.' }, drift: null, spread: null, turnover: null })
          const evidence = [{
            id: 'token',
            title: 'Live rToken ticker',
            summary: `This instrument failed before any source was read: ${String(error instanceof Error ? error.message : error).slice(0, 140)}`,
            state: 'unknown',
            source: 'Bitget UTA public market data',
            endpoint: '/api/v3/market/tickers',
            retrievedAt: at,
          }]
          const held = new Set(evidence.map((item) => item.id))
          return {
            symbol,
            company: INSTRUMENTS.get(symbol).company,
            underlyingSymbol: INSTRUMENTS.get(symbol).underlyingSymbol,
            at,
            session: sessionOf(Date.now()),
            sessionLabel: sessionLabel(sessionOf(Date.now())),
            tokenPrice: null,
            tokenQuoteAge: null,
            premiumBps: null,
            alignmentState: 'unknown',
            referencePrice: null,
            referenceStale: true,
            gate: failed,
            unresolvedEvidenceIds: failed.evidenceIds.filter((id) => !held.has(id)),
            metrics: null,
            sourceErrors: [String(error instanceof Error ? error.message : error).slice(0, 160)],
            evidence,
          }
        }
      }),
    )

    const summary = summarizeSweep(entries)
    const firstFailure = entries.find((entry) => entry.unresolvedEvidenceIds.length)
    if (firstFailure) {
      // Surfaced rather than hidden: a citation the desk cannot back is a bug.
      summary.integrityWarning = `${firstFailure.symbol} cited evidence it did not retrieve: ${firstFailure.unresolvedEvidenceIds.join(', ')}`
    }

    return res.status(200).json({
      ranAt: new Date().toISOString(),
      mode: 'live',
      reasoningMode: 'rules',
      sweepLabel: entries[0]?.sessionLabel ?? 'Unknown session',
      summary,
      entries,
    })
  } catch (error) {
    return res.status(503).json({ error: 'Sweep unavailable', detail: String(error instanceof Error ? error.message : error).slice(0, 200) })
  } finally {
    clearTimeout(timer)
  }
}
