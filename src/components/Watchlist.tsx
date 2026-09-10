import { instruments } from '../data/snapshots'
import type { MarketInstrument } from '../types'

export function Watchlist({ selected, liveQuotes, onSelect }: { selected: string; liveQuotes: Record<string, MarketInstrument>; onSelect: (symbol: string) => void }) {
  return <section className="watchlist" aria-label="Tracked instruments"><div className="watch-intro"><span>Watchlist</span><small>Select an instrument</small></div><div className="watch-rows">{instruments.map((item) => { const quote = liveQuotes[item.symbol]; return <button key={item.symbol} className={`watch-row ${selected === item.symbol ? 'selected' : ''}`} onClick={() => onSelect(item.symbol)}><span className="watch-symbol">{item.symbol.replace('USDT', '')}</span><span className="watch-company">{item.company}</span><span className="watch-price">{quote ? quote.tokenPrice.toFixed(2) : '—'}</span><span className={quote ? (quote.change24h >= 0 ? 'positive' : 'negative') : 'watch-empty'}>{quote ? `${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}%` : 'Scan to load'}</span></button> })}</div></section>
}
