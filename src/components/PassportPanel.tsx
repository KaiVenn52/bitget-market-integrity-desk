import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { Passport } from '../types'
import { StatusMark } from './StatusMark'

const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`

export function PassportPanel({ passport }: { passport: Passport }) {
  const [expanded, setExpanded] = useState('freshness')
  const sessionObserved = !/unverifiable|fixture/i.test(passport.sessionState)
  return <div className="passport-stack">
    <section className="passport panel">
      <div className="section-title"><div><h2>Market State Passport</h2><p>A reproducible view of what is observable, stale, contradictory, or unverifiable.</p></div><div className={`passport-state state-${passport.state.toLowerCase()}`}>{passport.state}</div></div>
      <div className="facts">
        <div><span>Token market</span><strong>{passport.instrument.tokenPrice.toFixed(2)} <small>USDT</small></strong><em>Bitget · {passport.instrument.symbol}</em></div>
        <div><span>Underlying</span><strong>{passport.instrument.underlyingPrice == null ? 'Unavailable' : <>{passport.instrument.underlyingPrice.toFixed(2)} <small>USD</small></>}</strong><em>{passport.instrument.underlyingSymbol}</em></div>
        <div><span>Premium / discount</span><strong className={passport.premiumBps != null && Math.abs(passport.premiumBps) > 20 ? 'negative' : ''}>{passport.premiumBps == null ? 'N/A' : `${signed(passport.premiumBps)} bps`}</strong><em>Deterministic</em></div>
        <div><span>Session state</span><strong className={sessionObserved ? 'positive' : 'unknown-text'}>{passport.sessionState}</strong><em>{sessionObserved ? 'Exchange-reported status' : 'Reference unavailable'}</em></div>
        <div><span>Quote age</span><strong>{passport.mode === 'snapshot' ? 'Fixture' : `${passport.tokenQuoteAge}s`}</strong><em>{passport.mode === 'snapshot' ? 'Frozen · not current' : `Underlying ${passport.underlyingQuoteAge == null ? 'unavailable' : `${passport.underlyingQuoteAge}s`}`}</em></div>
        <div><span>Liquidity observability</span><strong className="unknown-text">{passport.liquidity}</strong><em>Depth unavailable</em></div>
        <div><span>Corporate action</span><strong>{passport.corporateAction}</strong><em>Never inferred</em></div>
      </div>
    </section>

    <section className="checks panel"><div className="section-title compact"><div><h2>Deterministic checks</h2><p>Rule-based verification using observable data. Expand any row to audit it.</p></div><div className="legend"><span className="dot pass-dot" />Pass <span className="dot caution-dot" />Caution <span className="dot unknown-dot" />Unknown</div></div>
      <div className="check-list">{passport.checks.map((check) => { const isOpen = expanded === check.id; return <div className={`check ${isOpen ? 'open' : ''}`} key={check.id}><button onClick={() => setExpanded(isOpen ? '' : check.id)} aria-expanded={isOpen}><StatusMark state={check.state} compact /><span className="check-main"><b>{check.title}</b><small>{check.summary}</small></span><span className={`check-result result-${check.state}`}>{check.result}</span>{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>{isOpen ? <div className="check-detail"><p>{check.detail}</p><dl>{check.observations.map((observation) => <div key={observation.label}><dt>{observation.label}</dt><dd className={observation.accent ? `${observation.accent}-text` : ''}>{observation.value}</dd></div>)}</dl></div> : null}</div> })}</div>
    </section>

    <section className="timeline panel"><div className="section-title compact"><div><h2>Evidence timeline</h2><p>Price movement vs. evidence publication times (UTC)</p></div></div><div className="timeline-track">{passport.timeline.map((event) => <div className={`timeline-event event-${event.kind}`} key={event.id} style={{ left: `${event.offset}%` }}><div className="event-copy"><b>{event.time}</b><span>{event.title}</span><small>{event.detail}</small></div><i /></div>)}</div><div className="timeline-axis"><span>{passport.timeline[0]?.time}</span><span>{passport.timeline.at(-1)?.time}</span></div></section>
  </div>
}
