import { BarChart3, Clock, History, RefreshCw, ScanLine, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { runStudy } from '../services/study'
import type { StudyResult } from '../types'

const SYMBOLS = ['rTSLAUSDT', 'rNVDAUSDT', 'rAAPLUSDT', 'rQQQUSDT']

const tone = (value: string | undefined) => (value === 'consistent' ? 'pass' : value === 'unreliable' ? 'fail' : value === 'mixed' ? 'caution' : 'unknown')
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
const bps = (value: number | null | undefined) => (value === null || value === undefined ? 'n/a' : `${value > 0 ? '+' : ''}${value} bps`)

const OUTCOME_LABEL: Record<string, string> = { confirmed: 'same way', contradicted: 'against it', flat: 'closed flat', unknown: 'unmeasurable' }
const OUTCOME_TONE: Record<string, string> = { confirmed: 'pass', contradicted: 'fail', flat: 'unknown', unknown: 'unknown' }

function EpisodeRow({ item }: { item: StudyResult['matched'][number] }) {
  // A session that closed inside the alignment threshold is not support for the
  // drift, so it gets its own label rather than being counted as agreement. The
  // outcome is computed in the study module so the table and the totals cannot
  // disagree about the same episode.
  const outcome = item.outcome
  const used = item.usedSource === 'underlying' ? item.underlyingResolutionBps : item.resolutionBps
  const usedError = item.usedSource === 'underlying' ? item.underlyingErrorBps : item.errorBps
  return <tr>
    <td>{day(item.anchorMs)}<small>{item.windowHours}h closed</small></td>
    <td className="num">{bps(item.matchedDriftBps)}<small>at {item.matchedStageHours}h in</small></td>
    <td className="num">{bps(item.resolutionBps)}</td>
    <td className="num">{item.underlyingResolutionBps === null ? '—' : bps(item.underlyingResolutionBps)}</td>
    <td><span className={`timing-badge timing-${OUTCOME_TONE[outcome] ?? 'unknown'}`}>{OUTCOME_LABEL[outcome] ?? outcome}</span><small>measured on {item.usedSource} · {bps(used)}</small></td>
    <td className="num">{usedError ?? item.errorBps} bps</td>
  </tr>
}

export function StressTest({ symbol, onSymbol }: { symbol: string; onSymbol: (next: string) => void }) {
  const [result, setResult] = useState<StudyResult | null>(null)
  const [note, setNote] = useState('Retrieving closed-market history.')
  const [loadedSymbol, setLoadedSymbol] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)

  // Loading is derived rather than assigned: a result that does not belong to the
  // instrument on screen is not a result yet, so no effect has to set a flag.
  const running = busy || loadedSymbol !== symbol

  const applyResult = useCallback((next: string, payload: StudyResult | null) => {
    setResult(payload)
    setLoadedSymbol(next)
    setBusy(false)
  }, [])

  const rerun = useCallback((next: string) => {
    setBusy(true)
    void runStudy(next, undefined, setNote).then((payload) => applyResult(next, payload))
  }, [applyResult])

  // The instrument on screen is the only one whose result may be shown, so a
  // response that arrives after the user has already switched is discarded.
  useEffect(() => {
    let cancelled = false
    void runStudy(symbol, undefined, setNote).then((payload) => {
      if (!cancelled) applyResult(symbol, payload)
    })
    return () => { cancelled = true }
  }, [symbol, applyResult])

  return <main className="content-view study-view">
    <div className="view-heading">
      <div>
        <h1>Historical stress test</h1>
        <p>When this token drifted like this before, what did the following session actually do? A base rate with its sample size attached — not a forecast.</p>
      </div>
      <button className="scan-button" onClick={() => rerun(symbol)} disabled={running}>
        {running ? <RefreshCw className="spin" size={16} /> : <History size={16} />}
        <span>{running ? 'Testing' : 'Re-run test'}</span>
      </button>
    </div>

    <div className="study-symbols" role="group" aria-label="Instrument">
      {SYMBOLS.map((item) => <button key={item} className={item === symbol ? 'active' : ''} onClick={() => onSymbol(item)} disabled={running}>{item.replace('USDT', '')}</button>)}
    </div>
    <p className="gate-note" aria-live="polite">{note}</p>

    {!result && !running ? <section className="panel limitations" aria-label="Stress test unavailable">
      <h2><TriangleAlert size={15} aria-hidden /> The stress test could not be completed</h2>
      <p className="study-sub">{note} The desk reports the failure rather than showing a partial result, because a base rate computed from a partial sample would misrepresent how much history was actually retrieved.</p>
      <button className="gate-inspect" onClick={() => rerun(symbol)}>Try again for {symbol}</button>
    </section> : null}

    {result ? <>
      <section className="panel study-summary" aria-label="Stress test verdict">
        <div className={`gate-verdict verdict-${tone(result.verdict.tone)}`}>
          {result.verdict.tone === 'unreliable' ? <TriangleAlert size={16} aria-hidden /> : <BarChart3 size={16} aria-hidden />}
          <div>
            <strong>{result.verdict.headline}</strong>
            <p>{result.verdict.detail}</p>
          </div>
        </div>

        <dl className="study-facts">
          <div><dt>Drift tested</dt><dd>{bps(result.target.driftBps)}<small>{result.target.source}</small></dd></div>
          <div><dt>Band</dt><dd>±{result.target.bandBps} bps<small>minimum {result.target.minWindowHours}h window</small></dd></div>
          <div><dt>Episodes built</dt><dd>{result.coverage.episodes}<small>{result.coverage.resolved} with a following session</small></dd></div>
          <div><dt>Yahoo closes</dt><dd>{result.coverage.withUnderlying}<small>{result.coverage.withUnderlying ? 'underlying outcomes measured' : 'rToken resolution used'}</small></dd></div>
        </dl>

        <p className="study-context">{result.target.context}</p>
      </section>

      <section className="panel study-distribution" aria-label="Drift distribution">
        <h2><ScanLine size={15} aria-hidden /> What closed-market drift looks like on this instrument</h2>
        <p className="study-sub">Every closed-market hourly observation in the retrieved window, measured against the last session close. {result.distribution.observations} observations from {result.lookback.candles} candles ({day(Date.parse(result.lookback.from))} to {day(Date.parse(result.lookback.to))}).</p>
        <dl className="gate-counts">
          <div className="gate-count count-unknown"><dt>Median</dt><dd>{result.distribution.medianAbsBps}<small> bps</small></dd></div>
          <div className="gate-count count-caution"><dt>90th pct</dt><dd>{result.distribution.p90AbsBps}<small> bps</small></dd></div>
          <div className="gate-count count-fail"><dt>Maximum</dt><dd>{result.distribution.maxAbsBps}<small> bps</small></dd></div>
          <div className="gate-count count-pass"><dt>Beyond 20 bps</dt><dd>{result.distribution.aboveThresholdPct}<small>%</small></dd></div>
        </dl>
        <p className="study-sub">Beyond the 100 bps caution threshold: {result.distribution.above100Pct}% of observations. Beyond 200 bps: {result.distribution.above200Pct}%.</p>
      </section>

      <section className="panel study-matched" aria-label="Matched episodes">
        <h2><History size={15} aria-hidden /> Comparable closed-market episodes and what followed</h2>
        <p className="study-sub">Same-direction windows that were within ±{result.target.bandBps} bps of the {bps(result.target.driftBps)} being tested <b>at a moment that was observable while the market was shut</b> — matched on the drift actually on screen at the time, never on the window's peak, which only hindsight reveals. The underlying column is used for the statistics whenever Yahoo-reported closes were retrieved. This describes what already happened rather than testing the desk forward, and it makes no prediction from a sample this small.</p>
        {result.matched.length ? <div className="table-scroll"><table className="study-table">
          <thead><tr><th>Episode</th><th>Observed drift</th><th>rToken next close</th><th>Underlying next close</th><th>Direction</th><th>Error</th></tr></thead>
          <tbody>{result.matched.map((item) => <EpisodeRow key={item.anchorMs} item={item} />)}</tbody>
        </table></div> : <p className="gate-empty">No comparable episode inside the band. The desk does not extrapolate from an empty sample.</p>}

        {result.stats.episodes ? <p className="study-stats">
          Moved the same way <b>{result.stats.confirmed}</b> · moved against it <b>{result.stats.contradicted}</b> · closed flat <b>{result.stats.flat}</b> · median error <b>{result.stats.medianErrorBps} bps</b> · worst error <b>{result.stats.worstErrorBps} bps</b> · measured on <b>{result.stats.source}</b> closes.
        </p> : null}
      </section>

      <section className="panel study-all" aria-label="All episodes">
        <div className="gate-log-head">
          <div>
            <h2><Clock size={15} aria-hidden /> Every closed-market episode retrieved</h2>
            <p>The full sample behind the numbers above, so the result can be audited rather than trusted.</p>
          </div>
          <button className="gate-clear" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Hide' : `Show all ${result.episodes.length}`}</button>
        </div>
        {showAll ? <div className="table-scroll"><table className="study-table">
          <thead><tr><th>Session close</th><th>Window</th><th>Peak drift</th><th>rToken resolution</th><th>Underlying resolution</th></tr></thead>
          <tbody>{result.episodes.map((episode) => <tr key={episode.anchorMs}>
            <td>{stamp(episode.anchorMs)}</td>
            <td className="num">{episode.windowHours}h</td>
            <td className="num">{bps(episode.peakDriftBps)}</td>
            <td className="num">{bps(episode.resolutionBps)}</td>
            <td className="num">{episode.underlyingResolutionBps === null ? '—' : bps(episode.underlyingResolutionBps)}</td>
          </tr>)}</tbody>
        </table></div> : null}
      </section>

      <section className="panel limitations">
        <h2>Declared limits of this study</h2>
        <ul>
          <li>It reports what happened in this sample, not a probability of profit. Nothing here is a forecast or a recommendation.</li>
          <li>The window is {result.lookback.candles} closed hourly candles ({result.coverage.episodes} episodes), which is weeks, not years. No statistical significance is claimed.</li>
          <li>{result.coverage.withUnderlying} of {result.coverage.resolved} resolved episodes had Yahoo-reported underlying closes, a secondary feed not independently checked against the exchange. Where they were missing, the rToken's own session close was used and labelled as such — a proxy, not the underlying itself.</li>
          <li>Excursion figures come from hourly highs and lows, so intra-hour extremes are not captured.</li>
          <li>A drift that resolved the same way before is not evidence that it will again. The gate treats a material drift as unverifiable either way.</li>
        </ul>
        {result.sourceErrors.length ? <p className="gate-sources">Source notes: {result.sourceErrors.join(' · ')}</p> : null}
      </section>
    </> : null}
  </main>
}
