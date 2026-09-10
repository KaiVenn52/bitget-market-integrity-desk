import { Play, RefreshCw } from 'lucide-react'
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

export default function App() {
  const [view, setView] = useState<View>('live')
  const [symbol, setSymbol] = useState('rNVDAUSDT')
  const [passport, setPassport] = useState<Passport>(() => snapshotFor(symbol))
  const [liveQuotes, setLiveQuotes] = useState<Record<string, Passport['instrument']>>({})
  const [scanning, setScanning] = useState(false)
  const [researchQuestion, setResearchQuestion] = useState('Can I trust rNVDAUSDT right now?')
  const [queryNote, setQueryNote] = useState('Ask about NVDA, AAPL, TSLA, or QQQ.')
  const scanRequest = useRef(0)

  const scan = useCallback(async (nextSymbol: string) => {
    const requestId = ++scanRequest.current
    setScanning(true)
    const result = await runScan(nextSymbol)
    if (requestId !== scanRequest.current) return
    startTransition(() => {
      setPassport(result)
      if (result.mode === 'live') setLiveQuotes((current) => ({ ...current, [result.instrument.symbol]: result.instrument }))
      setScanning(false)
    })
  }, [])

  useEffect(() => {
    let active = true
    const requestId = ++scanRequest.current
    void runScan('rNVDAUSDT').then((result) => {
      if (!active || requestId !== scanRequest.current) return
      startTransition(() => {
        setPassport(result)
        if (result.mode === 'live') setLiveQuotes({ [result.instrument.symbol]: result.instrument })
      })
    })
    return () => { active = false }
  }, [])

  const selectSymbol = (next: string) => { setSymbol(next); void scan(next) }

  const submitResearchQuestion = (event: FormEvent) => {
    event.preventDefault()
    const nextSymbol = resolveInstrument(researchQuestion)
    if (!nextSymbol) {
      setQueryNote('Unsupported instrument. Try NVDA, AAPL, TSLA, or QQQ.')
      return
    }
    setQueryNote(`Resolved to ${nextSymbol}. Running an evidence-bounded scan.`)
    setSymbol(nextSymbol)
    void scan(nextSymbol)
  }

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setView('live')}><strong>Market Integrity Desk</strong><span>Tokenized U.S. equities. Verifiable market states.</span></button><nav aria-label="Primary navigation"><button className={view === 'live' ? 'active' : ''} onClick={() => setView('live')}>Live Desk</button><button className={view === 'replay' ? 'active' : ''} onClick={() => setView('replay')}>Replay Lab</button><button className={view === 'methodology' ? 'active' : ''} onClick={() => setView('methodology')}>Methodology</button></nav><div className="system-status"><span className="pulse" />Read-only research</div></header>
    {view === 'live' ? <div className="desk-grid"><Watchlist selected={symbol} liveQuotes={liveQuotes} onSelect={selectSymbol} /><main className="desk-main"><div className="instrument-bar"><div><h1>{passport.instrument.symbol}</h1><p>{passport.instrument.company} · tokenized U.S. equity</p></div><button className="primary-button" disabled={scanning} onClick={() => void scan(symbol)}>{scanning ? <RefreshCw className="spin" size={16} /> : <Play size={16} fill="currentColor" />}{scanning ? 'Scanning evidence…' : 'Run integrity scan'}</button></div><form className="research-bar panel" onSubmit={submitResearchQuestion}><div><label htmlFor="research-question">Research question</label><input id="research-question" value={researchQuestion} onChange={(event) => setResearchQuestion(event.target.value)} /></div><button type="submit" disabled={scanning}>Ask Desk</button><small aria-live="polite">{queryNote}</small></form><PassportPanel passport={passport} /></main><EvidenceInspector key={`${passport.instrument.symbol}-${passport.scannedAt}`} passport={passport} /></div> : view === 'replay' ? <ReplayLab /> : <Methodology />}
    <footer><div><b>Market Integrity Desk</b><span>Built for transparent tokenized markets.</span></div><div>Methodology · Data sources · Limitations</div><div>Research only. Not investment advice.</div></footer>
  </div>
}
