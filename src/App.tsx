import { ArrowRight, RefreshCw, ScanLine, ShieldCheck } from 'lucide-react'
import { startTransition, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { CatalystPanel } from './components/CatalystPanel'
import { EvidenceInspector } from './components/EvidenceInspector'
import { IntegrityGate } from './components/IntegrityGate'
import { JudgeProof } from './components/JudgeProof'
import { Methodology } from './components/Methodology'
import { PassportPanel } from './components/PassportPanel'
import { ReplayLab } from './components/ReplayLab'
import { StressTest } from './components/StressTest'
import { Watchlist } from './components/Watchlist'
import { snapshotFor } from './data/snapshots'
import { resolveInstrument } from './lib/query'
import { runAnalysis } from './services/analyze'
import { runScan } from './services/scan'
import type { MoveAnalysis, Passport } from './types'

type View = 'live' | 'gate' | 'stress' | 'replay' | 'methodology'

const VIEWS: View[] = ['live', 'gate', 'stress', 'replay', 'methodology']

/** Views are deep-linkable so a specific workspace can be shared or cited directly. */
const viewFromHash = (): View => {
  const raw = window.location.hash.replace('#', '').toLowerCase()
  return (VIEWS as string[]).includes(raw) ? (raw as View) : 'live'
}

const catalystNote = (analysis: MoveAnalysis) => analysis.verdicts.likelyCatalyst.state === 'NEWS_TIMED'
  ? 'timing-consistent catalyst found'
  : analysis.verdicts.likelyCatalyst.state === 'NO_STRONG_CATALYST'
    ? 'no timing-consistent catalyst'
    : 'no material repricing'

const completionNote = (result: Passport, analysis: MoveAnalysis | null) => analysis
  ? `${result.mode === 'live' ? 'Live' : 'Snapshot'} passport · ${catalystNote(analysis)} · ${analysis.reasoningMode === 'qwen' ? 'Qwen narrative verified.' : 'deterministic narrative retained.'}`
  : `${result.mode === 'live' ? 'Live' : 'Snapshot'} passport ready · move analysis unavailable.`

export default function App() {
  const [view, setView] = useState<View>(viewFromHash)
  const [symbol, setSymbol] = useState('rNVDAUSDT')
  const [passport, setPassport] = useState<Passport>(() => snapshotFor(symbol))
  const [analysis, setAnalysis] = useState<MoveAnalysis | null>(null)
  const [liveQuotes, setLiveQuotes] = useState<Record<string, Passport['instrument']>>({})
  const [scanning, setScanning] = useState(false)
  const [researchQuestion, setResearchQuestion] = useState('Can I trust rNVDAUSDT right now?')
  const [queryNote, setQueryNote] = useState('Ask about NVDA, AAPL, TSLA, or QQQ.')
  const scanRequest = useRef(0)

  const scan = useCallback(async (nextSymbol: string, question = `Can I trust ${nextSymbol} right now?`) => {
    const requestId = ++scanRequest.current
    setScanning(true)
    setQueryNote('Checking Bitget sources for the integrity passport.')
    const result = await runScan(nextSymbol, question, setQueryNote)
    if (requestId !== scanRequest.current) return
    startTransition(() => {
      setPassport(result)
      if (result.mode === 'live') setLiveQuotes((current) => ({ ...current, [result.instrument.symbol]: result.instrument }))
    })
    const next = await runAnalysis(nextSymbol, question, setQueryNote)
    if (requestId !== scanRequest.current) return
    startTransition(() => {
      setAnalysis(next)
      setQueryNote(completionNote(result, next))
      setScanning(false)
    })
  }, [])

  const selectSymbol = (next: string) => {
    const question = `Can I trust ${next} right now?`
    setResearchQuestion(question)
    setSymbol(next)
    void scan(next, question)
  }

  const submitResearchQuestion = (event: FormEvent) => {
    event.preventDefault()
    const nextSymbol = resolveInstrument(researchQuestion)
    if (!nextSymbol) {
      setQueryNote('Unsupported instrument. Try NVDA, AAPL, TSLA, or QQQ.')
      return
    }
    setQueryNote(`Resolved to ${nextSymbol}. Running an evidence-bounded scan.`)
    setSymbol(nextSymbol)
    void scan(nextSymbol, researchQuestion)
  }

  const go = (next: View) => {
    setView(next)
    window.history.replaceState(null, '', next === 'live' ? window.location.pathname : `#${next}`)
  }

  // A gate verdict is a starting point, not an answer: the flow leads from the
  // sweep into the full attribution for the instrument the gate flagged.
  const inspectFromGate = (next: string) => {
    go('live')
    selectSymbol(next)
  }

  // Following a pasted deep link or editing the hash by hand switches workspace.
  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => go('live')} aria-label="Open Live Desk"><span className="brand-mark"><ShieldCheck size={18} /></span><span className="brand-copy"><strong>Market Integrity</strong><small>Evidence desk</small></span></button><nav aria-label="Primary navigation"><button className={view === 'live' ? 'active' : ''} onClick={() => go('live')}>Desk</button><button className={view === 'gate' ? 'active' : ''} onClick={() => go('gate')}>Gate</button><button className={view === 'stress' ? 'active' : ''} onClick={() => go('stress')}>Stress</button><button className={view === 'replay' ? 'active' : ''} onClick={() => go('replay')}>Replay</button><button className={view === 'methodology' ? 'active' : ''} onClick={() => go('methodology')}>Method</button></nav><div className="system-status"><span className="pulse" />Read-only</div></header>
    {view === 'live' ? <main className={`live-view ${scanning ? 'is-scanning' : ''}`}>
      <section className="research-hero">
        <div className="hero-heading"><span className="eyebrow"><ScanLine size={14} /> Live market research</span><h1>AI explains the move.<br /><em>The desk proves what supports it.</em></h1><p>Rank the catalysts behind a tokenized U.S. equity repricing by publication time, market response, and rejected explanations.</p></div>
        <form className="research-bar" onSubmit={submitResearchQuestion}><label htmlFor="research-question">Research question</label><div className="question-control"><input id="research-question" value={researchQuestion} onChange={(event) => setResearchQuestion(event.target.value)} autoComplete="off" /><button type="submit" disabled={scanning}>{scanning ? <RefreshCw className="spin" size={18} /> : <ArrowRight size={18} />}<span>{scanning ? 'Checking' : 'Investigate'}</span></button></div><small aria-live="polite">{queryNote}</small></form>
      </section>
      <JudgeProof />
      <Watchlist selected={symbol} liveQuotes={liveQuotes} onSelect={selectSymbol} />
      <section className="workbench">
        <div className="instrument-bar"><div><span>Current passport</span><h2>{passport.instrument.symbol}</h2><p>{passport.instrument.company} · tokenized U.S. equity</p></div><button className="scan-button" aria-label={scanning ? 'Scanning evidence' : 'Refresh evidence'} disabled={scanning} onClick={() => void scan(symbol, passport.researchQuestion ?? researchQuestion)}>{scanning ? <RefreshCw className="spin" size={16} /> : <ScanLine size={16} />}<span>{scanning ? 'Scanning evidence' : 'Refresh evidence'}</span></button></div>
        <PassportPanel passport={passport} />
        {analysis ? <CatalystPanel analysis={analysis} /> : null}
        <EvidenceInspector key={`${passport.instrument.symbol}-${passport.scannedAt}`} passport={passport} />
      </section>
    </main> : view === 'gate' ? <IntegrityGate onInspect={inspectFromGate} /> : view === 'stress' ? <StressTest symbol={symbol} onSymbol={selectSymbol} /> : view === 'replay' ? <ReplayLab /> : <Methodology />}
    <footer><div><b>Market Integrity Desk</b><span>Built for transparent tokenized markets.</span></div><div>Source-bound · Reproducible · Read-only</div><div>Research only. Not investment advice.</div></footer>
  </div>
}
