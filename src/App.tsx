import { ArrowRight, RefreshCw, ScanLine, ShieldCheck } from 'lucide-react'
import { startTransition, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { EvidenceInspector } from './components/EvidenceInspector'
import { Methodology } from './components/Methodology'
import { PassportPanel } from './components/PassportPanel'
import { ReplayLab } from './components/ReplayLab'
import { Watchlist } from './components/Watchlist'
import { snapshotFor } from './data/snapshots'
import { resolveInstrument } from './lib/query'
import { runScan } from './services/scan'
import type { Passport } from './types'

type View = 'live' | 'replay' | 'methodology'

const completionNote = (result: Passport) => `${result.mode === 'live' ? 'Live' : 'Snapshot'} research complete · ${result.reasoningMode === 'qwen' ? 'Qwen evidence brief verified.' : 'deterministic fallback retained.'}`

export default function App() {
  const [view, setView] = useState<View>('live')
  const [symbol, setSymbol] = useState('rNVDAUSDT')
  const [passport, setPassport] = useState<Passport>(() => snapshotFor(symbol))
  const [liveQuotes, setLiveQuotes] = useState<Record<string, Passport['instrument']>>({})
  const [scanning, setScanning] = useState(true)
  const [researchQuestion, setResearchQuestion] = useState('Can I trust rNVDAUSDT right now?')
  const [queryNote, setQueryNote] = useState('Ask about NVDA, AAPL, TSLA, or QQQ.')
  const scanRequest = useRef(0)

  const scan = useCallback(async (nextSymbol: string, question = `Can I trust ${nextSymbol} right now?`) => {
    const requestId = ++scanRequest.current
    setScanning(true)
    setQueryNote('Checking Bitget sources, then asking Qwen to audit the evidence.')
    const result = await runScan(nextSymbol, question)
    if (requestId !== scanRequest.current) return
    startTransition(() => {
      setPassport(result)
      if (result.mode === 'live') setLiveQuotes((current) => ({ ...current, [result.instrument.symbol]: result.instrument }))
      setQueryNote(completionNote(result))
      setScanning(false)
    })
  }, [])

  useEffect(() => {
    let active = true
    const question = 'Can I trust rNVDAUSDT right now?'
    const requestId = ++scanRequest.current
    void runScan('rNVDAUSDT', question).then((result) => {
      if (!active || requestId !== scanRequest.current) return
      startTransition(() => {
        setPassport(result)
        if (result.mode === 'live') setLiveQuotes({ [result.instrument.symbol]: result.instrument })
        setQueryNote(completionNote(result))
        setScanning(false)
      })
    })
    return () => { active = false }
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

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setView('live')} aria-label="Open Live Desk"><span className="brand-mark"><ShieldCheck size={18} /></span><span className="brand-copy"><strong>Market Integrity</strong><small>Evidence desk</small></span></button><nav aria-label="Primary navigation"><button className={view === 'live' ? 'active' : ''} onClick={() => setView('live')}>Desk</button><button className={view === 'replay' ? 'active' : ''} onClick={() => setView('replay')}>Replay</button><button className={view === 'methodology' ? 'active' : ''} onClick={() => setView('methodology')}>Method</button></nav><div className="system-status"><span className="pulse" />Read-only</div></header>
    {view === 'live' ? <main className={`live-view ${scanning ? 'is-scanning' : ''}`}>
      <section className="research-hero">
        <div className="hero-heading"><span className="eyebrow"><ScanLine size={14} /> Live market research</span><h1>Ask the market.<br /><em>Audit the answer.</em></h1><p>Verify whether a tokenized U.S. equity is fresh, aligned, and supported by observable evidence.</p></div>
        <form className="research-bar" onSubmit={submitResearchQuestion}><label htmlFor="research-question">Research question</label><div className="question-control"><input id="research-question" value={researchQuestion} onChange={(event) => setResearchQuestion(event.target.value)} autoComplete="off" /><button type="submit" disabled={scanning}>{scanning ? <RefreshCw className="spin" size={18} /> : <ArrowRight size={18} />}<span>{scanning ? 'Checking' : 'Investigate'}</span></button></div><small aria-live="polite">{queryNote}</small></form>
      </section>
      <Watchlist selected={symbol} liveQuotes={liveQuotes} onSelect={selectSymbol} />
      <section className="workbench">
        <div className="instrument-bar"><div><span>Current passport</span><h2>{passport.instrument.symbol}</h2><p>{passport.instrument.company} · tokenized U.S. equity</p></div><button className="scan-button" aria-label={scanning ? 'Scanning evidence' : 'Refresh evidence'} disabled={scanning} onClick={() => void scan(symbol, passport.researchQuestion ?? researchQuestion)}>{scanning ? <RefreshCw className="spin" size={16} /> : <ScanLine size={16} />}<span>{scanning ? 'Scanning evidence' : 'Refresh evidence'}</span></button></div>
        <PassportPanel passport={passport} />
        <EvidenceInspector key={`${passport.instrument.symbol}-${passport.scannedAt}`} passport={passport} />
      </section>
    </main> : view === 'replay' ? <ReplayLab /> : <Methodology />}
    <footer><div><b>Market Integrity Desk</b><span>Built for transparent tokenized markets.</span></div><div>Source-bound · Reproducible · Read-only</div><div>Research only. Not investment advice.</div></footer>
  </div>
}
