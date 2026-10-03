import { ArrowRight, Bookmark, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { compareCheckpoint, makeCheckpoint, readCheckpoint, removeCheckpoint, saveCheckpoint } from '../lib/checkpoint'
import { buildDecisionMemo } from '../lib/decision'
import { CONDITION_LABELS, THESIS_LABELS, researchGap, type ConditionMetric, type ThesisKind } from '../lib/thesis'
import type { MoveAnalysis, Passport, StudyResult } from '../types'

const timestamp = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC'
const premium = (value: number | null) => value === null ? 'not measured' : `${value > 0 ? '+' : ''}${value} bps`

export function ThesisCheckpoint({ passport, analysis, study, scanning, studyPending, intent = 'integrity', onRescan }: {
  passport: Passport
  analysis: MoveAnalysis | null
  study: StudyResult | null
  scanning: boolean
  studyPending: boolean
  intent?: ThesisKind
  onRescan: (intent?: ThesisKind) => void
}) {
  const symbol = passport.instrument.symbol
  const memo = buildDecisionMemo(passport, analysis, study, intent)
  const [saved, setSaved] = useState(() => readCheckpoint(symbol))
  const [thesis, setThesis] = useState(saved?.thesis ?? '')
  const [condition, setCondition] = useState(saved?.changeCondition ?? '')
  const [selectedConditionMetric, setConditionMetric] = useState<ConditionMetric | null>(saved?.conditionRule?.metric ?? null)
  const conditionMetric = selectedConditionMetric ?? (intent === 'feed' ? 'reference-fresh' : intent === 'overnight' ? 'gap-within' : intent === 'news' ? 'material-move-absent' : 'manual')
  const [thresholdBps, setThresholdBps] = useState(saved?.conditionRule?.thresholdBps ?? 20)
  const [editing, setEditing] = useState(false)
  const [confirmForget, setConfirmForget] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const busy = scanning || studyPending
  const review = saved && !busy ? compareCheckpoint(saved, passport, memo, analysis) : null
  const currentGap = saved?.conditionRule ? researchGap(passport, analysis) : passport.premiumBps

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (passport.mode !== 'live') { setError('Run a live scan before saving a checkpoint.'); return }
    if (busy) { setError('Wait for the live scan and historical context to finish.'); return }
    if (!thesis.trim() || !condition.trim()) { setError('Write both your thesis and the condition that would change your mind.'); return }
    const next = makeCheckpoint(passport, analysis, memo, thesis, condition, new Date().toISOString(), { intent, conditionRule: { metric: conditionMetric, thresholdBps } })
    if (!next || !saveCheckpoint(next)) { setError('This browser could not save the checkpoint. Check storage permissions and try again.'); return }
    setSaved(next)
    setEditing(false)
    setConfirmForget(false)
    setShowAll(false)
    setNote(saved ? 'Baseline replaced with this live scan.' : 'Checkpoint saved in this browser.')
  }

  const forget = () => {
    if (!removeCheckpoint(symbol)) { setError('This browser could not remove the checkpoint. Try again.'); return }
    setSaved(null)
    setThesis('')
    setCondition('')
    setConditionMetric(null)
    setThresholdBps(20)
    setEditing(false)
    setConfirmForget(false)
    setShowAll(false)
    setError('')
    setNote('Checkpoint removed from this browser.')
  }

  const changeRows = review ? [
    ...review.checkChanges.map((item) => ({ ...item, kind: 'Check' })),
    ...review.evidenceChanges.map((item) => ({ ...item, kind: 'Evidence' })),
  ] : []

  return <section className="thesis-checkpoint" aria-label="Thesis checkpoint">
    <div className="checkpoint-heading">
      <div><span className="section-kicker"><Bookmark size={14} aria-hidden /> Research continuity</span><h3>Thesis checkpoint</h3><p>Save what you believe now. Recheck the same instrument later and inspect what actually changed.</p></div>
      <span className="checkpoint-scope">This browser only · no alerts</span>
    </div>

    {saved ? <>
      <div className="checkpoint-saved">
        <div className="checkpoint-saved-head"><strong>Saved baseline</strong><time dateTime={saved.savedAt}>{timestamp(saved.savedAt)}</time></div>
        <div className="checkpoint-thesis"><span>Your thesis</span><p>{saved.thesis}</p></div>
        <div className="checkpoint-thesis"><span>What would change your mind</span><p>{saved.changeCondition}</p></div>
        {saved.intent ? <div className="checkpoint-thesis"><span>Research lens · {THESIS_LABELS[saved.intent]}</span><p>Observable condition: {CONDITION_LABELS[saved.conditionRule?.metric ?? 'manual']}{saved.conditionRule?.metric === 'gap-within' ? ` (${saved.conditionRule.thresholdBps} bps)` : ''}</p></div> : null}
        <div className="checkpoint-baseline"><span>{saved.disposition.replace('_', ' ')} at capture</span><span>{premium(saved.premiumBps)} measured gap</span><span>{saved.checks.length} checks · {saved.evidence.length} evidence records</span></div>
      </div>

      {busy ? <div className="checkpoint-pending" aria-live="polite"><RefreshCw size={16} className="spin" aria-hidden /> Rechecking the live record and historical context. Comparison appears when both finish.</div>
        : review?.ready ? <div className="checkpoint-review" aria-live="polite">
          <div className="checkpoint-review-head"><span>Recheck · {timestamp(passport.scannedAt)}</span><strong>{review.decisionChanged ? 'Desk disposition changed' : 'Desk disposition unchanged'}</strong></div>
          {review.condition ? <div className={`checkpoint-condition condition-${review.condition.status.toLowerCase()}`} role="status"><strong>Your condition · {review.condition.status.replaceAll('_', ' ')}</strong><p>{review.condition.detail}</p></div> : null}
          <div className="checkpoint-delta">
            <div><span>Decision memo</span><strong>{saved.disposition.replace('_', ' ')} <ArrowRight size={14} aria-hidden /> {memo.disposition.replace('_', ' ')}</strong></div>
            <div><span>Measured gap</span><strong>{premium(saved.premiumBps)} <ArrowRight size={14} aria-hidden /> {premium(currentGap)}</strong></div>
          </div>
          {review.referenceChanged ? <div className="checkpoint-reference-change"><span>Reference basis changed</span><p>Before: {saved.referenceBasis ?? 'not specified'}</p><p>Now: {memo.referenceBasis ?? 'not specified'}</p></div> : null}
          <p className="checkpoint-diff-count">{review.checkChanges.length} check changes · {review.evidenceChanges.length} evidence changes{review.premiumDeltaBps === null ? '' : ` · gap ${review.premiumDeltaBps > 0 ? '+' : ''}${review.premiumDeltaBps} bps`}</p>
          {review.gapComparisonIssue ? <p className="checkpoint-caveat checkpoint-gap-unavailable" role="status">Gap comparison unavailable: {review.gapComparisonIssue} The two measured gaps above are separate observations, not a comparable change.</p> : null}
          {changeRows.length ? <>
            <ul className="checkpoint-change-list">{changeRows.slice(0, showAll ? undefined : 4).map((item) => <li key={`${item.kind}-${item.id}`}><span>{item.kind} · {item.title}</span><small>Before: {item.before}</small><small>Now: {item.after}</small></li>)}</ul>
            {changeRows.length > 4 ? <button type="button" className="checkpoint-text-button" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer changes' : `Show all ${changeRows.length} changes`}</button> : null}
          </> : <p className="checkpoint-no-change">No check state or evidence content changed between these two scans.</p>}
          <p className="checkpoint-caveat">The selected observable condition is evaluated against this recheck. Your free-text note and investment thesis still require human judgment.</p>
        </div> : <div className="checkpoint-pending">{passport.mode === 'snapshot' ? 'The page opened on a labelled demonstration snapshot. Run a live scan to compare it with your saved baseline.' : 'This is the scan the baseline was saved from. Run a new scan to see a before-and-after comparison.'}</div>}

      <div className="checkpoint-actions">
        <button type="button" className="checkpoint-primary" onClick={() => onRescan(saved.intent)} disabled={scanning}><RotateCcw size={15} aria-hidden /> Recheck this thesis</button>
        <button type="button" onClick={() => { setEditing((value) => !value); setConfirmForget(false); setError('') }}>{editing ? 'Cancel replacement' : 'Replace baseline'}</button>
        <button type="button" className="checkpoint-danger" onClick={() => { if (confirmForget) forget(); else { setConfirmForget(true); setEditing(false) } }}><Trash2 size={14} aria-hidden /> {confirmForget ? 'Confirm removal' : 'Forget'}</button>
        {confirmForget ? <button type="button" onClick={() => setConfirmForget(false)}>Keep checkpoint</button> : null}
      </div>
    </> : null}

    {(!saved || editing) ? <form className="checkpoint-form" onSubmit={save}>
      <div className="checkpoint-fields">
        <div><label htmlFor="checkpoint-thesis">Your thesis</label><textarea id="checkpoint-thesis" value={thesis} onChange={(event) => setThesis(event.target.value)} maxLength={500} rows={3} placeholder="e.g. This overnight gap reflects new information, not feed lag." aria-invalid={Boolean(error && !thesis.trim())} aria-describedby={error ? 'checkpoint-error' : 'checkpoint-hint'} /></div>
        <div><label htmlFor="checkpoint-condition">What would change your mind?</label><textarea id="checkpoint-condition" value={condition} onChange={(event) => setCondition(event.target.value)} maxLength={300} rows={3} placeholder={memo.changeConditions[0] ?? 'e.g. The underlying opens and does not confirm the gap.'} aria-invalid={Boolean(error && !condition.trim())} aria-describedby={error ? 'checkpoint-error' : 'checkpoint-hint'} /></div>
      </div>
      <div className={`checkpoint-rule${conditionMetric === 'gap-within' ? ' has-threshold' : ''}`}><div><label htmlFor="checkpoint-rule">Observable condition to evaluate on recheck</label><select id="checkpoint-rule" value={conditionMetric} onChange={(event) => setConditionMetric(event.target.value as ConditionMetric)}>{Object.entries(CONDITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{conditionMetric === 'gap-within' ? <div><label htmlFor="checkpoint-threshold">Absolute gap threshold (bps)</label><input id="checkpoint-threshold" type="number" min={0} max={10000} step={1} value={thresholdBps} onChange={(event) => setThresholdBps(Number(event.target.value))} required /></div> : null}</div>
      <p className="checkpoint-hint" id="checkpoint-hint">A checkpoint captures this live scan's verdict, checks, and source summaries. The selected condition is testable; your free-text thesis remains a human judgment. It stays on this device; clearing browser data removes it.</p>
      {!saved && busy && passport.mode === 'live' ? <p className="checkpoint-pending" aria-live="polite"><RefreshCw size={16} className="spin" aria-hidden /> Wait for the investigator and historical context before saving this baseline.</p> : null}
      {error ? <p className="checkpoint-error" id="checkpoint-error" role="alert">{error}</p> : null}
      <button type="submit" className="checkpoint-primary" disabled={busy || passport.mode !== 'live'}><Bookmark size={15} aria-hidden /> {saved ? 'Confirm new baseline' : 'Save live checkpoint'}</button>
      {passport.mode !== 'live' ? <button type="button" className="checkpoint-text-button" onClick={() => onRescan(intent)} disabled={scanning}>Run live scan first <ArrowRight size={13} aria-hidden /></button> : null}
    </form> : null}
    {saved && !editing && error ? <p className="checkpoint-error" role="alert">{error}</p> : null}
    {note ? <p className="checkpoint-note" role="status">{note}</p> : null}
  </section>
}
