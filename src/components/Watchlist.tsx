import { Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { instruments } from '../data/snapshots'
import type { MarketInstrument } from '../types'

export function Watchlist({ selected, liveQuotes, onSelect }: { selected: string; liveQuotes: Record<string, MarketInstrument>; onSelect: (symbol: string) => void }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const visible = deferredQuery ? instruments.filter((item) => `${item.symbol} ${item.company}`.toLowerCase().includes(deferredQuery)) : instruments
  return <aside className="watchlist">
    <label className="search"><Search size={16} /><input aria-label="Search instruments" placeholder="Search instruments…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="watch-head"><span>Symbol</span><span>Live price</span><span>24h</span></div>
    <div className="watch-rows">{visible.map((item) => { const quote = liveQuotes[item.symbol]; return <button key={item.symbol} className={`watch-row ${selected === item.symbol ? 'selected' : ''}`} onClick={() => onSelect(item.symbol)}><span>{item.symbol}</span><span>{quote ? quote.tokenPrice.toFixed(2) : '—'}</span><span className={quote ? (quote.change24h >= 0 ? 'positive' : 'negative') : ''}>{quote ? `${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}%` : 'Not scanned'}</span></button> })}{visible.length === 0 ? <p className="empty-watch">No matching instruments</p> : null}</div>
    <div className="watch-note"><span className="pulse" />Data provenance is shown per field</div>
  </aside>
}
