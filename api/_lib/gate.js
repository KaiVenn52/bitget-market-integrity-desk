// Pre-trade integrity gate.
//
// The gate answers one question for a human trader: can the *market state* of
// this rToken be trusted right now, and if not, what exactly blocks it? It never
// answers "buy" or "sell" and it never places an order — the human makes the
// decision, the gate states what the record supports.
//
// Every rule is deterministic and ordered. The first matching rule wins, so the
// same inputs always produce the same verdict, and a judge can reproduce any
// entry in the desk log by re-running it against the same evidence.

import { MOVE_THRESHOLD_BPS } from './analysis.js'

export const GATE_DECISIONS = ['CLEAR', 'INVESTIGATE', 'WAIT', 'BLOCKED']

// Severity order used by the sweep summary: a desk with one blocked instrument
// is not a clear desk, regardless of how many instruments passed.
export const DECISION_WEIGHT = { BLOCKED: 3, WAIT: 2, INVESTIGATE: 1, CLEAR: 0 }

const DECISION_MEANING = {
  CLEAR: 'Nothing in the record blocks a decision on this instrument.',
  INVESTIGATE: 'The state is verifiable, but a specific observation needs checking first.',
  WAIT: 'The reference market cannot price-verify this token right now, so the token is trading on its own information.',
  BLOCKED: 'The market state cannot be verified from available evidence.',
}

const bpsLabel = (value) => `${value > 0 ? '+' : ''}${value} bps`
const absBps = (value) => (typeof value === 'number' ? Math.abs(value) : null)

// A gate verdict is a claim about evidence, so it must name the evidence it
// rests on. These IDs match the sweep's evidence set and the analysis endpoint's
// vocabulary, so one evidence model serves the whole desk.
function verdict({ decision, code, headline, reason, evidenceIds, conditions, nextStep, referenceKind = null }) {
  return {
    decision,
    code,
    headline,
    reason,
    meaning: DECISION_MEANING[decision],
    evidenceIds,
    conditions,
    nextStep,
    referenceKind,
  }
}

/**
 * Evaluate the gate for one instrument.
 *
 * @param {object} input
 * @param {{chosen:{price:number, ageSeconds:number, session:string, label?:string}|null, stale:boolean, underlyingTradable:boolean, currentSession?:string, note:string}} input.reference
 *   The shape returned by `pickReference` — the chosen quote is nested, and the
 *   gate must read the same contract the analysis endpoint produces.
 * @param {{price:number, ageSeconds:number}} input.token
 * @param {number|null} input.premiumBps
 * @param {'pass'|'caution'|'fail'|'unknown'} input.alignmentState
 * @param {{detected:boolean, moveBps?:number, direction?:string, startMs?:number, reason:string}} input.move
 * @param {{currentBps:number|null, priorBps:number|null, deltaBps:number|null, trend:string}} input.drift
 * @param {{spreadBps:number|null, state:string, note:string}} input.spread
 * @param {{ratio:number|null, state:string, note:string}} input.turnover
 */
export function evaluateGate(input) {
  const { token, reference, premiumBps, alignmentState, move, drift, spread, turnover } = input

  // 0. Nothing was observed at all: there is no state to gate.
  if (!token || !Number.isFinite(token.price)) {
    return verdict({
      decision: 'BLOCKED',
      code: 'TOKEN_UNAVAILABLE',
      headline: 'No rToken ticker retrieved',
      reason: 'The rToken ticker could not be retrieved for this sweep, so the desk has no observation of this market to gate. This is a source failure, not a market finding.',
      evidenceIds: ['token'],
      conditions: ['The rToken ticker endpoint responds for this symbol'],
      nextStep: 'Treat the instrument as unobserved and re-run the sweep.',
    })
  }

  // 1. No usable reference: nothing can be compared. The reason quotes the retrieval
  // layer's own note rather than asserting a cause, because "no source responded" and
  // "a source responded but cannot serve as a basis" are different failures, and a
  // verdict that blurs them is not honest about what it actually checked.
  if (!reference || reference.chosen?.price == null) {
    const cause = reference?.note ? ` ${reference.note}` : ''
    return verdict({
      decision: 'BLOCKED',
      code: 'UNVERIFIABLE_REFERENCE',
      headline: 'No usable underlying reference',
      reason: `The live rToken ticker was retrieved, but no reference price could be established, so there is no premium to check.${cause} This is a missing or unusable source, not a finding about the token.`,
      evidenceIds: ['token', 'reference'],
      conditions: [
        'An authenticated Stock+ quote for the underlying becomes available',
        'The underlying market enters a closed window where a reported prior-session close can be used as a comparison baseline',
        'The rToken ticker itself stops updating, which would change this to a feed-staleness block',
      ],
      nextStep: 'Treat the price as unverified. Inspect the token quote and re-run once a reference source responds.',
    })
  }

  // 2. The token's own feed is stale: the desk cannot characterise the state.
  if (token.ageSeconds > 120) {
    return verdict({
      decision: 'BLOCKED',
      code: 'TOKEN_FEED_STALE',
      headline: `Token quote is ${token.ageSeconds}s old`,
      reason: `The rToken quote is older than the 120s freshness ceiling, so any premium computed from it describes a past state rather than the current one.`,
      evidenceIds: ['token', 'session'],
      conditions: ['A token quote newer than 120 seconds is observed'],
      nextStep: 'Wait for a fresh ticker before drawing any conclusion about this market.',
    })
  }

  // 3. The reference is a reported prior-session close. While the underlying cannot
  // trade, that close is a comparison baseline, so a gap against it is the token
  // pricing something the underlying has not confirmed yet. That is the desk's
  // central case, and calling it an alignment break would be wrong: there is no
  // live underlying price for the token to disagree with.
  if (reference.kind === 'reported-close') {
    const gapBps = absBps(premiumBps)
    const material = gapBps != null && gapBps >= MOVE_THRESHOLD_BPS
    if (material) {
      return verdict({
        decision: 'WAIT',
        code: 'CLOSED_MARKET_DRIFT',
        headline: `${bpsLabel(premiumBps)} from the reported prior close`,
        reason: `${reference.note} The gap is ${gapBps} bps, beyond the ${MOVE_THRESHOLD_BPS} bps alignment threshold, so the token is pricing information the underlying market has not traded on yet.`,
        evidenceIds: ['token', 'reference', 'drift', 'turnover', 'session'],
        conditions: [
          'The underlying opens and trades to within 20 bps of the token price',
          'The gap reverts toward the reported prior close before the market opens',
          'A timing-consistent catalyst is found that explains the repricing',
        ],
        nextStep: 'Run the historical stress test for a drift of this size to see how often comparable gaps resolved the same way, then run catalyst attribution on this instrument.',
        referenceKind: 'reported-close',
      })
    }
    // An aligned prior close only settles the reference question. Repricing and
    // execution-quality checks below must still run before this can be CLEAR.
  }

  // 4. A live underlying disagrees beyond the fail threshold: a state contradiction.
  if (alignmentState === 'fail' && !reference.stale) {
    return verdict({
      decision: 'BLOCKED',
      code: 'ALIGNMENT_BREAK',
      headline: `Token and live underlying differ by ${bpsLabel(premiumBps)}`,
      reason: `Both sources are live and disagree by more than the 100 bps fail threshold. One of the two prices is not describing the same instrument state, and the desk cannot tell which.`,
      evidenceIds: ['token', 'reference', 'drift', 'session'],
      conditions: [
        'The gap narrows inside the 20 bps pass threshold',
        'The reference quote goes stale, which would move this to the stale-reference path',
      ],
      nextStep: 'Do not act on either price. Re-check both sources before forming a view.',
      referenceKind: 'live-quote',
    })
  }

  // 5. No reference can price-verify the token: the market is closed, the
  // quote comes from an earlier session, or the feed has stalled. This is the
  // desk's signature case — the token keeps trading while nothing can confirm it,
  // so the question is whether the drift is material, not whether it is "wrong".
  if (reference.stale) {
    const driftBps = absBps(drift?.currentBps)
    const material = driftBps != null && driftBps >= MOVE_THRESHOLD_BPS
    if (material) {
      return verdict({
        decision: 'WAIT',
        code: 'STALE_REFERENCE_DRIFT',
        headline: `${bpsLabel(drift.currentBps)} from a reference that cannot confirm it`,
        reason: `${reference.note} The token has moved ${driftBps} bps from that reference, which is beyond the ${MOVE_THRESHOLD_BPS} bps alignment threshold, so it is pricing information the reference cannot yet confirm or deny.`,
        evidenceIds: ['token', 'reference', 'drift', 'turnover', 'session'],
        conditions: [
          'A live reference quote becomes available and the gap resolves inside 20 bps',
          'The drift reverts toward the stale reference before the reference updates',
          'A timing-consistent catalyst is found that explains the repricing',
        ],
        nextStep: 'Run the historical stress test for a drift of this size before acting, then run catalyst attribution on this instrument.',
      })
    }
    // A small drift does not make an expired quote a valid comparison basis.
    // Unlike a dated reported close, a stale quote cannot clear the desk even
    // when the token happens to be near its old price.
    return verdict({
      decision: 'WAIT',
      code: 'STALE_REFERENCE_UNCONFIRMED',
      headline: 'Reference quote is not fresh enough to verify',
      reason: `${reference.note} The token is within ${MOVE_THRESHOLD_BPS} bps of that old quote, but this does not verify the current market state.${move?.detected ? ` ${move.reason}` : ''}${spread?.state === 'fail' ? ` ${spread.note}` : ''}`,
      evidenceIds: ['token', 'reference', 'drift', 'session'],
      conditions: ['A fresh same-session reference quote becomes available', 'During a closed market, a dated reported prior close becomes available as a declared comparison baseline'],
      nextStep: 'Wait for a valid reference, then repeat the alignment and repricing checks before treating this instrument as clear.',
    })
  }

  // 6. A live reference with a premium inside the caution band.
  if (alignmentState === 'caution' && !reference.stale) {
    return verdict({
      decision: 'INVESTIGATE',
      code: 'ALIGNMENT_CAUTION',
      headline: `Premium inside the caution band (${bpsLabel(premiumBps)})`,
      reason: `Both sources are live and differ by more than the 20 bps pass threshold but less than the 100 bps fail threshold. The desk treats this as unresolved rather than as a break.`,
      evidenceIds: ['token', 'reference', 'drift', 'spread'],
      conditions: [
        'The premium closes inside 20 bps',
        'The premium widens past 100 bps, which would block the state outright',
      ],
      nextStep: 'Check whether the gap is widening or converging before relying on this price.',
      referenceKind: 'live-quote',
    })
  }

  // 7. A material repricing with a live reference and no explanation yet.
  if (move?.detected) {
    return verdict({
      decision: 'INVESTIGATE',
      code: 'UNEXPLAINED_REPRICING',
      headline: `${bpsLabel(move.moveBps)} in ${move.windowMinutes} minutes`,
      reason: `${move.reason} This sweep measured the repricing but did not retrieve headlines, so no explanation is claimed either way.`,
      evidenceIds: ['token', 'candles', 'move', 'drift', 'turnover'],
      conditions: [
        'Catalyst attribution finds a headline published before the move began',
        'The move retraces and the window no longer contains a material repricing',
      ],
      nextStep: 'Run catalyst attribution on this instrument to rank candidate explanations by publication time.',
    })
  }

  // 8. Quoted liquidity is wide enough to distort the price the human would see.
  if (spread?.state === 'fail') {
    return verdict({
      decision: 'INVESTIGATE',
      code: 'WIDE_SPREAD',
      headline: `Quoted spread ${spread.spreadBps} bps`,
      reason: `${spread.note} A wide quoted spread means the price a decision is based on may not be the price available to execute at.`,
      evidenceIds: ['spread', 'token'],
      conditions: ['The quoted spread narrows inside the pass threshold'],
      nextStep: 'Re-check top-of-book before sizing anything against this price.',
    })
  }

  if (reference.kind === 'reported-close') {
    const gapBps = absBps(premiumBps)
    return verdict({
      decision: 'CLEAR',
      code: 'CLOSED_MARKET_ALIGNED',
      headline: `Near the reported prior close (${bpsLabel(premiumBps ?? 0)})`,
      reason: `${reference.note} The gap is ${gapBps ?? 0} bps, inside the ${MOVE_THRESHOLD_BPS} bps alignment threshold, and no independent repricing or quoted-spread problem was observed.`,
      evidenceIds: ['token', 'reference', 'drift', 'spread', 'session'],
      conditions: ['A gap beyond the alignment threshold opens while the underlying is still not in its main session', 'A material repricing or wide quoted spread appears'],
      nextStep: 'No integrity obstacle. Standard research applies.',
      referenceKind: 'reported-close',
    })
  }

  // 9. Everything observable agrees.
  const parts = []
  if (premiumBps != null) parts.push(`premium ${bpsLabel(premiumBps)}`)
  if (drift?.currentBps != null) parts.push(`drift ${bpsLabel(drift.currentBps)}`)
  if (turnover?.ratio != null) parts.push(`turnover ${turnover.ratio}× baseline`)
  return verdict({
    decision: 'CLEAR',
    code: 'STATE_CONSISTENT',
    headline: 'Observable checks agree',
    reason: `Both sources are live and inside the pass threshold${parts.length ? ` (${parts.join(', ')})` : ''}. No repricing, spread or reference problem was observed in this sweep.`,
    evidenceIds: ['token', 'reference', 'drift', 'spread', 'turnover', 'session'],
    conditions: [
      'A repricing beyond the alignment threshold appears',
      'Either source stops publishing fresh quotes',
      'The quoted spread widens beyond the pass threshold',
    ],
    nextStep: 'No integrity obstacle. Standard research applies.',
    referenceKind: 'live-quote',
  })
}

/**
 * Summarise a sweep of several instruments into a desk-level line.
 *
 * The headline is deliberately the worst verdict in the sweep rather than an
 * average: a desk is only as clear as its least verifiable instrument.
 */
export function summarizeSweep(entries) {
  const counts = { CLEAR: 0, INVESTIGATE: 0, WAIT: 0, BLOCKED: 0 }
  for (const entry of entries) counts[entry.gate.decision] += 1
  const worst = entries.reduce(
    (acc, entry) => (DECISION_WEIGHT[entry.gate.decision] > DECISION_WEIGHT[acc] ? entry.gate.decision : acc),
    'CLEAR',
  )
  const blocking = entries.filter((entry) => entry.gate.decision === 'BLOCKED' || entry.gate.decision === 'WAIT')
  const headline = worst === 'CLEAR'
    ? `All ${entries.length} instruments cleared`
    : `${counts.BLOCKED} blocked · ${counts.WAIT} waiting · ${counts.INVESTIGATE} to investigate · ${counts.CLEAR} clear`
  return {
    worst,
    counts,
    headline,
    detail: blocking.length
      ? blocking.map((entry) => `${entry.symbol}: ${entry.gate.headline}`).join(' · ')
      : 'No instrument was blocked or left waiting on a closed reference.',
  }
}
