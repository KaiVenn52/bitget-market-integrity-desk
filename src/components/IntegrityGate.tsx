import { AlertOctagon, ArrowRight, CheckCircle2, History, PauseCircle, RefreshCw, ScanLine, ShieldCheck, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { appendDeskLog, clearDeskLog, logStats, readDeskLog, toLogEntry } from '../lib/desklog'
import { runSweep } from '../services/sweep'
import type { DeskLogEntry, GateDecision, SweepEntry, SweepResult } from '../types'

const tone: Record<GateDecision, string> = { CLEAR: 'pass', INVESTIGATE: 'caution', WAIT: 'unknown', BLOCKED: 'fail' }

const decisionLabel: Record<GateDecision, string> = {
  CLEAR: 'Clear',
  INVESTIGATE: 'Investigate',
  WAIT: 'Wait',
  BLOCKED: 'Blocked',
}

const clock = (iso: string) => `${iso.slice(11, 16)} UTC`
const bpsText = (value: number | null | undefined) => (value === null || value === undefined ? 'n/a' : `${value > 0 ? '+' : ''}${value} bps`)

function DecisionIcon({ decision }: { decision: GateDecision }) {
  if (decision === 'BLOCKED') return <AlertOctagon size={16} aria-hidden />
  if (decision === 'WAIT') return <PauseCircle size={16} aria-hidden />
  if (decision === 'INVESTIGATE') return <ScanLine size={16} aria-hidden />
  return <CheckCircle2 size={16} aria-hidden />
}

function EntryCard({ entry, onInspect }: { entry: SweepEntry; onInspect: (symbol: string) => void }) {
  const [open, setOpen] = useState(false)
  const { gate, metrics } = entry
  return <article className={`gate-entry gate-${tone[gate.decision]}`}>
    <button className="gate-entry-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className={`gate-badge gate-badge-${tone[gate.decision]}`}><DecisionIcon decision={gate.decision} />{decisionLabel[gate.decision]}</span>
      <span className="gate-entry-title"><b>{entry.symbol}</b><span>{entry.company} · {entry.sessionLabel}</span></span>
      <span className="gate-entry-headline">{gate.headline}</span>
      <code className="gate-code">{gate.code}</code>
    </button>
    {open ? <div className="gate-entry-body">
      <p className="gate-reason">{gate.reason}</p>
      <dl className="gate-metrics">
        <div><dt>Premium</dt><dd>{bpsText(entry.premiumBps)} <small>({entry.alignmentState})</small></dd></div>
        <div><dt>Reference</dt><dd>{entry.referencePrice ?? 'unavailable'}<small>{gate.referenceKind === 'official-close' ? 'last official close' : gate.referenceKind === 'live-quote' ? 'live authenticated quote' : entry.referenceStale ? 'cannot confirm' : 'unclassified'}</small></dd></div>
        <div><dt>Drift</dt><dd>{metrics ? `${bpsText(metrics.drift.currentBps)} ${metrics.drift.trend}` : 'not computed'}</dd></div>
        <div><dt>Turnover</dt><dd>{metrics?.turnover.ratio == null ? 'not computed' : `${metrics.turnover.ratio}× baseline`}</dd></div>
        <div><dt>Top-of-book</dt><dd>{metrics?.spread.spreadBps == null ? 'not published' : `${metrics.spread.spreadBps} bps`}</dd></div>
        <div><dt>Repricing</dt><dd>{metrics?.move.detected ? `${bpsText(metrics.move.moveBps)} / ${metrics.move.windowMinutes}m` : 'below threshold'}</dd></div>
      </dl>
      <div className="gate-columns">
        <div>
          <h4>Evidence this verdict cites</h4>
          <ul className="gate-evidence">{gate.evidenceIds.map((id) => {
            const item = entry.evidence.find((candidate) => candidate.id === id)
            return <li key={id}><code>{id}</code><span>{item ? item.summary : 'Not held by this sweep.'}</span><small>{item ? `${item.source} · ${item.endpoint}` : ''}</small></li>
          })}</ul>
        </div>
        <div>
          <h4>What would change this verdict</h4>
          <ul className="gate-conditions">{gate.conditions.map((item) => <li key={item}>{item}</li>)}</ul>
          <h4>Next research step</h4>
          <p className="gate-next">{gate.nextStep}</p>
          <button className="gate-inspect" onClick={() => onInspect(entry.symbol)}>Open {entry.symbol} in the Desk <ArrowRight size={14} aria-hidden /></button>
        </div>
      </div>
      {entry.sourceErrors.length ? <p className="gate-sources">Source notes: {entry.sourceErrors.join(' · ')}</p> : null}
    </div> : null}
  </article>
}

function LogRow({ run }: { run: DeskLogEntry }) {
  return <li className={`log-row log-${tone[run.worst]}`}>
    <span className={`gate-badge gate-badge-${tone[run.worst]}`}><DecisionIcon decision={run.worst} />{decisionLabel[run.worst]}</span>
    <span className="log-time">{clock(run.ranAt)}<small>{run.sweepLabel}</small></span>
    <span className="log-detail"><b>{run.headline}</b><small>{run.verdicts.map((verdict) => `${verdict.symbol.replace('USDT', '')} ${verdict.decision}`).join(' · ')}</small></span>
  </li>
}

export function IntegrityGate({ onInspect }: { onInspect: (symbol: string) => void }) {
  const [result, setResult] = useState<SweepResult | null>(null)
  const [log, setLog] = useState<DeskLogEntry[]>(() => readDeskLog())
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState('The gate sweeps all four supported instruments. It never places an order.')

  const sweep = useCallback(async () => {
    setRunning(true)
    const next = await runSweep(setNote)
    if (next) {
      setResult(next)
      setLog(appendDeskLog(toLogEntry(next)))
    }
    setRunning(false)
  }, [])

  const stats = logStats(log)

  return <main className="content-view gate-view">
    <div className="view-heading">
      <div>
        <h1>Pre-trade integrity gate</h1>
        <p>The desk gates its own watchlist and writes down what it refused. AI presents the analysis; the human makes the decision.</p>
      </div>
      <button className="scan-button" onClick={() => void sweep()} disabled={running}>
        {running ? <RefreshCw className="spin" size={16} /> : <ShieldCheck size={16} />}
        <span>{running ? 'Gating watchlist' : 'Run integrity sweep'}</span>
      </button>
    </div>

    <p className="gate-note" aria-live="polite">{note}</p>

    {result ? <section className="panel gate-summary" aria-label="Sweep summary">
      <div className={`gate-verdict verdict-${tone[result.summary.worst]}`}>
        <DecisionIcon decision={result.summary.worst} />
        <div>
          <strong>{result.summary.headline}</strong>
          <p>{result.summary.detail}</p>
        </div>
      </div>
      <dl className="gate-counts">
        {(['BLOCKED', 'WAIT', 'INVESTIGATE', 'CLEAR'] as GateDecision[]).map((decision) => <div key={decision} className={`gate-count count-${tone[decision]}`}>
          <dt>{decisionLabel[decision]}</dt><dd>{result.summary.counts[decision]}</dd>
        </div>)}
      </dl>
      {result.summary.integrityWarning ? <p className="gate-warning">Self-check: {result.summary.integrityWarning}</p> : null}
      <small>Measured {clock(result.ranAt)} · {result.mode} sources · {result.reasoningMode === 'rules' ? 'deterministic rules only, no model call' : 'model-assisted'}</small>
    </section> : null}

    {result ? <section className="gate-entries" aria-label="Per-instrument verdicts">
      {result.entries.map((entry) => <EntryCard key={entry.symbol} entry={entry} onInspect={onInspect} />)}
    </section> : null}

    <section className="panel gate-log" aria-label="Desk log">
      <div className="gate-log-head">
        <div>
          <h2><History size={15} aria-hidden /> Desk log</h2>
          <p>Every sweep this browser has run, including the ones that refused. Stored locally; the desk holds no positions and places no orders.</p>
        </div>
        {log.length ? <button className="gate-clear" onClick={() => setLog(clearDeskLog())}><Trash2 size={13} aria-hidden /> Clear</button> : null}
      </div>
      {log.length ? <>
        <dl className="gate-counts">
          <div className="gate-count count-unknown"><dt>Sweeps</dt><dd>{stats.runs}</dd></div>
          <div className="gate-count count-fail"><dt>Blocked</dt><dd>{stats.counts.BLOCKED}</dd></div>
          <div className="gate-count count-unknown"><dt>Waited</dt><dd>{stats.counts.WAIT}</dd></div>
          <div className="gate-count count-caution"><dt>Investigate</dt><dd>{stats.counts.INVESTIGATE}</dd></div>
          <div className="gate-count count-pass"><dt>Clear</dt><dd>{stats.counts.CLEAR}</dd></div>
        </dl>
        <p className="gate-refusal">The gate withheld a clear verdict on <b>{stats.refusals}</b> of {stats.total} instrument observations ({stats.refusalRate}%). A refusal is a recorded outcome, not a failure.</p>
        <ul className="log-rows">{log.map((run) => <LogRow key={run.ranAt} run={run} />)}</ul>
      </> : <p className="gate-empty">No sweep has been run from this browser yet.</p>}
    </section>
  </main>
}
