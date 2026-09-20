import { ArrowUpRight, Bot, Database, FileCheck2 } from 'lucide-react'

const repositoryUrl = 'https://github.com/KaiVenn52/bitget-market-integrity-desk'

export function JudgeProof() {
  return <section className="judge-proof" aria-labelledby="proof-title">
    <div className="proof-intro">
      <span className="section-kicker">Production proof</span>
      <h2 id="proof-title">Three layers. One auditable answer.</h2>
      <p>Live retrieval, deterministic checks, then bounded synthesis. No order execution.</p>
    </div>
    <div className="proof-stack">
      <div><Database size={16} aria-hidden="true" /><span><b>Bitget rToken</b><small>Live UTA market data</small><em>LIVE</em></span></div>
      <div><FileCheck2 size={16} aria-hidden="true" /><span><b>Underlying reference</b><small>Fresh Stock+ quote, or the last official close</small><em>TWO-TIER</em></span></div>
      <div><Bot size={16} aria-hidden="true" /><span><b>Qwen investigator</b><small>Every inline citation resolved before it is shown</small><em>BOUNDED</em></span></div>
    </div>
    <div className="proof-links">
      <a href={`${repositoryUrl}/blob/main/submission/validation-report.md`} target="_blank" rel="noreferrer">Validation record <ArrowUpRight size={13} /></a>
      <a href={`${repositoryUrl}/tree/main/benchmark`} target="_blank" rel="noreferrer">Frozen benchmark <ArrowUpRight size={13} /></a>
      <a href={repositoryUrl} target="_blank" rel="noreferrer">Source code <ArrowUpRight size={13} /></a>
    </div>
  </section>
}
