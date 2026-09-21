import { AlertTriangle, CheckCircle2, Clock, Gauge, Newspaper, ShieldQuestion, XCircle } from 'lucide-react'
import type { MoveAnalysis } from '../types'

const catalystTone: Record<string, string> = {
  NEWS_TIMED: 'caution',
  NO_STRONG_CATALYST: 'unknown',
  NO_MATERIAL_MOVE: 'pass',
}

const timingTone: Record<string, string> = {
  POSSIBLE: 'caution',
  POSSIBLE_CONTRIBUTING: 'unknown',
  TIMING_INCONSISTENT: 'unknown',
  DISTANT: 'pass',
  TIME_UNKNOWN: 'unknown',
  NO_MOVE_BOUNDARY: 'unknown',
}

const timingLabel: Record<string, string> = {
  POSSIBLE: 'Possible',
  POSSIBLE_CONTRIBUTING: 'Contributing only',
  TIMING_INCONSISTENT: 'Timing rejected',
  DISTANT: 'Too early',
  TIME_UNKNOWN: 'Time unknown',
  NO_MOVE_BOUNDARY: 'No move boundary',
}

const clock = (ms: number | null | undefined) => (Number.isFinite(ms as number) ? new Date(ms as number).toISOString().slice(11, 16) + ' UTC' : 'time unknown')

export function CatalystPanel({ analysis }: { analysis: MoveAnalysis }) {
  const { verdicts, metrics, reference, news } = analysis
  const catalyst = verdicts.likelyCatalyst
  const tone = catalystTone[catalyst.state] ?? 'unknown'

  return <section className="catalyst-panel" aria-label="Move explanation">
    <div className="catalyst-head">
      <div>
        <span className="eyebrow"><Gauge size={14} /> Move explanation</span>
        <h3>{analysis.symbol} · why it moved</h3>
        <p>{analysis.sessionLabel} · generated {clock(Date.parse(analysis.generatedAt))}</p>
      </div>
      <div className="catalyst-badges">
        <span className={`mode-badge mode-${analysis.reasoningMode}`}>{analysis.reasoningMode === 'qwen' ? 'QWEN' : 'RULES'}</span>
        <span className={`confidence-badge confidence-${verdicts.confidence.level.toLowerCase()}`}>{verdicts.confidence.level} confidence</span>
      </div>
    </div>

    <div className={`catalyst-verdict verdict-${tone}`}>
      {catalyst.state === 'NEWS_TIMED' ? <AlertTriangle size={16} aria-hidden /> : catalyst.state === 'NO_MATERIAL_MOVE' ? <CheckCircle2 size={16} aria-hidden /> : <ShieldQuestion size={16} aria-hidden />}
      <div>
        <strong>{catalyst.title}</strong>
        <p>{catalyst.detail}</p>
        {catalyst.evidenceIds.length ? <div className="citation-row">{catalyst.evidenceIds.map((id) => <code key={id}>{id}</code>)}</div> : null}
      </div>
    </div>

    <dl className="catalyst-metrics">
      <div><dt>Repricing</dt><dd>{metrics.move.detected ? `${metrics.move.direction === 'up' ? '+' : '−'}${Math.abs(metrics.move.moveBps ?? 0)} bps / ${metrics.move.windowMinutes}m` : 'below threshold'}</dd></div>
      <div><dt>{reference.kind === 'reported-close' ? 'Drift vs prior close' : reference.stale ? 'Drift vs unavailable ref' : 'Basis vs live ref'}</dt><dd>{metrics.drift.currentBps === null ? 'not computable' : `${metrics.drift.currentBps} bps · ${metrics.drift.trend}`}</dd></div>
      <div><dt>Turnover</dt><dd>{metrics.turnover.ratio === null ? 'not computable' : `${metrics.turnover.ratio}× baseline`}</dd></div>
      <div><dt>Top-of-book</dt><dd>{metrics.spread.spreadBps === null ? 'not published' : `${metrics.spread.spreadBps} bps`}</dd></div>
    </dl>

    <div className="catalyst-columns">
      <div>
        <h4><CheckCircle2 size={13} aria-hidden /> Supporting evidence</h4>
        <ul>{verdicts.supporting.length ? verdicts.supporting.map((item) => <li key={item.id}><b>{item.label}</b><span>{item.detail}</span></li>) : <li><span>No corroborating market response was observed.</span></li>}</ul>
      </div>
      <div>
        <h4><ShieldQuestion size={13} aria-hidden /> Alternative explanations</h4>
        <ul>{verdicts.alternatives.map((item) => <li key={item.id}><b>{item.label}</b><span>{item.detail}</span></li>)}</ul>
      </div>
    </div>

    {verdicts.rejected.length ? <div className="catalyst-rejected">
      <h4><XCircle size={13} aria-hidden /> Rejected on timing</h4>
      <ul>{verdicts.rejected.map((item) => <li key={item.id}><b>{item.label}</b><span>{item.detail}</span></li>)}</ul>
    </div> : null}

    <div className="catalyst-headlines">
      <h4><Newspaper size={13} aria-hidden /> Headlines retrieved and timed against the move</h4>
      {verdicts.headlines.length ? <ul>{verdicts.headlines.map((item) => <li key={item.id}>
        <span className={`timing-badge timing-${timingTone[item.timing] ?? 'unknown'}`}>{timingLabel[item.timing] ?? item.timing}</span>
        <span className="headline-copy"><b>{item.title}</b><small>{item.publisher} · {clock(item.publishedMs)} · {item.deltaMinutes === null ? 'no move boundary' : `${item.deltaMinutes >= 0 ? `${item.deltaMinutes}m before` : `${Math.abs(item.deltaMinutes)}m after`} the move began`}</small></span>
      </li>)}</ul> : <p className="catalyst-empty">No headline about {analysis.symbol} was retrievable in the lookback window. Absence of a headline is not evidence that none exists, so no catalyst is claimed. {news.note}</p>}
    </div>

    <div className="catalyst-footer">
      <div><h4><Clock size={13} aria-hidden /> Confidence rule</h4><p>{verdicts.confidence.rule}</p></div>
      <div><h4>What would change this conclusion</h4><ul>{verdicts.whatWouldChange.map((item) => <li key={item}>{item}</li>)}</ul></div>
    </div>

    <div className="catalyst-brief">
      <span className="brief-mode">{analysis.reasoningMode === 'qwen' ? 'Qwen narrative · inline IDs resolved, claim support requires review' : 'Deterministic narrative · rules only'}</span>
      <p>{analysis.brief}</p>
      {analysis.briefEvidenceIds.length ? <div className="citation-row">{analysis.briefEvidenceIds.map((id) => <code key={id}>{id}</code>)}</div> : null}
      <small>{analysis.reasoningNote}</small>
    </div>
  </section>
}
