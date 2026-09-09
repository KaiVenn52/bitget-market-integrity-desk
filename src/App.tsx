import { Play, RefreshCw } from 'lucide-react'
import { startTransition, useCallback, useState } from 'react'
import { EvidenceInspector } from './components/EvidenceInspector'
import { Methodology } from './components/Methodology'
import { PassportPanel } from './components/PassportPanel'
import { ReplayLab } from './components/ReplayLab'
import { Watchlist } from './components/Watchlist'
import { snapshotFor } from './data/snapshots'
import { runScan } from './services/scan'
import type { Passport } from './types'

type View = 'live' | 'replay' | 'methodology'

export default function App() {
  const [view, setView] = useState<View>('live')
  const [symbol, setSymbol] = useState('rNVDAUSDT')
  const [passport, setPassport] = useState<Passport>(() => snapshotFor(symbol))
  const [scanning, setScanning] = useState(false)

  const scan = useCallback(async (nextSymbol = symbol) => {
    setScanning(true)
    const result = await runScan(nextSymbol)
    startTransition(() => { setPassport(result); setScanning(false) })
  }, [symbol])

  const selectSymbol = (next: string) => { setSymbol(next); void scan(next) }

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setView('live')}><strong>Market Integrity Desk</strong><span>Tokenized U.S. equities. Verifiable market states.</span></button><nav aria-label="Primary navigation"><button className={view === 'live' ? 'active' : ''} onClick={() => setView('live')}>Live Desk</button><button className={view === 'replay' ? 'active' : ''} onClick={() => setView('replay')}>Replay Lab</button><button className={view === 'methodology' ? 'active' : ''} onClick={() => setView('methodology')}>Methodology</button></nav><div className="system-status"><span className="pulse" />Read-only research</div></header>
    {view === 'live' ? <div className="desk-grid"><Watchlist selected={symbol} onSelect={selectSymbol} /><main className="desk-main"><div className="instrument-bar"><div><h1>{passport.instrument.symbol}</h1><p>{passport.instrument.company} · tokenized U.S. equity</p></div><button className="primary-button" disabled={scanning} onClick={() => void scan()}>{scanning ? <RefreshCw className="spin" size={16} /> : <Play size={16} fill="currentColor" />}{scanning ? 'Scanning evidence…' : 'Run integrity scan'}</button></div><PassportPanel passport={passport} /></main><EvidenceInspector key={`${passport.instrument.symbol}-${passport.scannedAt}`} passport={passport} /></div> : view === 'replay' ? <ReplayLab /> : <Methodology />}
    <footer><div><b>Market Integrity Desk</b><span>Built for transparent tokenized markets.</span></div><div>Methodology · Data sources · Limitations</div><div>Research only. Not investment advice.</div></footer>
  </div>
}
