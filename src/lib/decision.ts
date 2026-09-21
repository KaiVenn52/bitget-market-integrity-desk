import type { CheckState, MoveAnalysis, Passport } from '../types'

export type DeskDisposition = 'READY' | 'INVESTIGATE' | 'WAIT' | 'REJECT_THESIS'

export interface DecisionMemoData {
  disposition: DeskDisposition
  label: string
  headline: string
  rationale: string
  support: { id: string; label: string; detail: string; state: CheckState }[]
  friction: { id: string; label: string; detail: string; state: CheckState }[]
  changeConditions: string[]
}

const dispositionCopy: Record<DeskDisposition, { label: string; headline: string }> = {
  READY: { label: 'Ready for human review', headline: 'The observable market state clears the desk checks.' },
  INVESTIGATE: { label: 'Investigate', headline: 'The thesis has unresolved evidence that needs review.' },
  WAIT: { label: 'Wait for confirmation', headline: 'A required reference is missing, stale, or internally inconsistent.' },
  REJECT_THESIS: { label: 'Reject current thesis', headline: 'There is no measured repricing event to explain.' },
}

const unique = (items: string[]) => [...new Set(items.filter(Boolean))]

export function buildDecisionMemo(passport: Passport, analysis: MoveAnalysis | null): DecisionMemoData {
  const failed = passport.checks.filter((check) => check.state === 'fail')
  const cautions = passport.checks.filter((check) => check.state === 'caution')
  const unknown = passport.checks.filter((check) => check.state === 'unknown')
  const referenceFailure = failed.some((check) => /fresh|session|align|reference/i.test(`${check.id} ${check.title}`))

  let disposition: DeskDisposition
  if (passport.state === 'UNVERIFIABLE' || referenceFailure) disposition = 'WAIT'
  else if (analysis?.verdicts.likelyCatalyst.state === 'NO_MATERIAL_MOVE') disposition = 'REJECT_THESIS'
  else if (passport.state === 'CAUTION' || failed.length || cautions.length) disposition = 'INVESTIGATE'
  else disposition = 'READY'

  const support = passport.checks
    .filter((check) => check.state === 'pass')
    .slice(0, 3)
    .map((check) => ({ id: check.id, label: check.title, detail: check.result, state: check.state }))

  const friction = [...failed, ...cautions, ...unknown]
    .slice(0, 3)
    .map((check) => ({ id: check.id, label: check.title, detail: check.result, state: check.state }))

  const modelConditions = analysis?.verdicts.whatWouldChange ?? []
  const changeConditions = unique([...modelConditions, passport.researchAction]).slice(0, 3)
  const rationale = disposition === 'REJECT_THESIS'
    ? analysis?.metrics.move.reason ?? 'No move crossed the desk event threshold.'
    : disposition === 'WAIT'
      ? failed[0]?.detail ?? passport.brief
      : disposition === 'INVESTIGATE'
        ? cautions[0]?.detail ?? failed[0]?.detail ?? passport.brief
        : passport.brief

  return { disposition, ...dispositionCopy[disposition], rationale, support, friction, changeConditions }
}
