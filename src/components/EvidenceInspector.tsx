import { ChevronDown, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import type { Passport } from '../types'
import { StatusMark } from './StatusMark'

export function EvidenceInspector({ passport }: { passport: Passport }) {
  const [selected, setSelected] = useState(passport.evidence[0]?.id)
  const [showRaw, setShowRaw] = useState(false)
  const active = passport.evidence.find((item) => item.id === selected) ?? passport.evidence[0]
  return <aside className="evidence-panel">
    <div className="scan-meta"><span>Last scan</span><time>{new Date(passport.scannedAt).toLocaleTimeString([], { hour12: false, timeZone: 'UTC' })} UTC</time><strong className={`summary-${passport.state.toLowerCase()}`}>{passport.state}</strong></div>
    <section className="panel ai-brief"><div className="section-title compact"><div><h2>{passport.reasoningMode === 'qwen' ? 'AI evidence brief' : 'Evidence brief'}</h2><p>Synthesis of observable evidence across sources.</p></div><span className="mode-label">{passport.mode === 'live' ? 'LIVE' : 'SNAPSHOT'} · {passport.reasoningMode === 'qwen' ? 'QWEN' : 'RULES'}</span></div><p>{passport.brief}</p>{passport.briefEvidenceIds.length ? <div className="brief-citations" aria-label="Brief evidence citations">{passport.briefEvidenceIds.map((id) => <button key={id} onClick={() => setSelected(id)}>[{id}]</button>)}</div> : null}<div className="reasoning-note">{passport.reasoningNote}</div><div className="research-action"><span>Research action</span><strong>{passport.researchAction}</strong></div></section>
    <section className="evidence-list"><div className="evidence-head"><h3>Evidence</h3><span>{passport.evidence.length} items</span></div>{passport.evidence.map((item, index) => <button key={item.id} className={selected === item.id ? 'active' : ''} onClick={() => setSelected(item.id)}><span className="evidence-index"><StatusMark state={item.state} compact />{index + 1}.</span><span><b>{item.title}</b><small>{item.summary}</small></span><em className={`${item.state}-text`}>{item.state.toUpperCase()}</em><time>{item.timestamp}</time></button>)}</section>
    {active ? <section className="source-detail panel"><div className="detail-head"><h3>Source details</h3><ChevronDown size={16} /></div><dl><div><dt>Source</dt><dd>{active.source}</dd></div><div><dt>Evidence time</dt><dd>{new Date(active.retrievedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC</dd></div><div><dt>Endpoint</dt><dd>{active.endpoint}</dd></div><div><dt>Status</dt><dd className={`${active.state}-text`}>Recorded · {active.state}</dd></div></dl><button className="raw-link" onClick={() => setShowRaw((value) => !value)}>Inspect provenance <ExternalLink size={13} /></button>{showRaw ? <pre className="raw-provenance">{JSON.stringify({ id: active.id, source: active.source, endpoint: active.endpoint, retrievedAt: active.retrievedAt, state: active.state }, null, 2)}</pre> : null}</section> : null}
  </aside>
}
