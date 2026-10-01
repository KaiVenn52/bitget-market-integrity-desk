import type { MoveAnalysis, Passport } from '../types'

export type ThesisKind = 'integrity' | 'news' | 'overnight' | 'feed'
export const THESIS_LABELS: Record<ThesisKind, string> = {
  integrity: 'Market readiness', news: 'News explains this move',
  overnight: 'Overnight drift deserves follow-up', feed: 'The gap may be stale-reference noise',
}
export const isThesisKind = (value: unknown): value is ThesisKind => ['integrity', 'news', 'overnight', 'feed'].includes(String(value))
export function thesisQuestion(kind: ThesisKind, symbol: string): string {
  return kind === 'news' ? `Does the retrieved news support an explanation of ${symbol}'s measured move?`
    : kind === 'overnight' ? `Pressure-test ${symbol}'s overnight drift against comparable historical windows.`
      : kind === 'feed' ? `Could ${symbol}'s apparent gap be caused by a stale underlying reference?`
        : `Can I trust ${symbol} right now?`
}

export interface ThesisAssessment {
  kind: ThesisKind
  status: 'SUPPORTED' | 'CONTRADICTED' | 'UNRESOLVED' | 'OUT_OF_SCOPE'
  headline: string
  detail: string
  next: string
  evidenceIds: string[]
}

/** Keep a measured gap bound to the reference used to compute it. The analysis
 * and passport are independently retrieved; never relabel one tier's gap as the other. */
export function researchGap(passport: Passport, analysis: MoveAnalysis | null): number | null {
  if (!analysis || analysis.symbol !== passport.instrument.symbol || !analysis.reference?.chosen) return null
  const gap = analysis.metrics.drift?.currentBps
  if (typeof gap === 'number' && Number.isFinite(gap)) return gap
  // Compatibility with a record lacking drift metrics, only when the prices match.
  return analysis.reference.chosen.price === passport.instrument.underlyingPrice ? passport.premiumBps : null
}

// The lens is chosen explicitly by the researcher. Arbitrary prose is not parsed
// into a trading belief and a timing-consistent headline is never causal proof.
export function assessThesis(kind: ThesisKind, passport: Passport, analysis: MoveAnalysis | null): ThesisAssessment {
  const records = [...passport.evidence, ...(analysis?.evidence ?? [])]
  const ids = (...requested: string[]) => requested.filter((id) => records.some((record) => record.id === id))
  const result = (status: ThesisAssessment['status'], headline: string, detail: string, next: string, evidenceIds: string[] = []): ThesisAssessment => ({ kind, status, headline, detail, next, evidenceIds })
  if (passport.mode !== 'live') return result('UNRESOLVED', 'Run a live observation to test this hypothesis.', 'The opening snapshot demonstrates the workflow; it cannot support a current-market claim.', 'Run Investigate with this research lens.')
  if (kind === 'integrity') return result('UNRESOLVED', 'Market readiness is assessed below.', 'This lens checks the observable market state without judging a directional investment thesis.', passport.researchAction)
  if (!analysis || analysis.symbol !== passport.instrument.symbol) return result('UNRESOLVED', 'Waiting for the hypothesis evidence.', 'The investigator has not returned a same-symbol observation.', 'Wait for the investigator or refresh this instrument.')
  if (passport.tokenQuoteAge > 120 || !Number.isFinite(passport.tokenQuoteAge)) return result('UNRESOLVED', 'The token observation is too old to test a current claim.', 'A stale token price cannot establish a live repricing or gap.', 'Retrieve a fresh token observation.', ids('token'))
  if (kind === 'news') {
    const move = analysis.metrics.move
    if (!move.detected && (move.candlesUsed ?? 0) >= 3) return result('CONTRADICTED', 'The claimed material repricing is absent in this window.', move.reason, 'Specify a different event window or revisit the short-term catalyst claim.', ids('move'))
    if (!move.detected) return result('UNRESOLVED', 'Too little move evidence to test the catalyst claim.', move.reason, 'Retrieve enough closed candles to establish the event boundary.', ids('move'))
    if (analysis.news?.status !== 'available') return result('UNRESOLVED', 'The news evidence is unavailable.', 'Missing headlines do not establish that news played no role.', 'Recheck a timestamped news source.', ids('news'))
    if (analysis.verdicts.likelyCatalyst.state === 'NEWS_TIMED') return result('SUPPORTED', 'A retrieved headline passes the timing test.', 'Timing supports a candidate explanation, not causation. Inspect its substance and competing explanations before relying on it.', 'Check whether the headline contains genuinely new information.', ids(...analysis.verdicts.likelyCatalyst.evidenceIds))
    const headlines = analysis.verdicts.headlines ?? []
    if (headlines.length && headlines.every((item) => item.timing === 'TIMING_INCONSISTENT')) return result('CONTRADICTED', 'The retrieved headlines came after the move began.', 'These headlines cannot explain the start of the measured move. An unobserved earlier catalyst remains possible.', 'Look for an earlier primary announcement.', ids('move', ...headlines.map((item) => item.id)))
    return result('UNRESOLVED', 'The retrieved record does not establish a news explanation.', analysis.verdicts.likelyCatalyst.detail, 'Find a relevant, timestamped primary announcement before the move.', ids('move', 'news'))
  }
  const gap = researchGap(passport, analysis)
  if (gap === null || !Number.isFinite(gap)) return result('UNRESOLVED', 'No defensible gap is available to test.', 'Both prices and their reference basis are needed.', 'Retrieve an identifiable underlying reference.', ids('reference'))
  if (kind === 'overnight') {
    if (analysis.reference?.kind !== 'reported-close' || analysis.reference.underlyingTradable) return result('OUT_OF_SCOPE', 'This observation is not a closed-market drift.', 'A live-session premium is a different comparison. Historical overnight examples remain background context.', 'Use a closed-market observation for this lens.', ids('session', 'reference'))
    if (Math.abs(gap) < 20) return result('UNRESOLVED', 'No material overnight drift is present.', `The measured gap is ${gap} bps, inside the 20 bps event boundary.`, 'Recheck if a material drift develops.', ids('drift'))
    return result('UNRESOLVED', 'The overnight drift is observable; its follow-through is not.', `The token is ${gap > 0 ? '+' : ''}${gap} bps from the reported close. Historical matches are context, while the underlying session has not confirmed this observation.`, 'Save a checkpoint and recheck whether the gap fades or reverses.', ids('drift', 'reference', 'session'))
  }
  const ref = analysis.reference
  if (!ref?.chosen) return result('UNRESOLVED', 'No underlying quote can test the feed-lag explanation.', 'An unavailable quote cannot be diagnosed as a delayed one.', 'Retrieve a quote with a source timestamp.', ids('reference'))
  if (ref.kind === 'reported-close') return result('OUT_OF_SCOPE', 'A prior close is an expected closed-market reference.', 'Its age is not by itself a feed failure. Test the overnight drift instead.', 'Switch to the overnight lens.', ids('reference', 'session'))
  if (ref.stale) return result('SUPPORTED', 'A stale reference makes the apparent gap inconclusive.', 'Reference age supports the need to reprice the comparison; it does not prove that feed lag caused the gap.', 'Recheck when a fresh same-session underlying quote arrives.', ids('reference'))
  if (Math.abs(gap) >= 20) return result('CONTRADICTED', 'A fresh reference does not support a stale-reference explanation.', 'The gap remains material against a same-session reference reported as fresh. Investigate other explanations.', 'Inspect the spread, move timing and market-specific differences.', ids('reference', 'drift'))
  return result('UNRESOLVED', 'There is no material gap to explain.', `The comparison is ${gap} bps with a fresh reference.`, 'Recheck only if a material gap appears.', ids('reference', 'drift'))
}

export type ConditionMetric = 'manual' | 'gap-within' | 'gap-reversed' | 'reference-fresh' | 'material-move-absent'
export interface ConditionRule { metric: ConditionMetric; thresholdBps: number }
export interface ConditionResult { status: 'TRIGGERED' | 'NOT_TRIGGERED' | 'UNVERIFIABLE'; detail: string }
export const CONDITION_LABELS: Record<ConditionMetric, string> = {
  manual: 'Human review only', 'gap-within': 'Absolute gap falls to or below my threshold',
  'gap-reversed': 'Material gap reverses direction on the same basis',
  'reference-fresh': 'A fresh same-session underlying quote arrives',
  'material-move-absent': 'No material repricing remains in the retrieved window',
}
export const validCondition = (value: unknown): value is ConditionRule => {
  if (!value || typeof value !== 'object') return false
  const rule = value as ConditionRule
  return typeof rule.metric === 'string' && Object.hasOwn(CONDITION_LABELS, rule.metric) && Number.isFinite(rule.thresholdBps) && rule.thresholdBps >= 0 && rule.thresholdBps <= 10000
}
export function evaluateCondition(rule: ConditionRule | undefined, baselineGap: number | null, baselineBasis: string | null, passport: Passport, analysis: MoveAnalysis | null, baselineCloseDate?: string | null): ConditionResult {
  const unknown = (detail: string): ConditionResult => ({ status: 'UNVERIFIABLE', detail })
  const observed = (triggered: boolean, detail: string): ConditionResult => ({ status: triggered ? 'TRIGGERED' : 'NOT_TRIGGERED', detail })
  if (!rule || !validCondition(rule) || rule.metric === 'manual') return unknown('This note requires human review; no machine-evaluable condition was selected.')
  if (passport.mode !== 'live' || !analysis || analysis.symbol !== passport.instrument.symbol) return unknown('A live, same-symbol investigation is required.')
  if (passport.tokenQuoteAge > 120 || !Number.isFinite(passport.tokenQuoteAge)) return unknown('The token observation is stale; the condition cannot be evaluated.')
  if (rule.metric === 'reference-fresh') {
    if (!analysis.reference?.chosen) return unknown('The underlying reference was not retrieved.')
    const age = analysis.reference.chosen.ageSeconds
    const fresh = analysis.reference.kind === 'live-quote' && analysis.reference.underlyingTradable && !analysis.reference.stale && typeof age === 'number' && Number.isFinite(age) && age >= 0 && age <= 120
    return observed(fresh, fresh ? 'A fresh live quote from the underlying session is now observable.' : 'A fresh same-session underlying quote is not yet observable.')
  }
  if (rule.metric === 'material-move-absent') {
    if ((analysis.metrics.move.candlesUsed ?? 0) < 3) return unknown('Too few closed candles to evaluate the repricing condition.')
    return observed(!analysis.metrics.move.detected, analysis.metrics.move.reason)
  }
  const gap = researchGap(passport, analysis)
  if (!Number.isFinite(gap) || gap === null) return unknown('The current gap could not be measured.')
  const currentBasis = analysis.reference?.kind ?? null
  if (!baselineBasis || !currentBasis || baselineBasis !== currentBasis) return unknown('The reference tier changed or is unknown; these gaps are not comparable.')
  if (currentBasis === 'reported-close' && baselineCloseDate && baselineCloseDate !== analysis.reference.closeDateKey) return unknown('The reported-close date changed; these gaps do not share the saved price baseline.')
  if (analysis.reference.stale && currentBasis !== 'reported-close') return unknown('The live underlying reference is stale.')
  if (rule.metric === 'gap-within') return observed(Math.abs(gap) <= rule.thresholdBps, `Absolute gap is ${Math.abs(gap)} bps; your threshold is ${rule.thresholdBps} bps (${currentBasis}).`)
  if (baselineGap === null || !Number.isFinite(baselineGap) || Math.abs(baselineGap) < 20) return unknown('The saved baseline did not contain a material directional gap.')
  return observed(Math.abs(gap) >= 20 && Math.sign(gap) !== Math.sign(baselineGap), `Saved gap ${baselineGap} bps → current gap ${gap} bps on the same reference tier.`)
}
