import { ArrowRight, CircleAlert, CircleCheck, Clock3, FlaskConical, ShieldX } from 'lucide-react'
import { buildDecisionMemo } from '../lib/decision'
import type { MoveAnalysis, Passport } from '../types'

const icon = {
  READY: CircleCheck,
  INVESTIGATE: CircleAlert,
  WAIT: Clock3,
  REJECT_THESIS: ShieldX,
}

export function DecisionMemo({ passport, analysis, onGate, onStress }: {
  passport: Passport
  analysis: MoveAnalysis | null
  onGate: () => void
  onStress: () => void
}) {
  const memo = buildDecisionMemo(passport, analysis)
  const Icon = icon[memo.disposition]

  return <section className={`decision-memo decision-${memo.disposition.toLowerCase()}`} aria-label="Pre-trade decision memo">
    <div className="decision-lead">
      <div className="decision-kicker"><FlaskConical size={14} aria-hidden /> Pre-trade thesis stress test</div>
      <div className="decision-verdict"><Icon size={19} aria-hidden /><span>{memo.label}</span></div>
      <h2>{memo.headline}</h2>
      <p>{memo.rationale}</p>
      <div className="decision-scope"><span>Thesis under test</span><strong>{passport.researchQuestion ?? `Can I trust ${passport.instrument.symbol} right now?`}</strong></div>
    </div>

    <div className="decision-evidence">
      <div><span>What supports it</span>{memo.support.length ? <ul>{memo.support.map((item) => <li key={item.id}><b>{item.label}</b><small>{item.detail}</small></li>)}</ul> : <p>No affirmative check is strong enough to carry the thesis.</p>}</div>
      <div><span>What blocks it</span>{memo.friction.length ? <ul>{memo.friction.map((item) => <li key={item.id}><b>{item.label}</b><small>{item.detail}</small></li>)}</ul> : <p>No blocking check is currently recorded.</p>}</div>
      <div><span>What would change the call</span><ul>{memo.changeConditions.map((condition) => <li key={condition}><small>{condition}</small></li>)}</ul></div>
    </div>

    <div className="decision-actions">
      <button type="button" onClick={onStress}>Stress against history <ArrowRight size={14} aria-hidden /></button>
      <button type="button" onClick={onGate}>Run watchlist gate <ArrowRight size={14} aria-hidden /></button>
    </div>
  </section>
}
