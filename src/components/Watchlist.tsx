import { Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { instruments } from '../data/snapshots'

export function Watchlist({ selected, onSelect }: { selected: string; onSelect: (symbol: string) => void }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const visible = deferredQuery ? instruments.filter((item) => `${item.symbol} ${item.company}`.toLowerCase().includes(deferredQuery)) : instruments
  return <aside className="watchlist">
    <label className="search"><Search size={16} /><input aria-label="Search instruments" placeholder="Search instruments…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="watch-head"><span>Symbol</span><span>Token price</span><span>24h</span></div>
    <div className="watch-rows">{visible.map((item) => <button key={item.symbol} className={`watch-row ${selected === item.symbol ? 'selected' : ''}`} onClick={() => onSelect(item.symbol)}><span>{item.symbol}</span><span>{item.tokenPrice.toFixed(2)}</span><span className={item.change24h >= 0 ? 'positive' : 'negative'}>{item.change24h >= 0 ? '+' : ''}{item.change24h.toFixed(2)}%</span></button>)}{visible.length === 0 ? <p className="empty-watch">No matching instruments</p> : null}</div>
    <div className="watch-note"><span className="pulse" />Data provenance is shown per field</div>
  </aside>
}
