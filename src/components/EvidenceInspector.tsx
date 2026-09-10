import { ChevronDown, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import type { Passport } from '../types'
import { StatusMark } from './StatusMark'

export function EvidenceInspector({ passport }: { passport: Passport }) {
  const [selected, setSelected] = useState(passport.evidence[0]?.id)
  const [showRaw, setShowRaw] = useState(false)
  const active = passport.evidence.find((item) => item.id === selected) ?? passport.evidence[0]
  return <aside className="evidence-panel">
    <div className="scan-meta"><span>Evidence synthesis</span><div><span className="mode-label">{passport.mode === 'live' ? 'LIVE' : 'SNAPSHOT'} · {passport.reasoningMode === 'qwen' ? 'QWEN' : 'RULES'}</span><time>{new Date(passport.scannedAt).toLocaleTimeString([], { hour12: false, timeZone: 'UTC' })} UTC</time></div></div>
    <section className="ai-brief"><span className="section-kicker">Desk conclusion</span><h2>{passport.reasoningMode === 'qwen' ? 'AI evidence brief' : 'Evidence brief'}</h2><p>{passport.brief}</p>{passport.briefEvidenceIds.length ? <div className="brief-citations" aria-label="Brief evidence citations">{passport.briefEvidenceIds.map((id) => <button key={id} onClick={() => setSelected(id)}>[{id}]</button>)}</div> : null}<div className="reasoning-note">{passport.reasoningNote}</div></section>
    <section className="research-action"><span>Next research action</span><strong>{passport.researchAction}</strong></section>
    <section className="evidence-list"><div className="evidence-head"><div><span className="section-kicker">Sources</span><h3>Evidence used</h3></div><span>{passport.evidence.length}</span></div>{passport.evidence.map((item, index) => <button key={item.id} className={selected === item.id ? 'active' : ''} onClick={() => setSelected(item.id)}><span className="evidence-index">0{index + 1}</span><span className="evidence-copy"><b>{item.title}</b><small>{item.summary}</small></span><StatusMark state={item.state} compact /></button>)}</section>
    {active ? <section className="source-detail"><div className="detail-head"><div><span className="section-kicker">Selected source</span><h3>{active.title}</h3></div><ChevronDown size={16} /></div><dl><div><dt>Provider</dt><dd>{active.source}</dd></div><div><dt>Captured</dt><dd>{new Date(active.retrievedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC</dd></div><div><dt>Endpoint</dt><dd>{active.endpoint}</dd></div><div><dt>State</dt><dd className={`${active.state}-text`}>Recorded · {active.state}</dd></div></dl><button className="raw-link" onClick={() => setShowRaw((value) => !value)}>Inspect provenance <ExternalLink size={13} /></button>{showRaw ? <pre className="raw-provenance">{JSON.stringify({ id: active.id, source: active.source, endpoint: active.endpoint, retrievedAt: active.retrievedAt, state: active.state }, null, 2)}</pre> : null}</section> : null}
  </aside>
}
