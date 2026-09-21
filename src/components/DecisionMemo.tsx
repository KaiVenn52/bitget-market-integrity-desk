import { ArrowRight, CircleAlert, CircleCheck, Clock3, FlaskConical, History, ShieldX } from 'lucide-react'
import { buildDecisionMemo } from '../lib/decision'
import type { MoveAnalysis, Passport, StudyResult } from '../types'

const icon = {
  READY: CircleCheck,
  INVESTIGATE: CircleAlert,
  WAIT: Clock3,
  REJECT_THESIS: ShieldX,
}

export function DecisionMemo({ passport, analysis, study, studyPending, onGate, onStress }: {
  passport: Passport
  analysis: MoveAnalysis | null
  study: StudyResult | null
  studyPending: boolean
  onGate: () => void
  onStress: () => void
}) {
  const memo = buildDecisionMemo(passport, analysis, study)
  const Icon = icon[memo.disposition]

  return <section className={`decision-memo decision-${memo.disposition.toLowerCase()}`} aria-label="Pre-trade decision memo">
    <div className="decision-lead">
      <div className="decision-kicker"><FlaskConical size={14} aria-hidden /> Pre-trade thesis stress test</div>
      <div className="decision-verdict"><Icon size={19} aria-hidden /><span>{memo.label}</span></div>
      <h2>{memo.headline}</h2>
      <p>{memo.rationale}</p>
      <div className="decision-scope"><span>Thesis under test</span><strong>{passport.researchQuestion ?? `Can I trust ${passport.instrument.symbol} right now?`}</strong></div>
      {memo.referenceBasis ? <div className="decision-basis"><span>What the gap is measured against</span><strong>{memo.referenceBasis}</strong></div> : null}
    </div>

    {/* The stress result belongs in the decision, not one click away from it: the
        sub-theme is decision stress testing, and a base rate the trader has to go
        looking for is not part of the call. */}
    {memo.baseRate ? <div className={`decision-baserate tone-${memo.baseRate.tone}`}>
      <div className="baserate-head"><History size={14} aria-hidden /><span>Historical base rate</span>
        <em>{memo.baseRate.sampleSize} comparable {memo.baseRate.sampleSize === 1 ? 'window' : 'windows'}{memo.baseRate.confirmationRate === null ? '' : ` · ${memo.baseRate.confirmationRate}% same direction`}</em>
      </div>
      <strong>{memo.baseRate.headline}</strong>
      <small>{memo.baseRate.detail}</small>
      <button type="button" className="baserate-more" onClick={onStress}>See every matched window <ArrowRight size={12} aria-hidden /></button>
    </div> : studyPending ? <div className="decision-baserate is-loading" aria-live="polite">
      <div className="baserate-head"><History size={14} aria-hidden /><span>Historical base rate</span><em>Matching comparable windows…</em></div>
      <small>The decision is usable now. Historical context will attach when the deterministic study finishes.</small>
    </div> : null}

    <div className="decision-evidence">
      <div><span>What supports it</span>{memo.support.length ? <ul>{memo.support.map((item) => <li key={item.id}><b>{item.label}</b><small>{item.detail}</small></li>)}</ul> : <p>No affirmative check is strong enough to carry the thesis.</p>}</div>
      <div><span>What blocks it</span>{memo.friction.length ? <ul>{memo.friction.map((item) => <li key={item.id}><b>{item.label}</b><small>{item.detail}</small></li>)}</ul> : <p>No blocking check is currently recorded.</p>}</div>
      <div><span>What is still missing</span>{memo.missingConfirmation.length ? <ul>{memo.missingConfirmation.map((item) => <li key={item}><small>{item}</small></li>)}</ul> : <p>Nothing required by the current call is outstanding.</p>}</div>
      <div><span>What would change the call</span><ul>{memo.changeConditions.map((condition) => <li key={condition}><small>{condition}</small></li>)}</ul></div>
    </div>

    <div className="decision-actions">
      <button type="button" onClick={onStress}>Stress against history <ArrowRight size={14} aria-hidden /></button>
      <button type="button" onClick={onGate}>Run watchlist gate <ArrowRight size={14} aria-hidden /></button>
    </div>
  </section>
}
