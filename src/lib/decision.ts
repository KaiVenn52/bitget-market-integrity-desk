import type { CheckState, MoveAnalysis, Passport, StudyResult } from '../types'

export type DeskDisposition = 'READY' | 'INVESTIGATE' | 'WAIT' | 'REJECT_THESIS'

/** The historical base rate, carried into the decision instead of one click away from it. */
export interface DecisionBaseRate {
  headline: string
  detail: string
  sampleSize: number
  confirmationRate: number | null
  tone: string
  targetDriftBps: number | null
}

export interface DecisionMemoData {
  disposition: DeskDisposition
  label: string
  headline: string
  rationale: string
  /** How the underlying reference was obtained, and therefore what a gap against it means. */
  referenceBasis: string | null
  support: { id: string; label: string; detail: string; state: CheckState }[]
  friction: { id: string; label: string; detail: string; state: CheckState }[]
  /** What is not yet known that the decision is waiting on. */
  missingConfirmation: string[]
  changeConditions: string[]
  baseRate: DecisionBaseRate | null
}

const dispositionCopy: Record<DeskDisposition, { label: string; headline: string }> = {
  READY: { label: 'Ready for human review', headline: 'The observable market state clears the desk checks.' },
  INVESTIGATE: { label: 'Investigate', headline: 'The thesis has unresolved evidence that needs review.' },
  WAIT: { label: 'Wait for confirmation', headline: 'A required reference is missing, stale, or internally inconsistent.' },
  REJECT_THESIS: { label: 'Reject current thesis', headline: 'There is no measured repricing event to explain.' },
}

// When the underlying cannot trade, the desk's reference is deliberately two-tier: the
// last official close IS the correct basis, and a large quote age is expected rather than
// a defect. The gate says exactly that. The memo used to say the opposite — it reported
// the prior close as a stale reference and told the trader the data was broken, during
// the overnight scenario the whole desk exists for.
const closedMarketCopy: { label: string; headline: string } = {
  label: 'Wait for the underlying session',
  headline: 'The underlying cannot reprice yet, so the token is trading on its own information.',
}

const unique = (items: string[]) => [...new Set(items.filter(Boolean))]

function baseRateOf(study: StudyResult | null): DecisionBaseRate | null {
  // An empty sample is not a base rate. The desk refuses to extrapolate from one, so the
  // memo shows nothing rather than a sentence that looks like a statistic.
  if (!study?.available || !study.stats?.episodes || !study.verdict?.headline) return null
  return {
    headline: study.verdict.headline,
    detail: study.verdict.detail,
    sampleSize: study.stats.episodes,
    confirmationRate: study.stats.confirmationRate,
    tone: study.verdict.tone ?? 'unknown',
    targetDriftBps: study.target?.driftBps ?? null,
  }
}

export function buildDecisionMemo(passport: Passport, analysis: MoveAnalysis | null, study: StudyResult | null = null): DecisionMemoData {
  const failed = passport.checks.filter((check) => check.state === 'fail')
  const cautions = passport.checks.filter((check) => check.state === 'caution')
  const unknown = passport.checks.filter((check) => check.state === 'unknown')
  const referenceFailure = failed.some((check) => /fresh|session|align|reference/i.test(`${check.id} ${check.title}`))

  // Analysis identifies the selected tier; the deterministic study also knows whether
  // the underlying can trade and usually returns first. Either source is enough to stop
  // the memo from mislabelling a legitimate prior close as broken data.
  const reportedClose = analysis?.reference?.kind === 'reported-close'
    || analysis?.reference?.underlyingTradable === false
    || study?.current?.underlyingTradable === false
  const referenceIsFreshnessCheck = (check: { id: string; title: string }) => /fresh|reference/i.test(`${check.id} ${check.title}`)

  let disposition: DeskDisposition
  if (passport.state === 'UNVERIFIABLE' || referenceFailure) disposition = 'WAIT'
  else if (analysis?.verdicts.likelyCatalyst.state === 'NO_MATERIAL_MOVE') disposition = 'REJECT_THESIS'
  else if (passport.state === 'CAUTION' || failed.length || cautions.length) disposition = 'INVESTIGATE'
  else disposition = 'READY'

  const support = passport.checks
    .filter((check) => check.state === 'pass')
    .slice(0, 3)
    .map((check) => ({ id: check.id, label: check.title, detail: check.result, state: check.state }))

  // A prior close is not a blocked check when the market is shut, so the freshness entry
  // is described as the basis rather than listed as friction. The gate agrees, and a memo
  // that disagreed with the gate would be worse than either alone.
  const frictionSource = reportedClose ? [...failed, ...cautions, ...unknown].filter((check) => !referenceIsFreshnessCheck(check)) : [...failed, ...cautions, ...unknown]
  const friction = frictionSource
    .slice(0, 3)
    .map((check) => reportedClose && /align/i.test(`${check.id} ${check.title}`)
      ? {
        id: check.id,
        label: 'Closed-market drift',
        detail: passport.premiumBps == null
          ? 'The token moved while the underlying was unable to reprice.'
          : `${passport.premiumBps >= 0 ? '+' : ''}${Math.round(passport.premiumBps)} bps from the reported prior close.`,
        state: check.state,
      }
      : { id: check.id, label: check.title, detail: check.result, state: check.state })

  const referenceBasis = analysis?.reference?.note
    ?? (reportedClose ? 'The underlying market is closed. The gap is measured against its reported prior close, not misrepresented as a live quote.' : null)

  const missingConfirmation = unique([
    ...unknown.map((check) => `${check.title} was not observable: ${check.detail}`),
    ...(reportedClose ? ['A live quote from the underlying session that confirms or denies the token-side gap.'] : []),
    ...(analysis && analysis.verdicts.likelyCatalyst.state !== 'NEWS_TIMED' && analysis.verdicts.headlines?.length
      ? ['A headline that can be timed to the move rather than merely published near it.']
      : []),
  ]).slice(0, 3)

  const modelConditions = analysis?.verdicts.whatWouldChange ?? []
  const changeConditions = unique([...modelConditions, passport.researchAction]).slice(0, 3)

  const rationale = disposition === 'REJECT_THESIS'
    ? analysis?.metrics.move.reason ?? 'No move crossed the desk event threshold.'
    : disposition === 'WAIT'
      ? reportedClose
        ? referenceBasis ?? passport.brief
        : failed[0]?.detail ?? passport.brief
      : disposition === 'INVESTIGATE'
        ? cautions[0]?.detail ?? failed[0]?.detail ?? passport.brief
        : passport.brief

  const copy = disposition === 'WAIT' && reportedClose ? closedMarketCopy : dispositionCopy[disposition]

  return {
    disposition,
    ...copy,
    rationale,
    referenceBasis,
    support,
    friction,
    missingConfirmation,
    changeConditions,
    baseRate: baseRateOf(study),
  }
}
