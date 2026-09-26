import { ArrowUpRight, Bot, Database, FileCheck2, Network } from 'lucide-react'
import type { Passport } from '../types'

const repositoryUrl = 'https://github.com/KaiVenn52/bitget-market-integrity-desk'

export function JudgeProof({ passport }: { passport: Passport }) {
  const requested = passport.integration?.requested.length ?? 0
  const answered = passport.integration?.answered.length ?? 0
  const mcpStatus = passport.mode === 'snapshot' || requested === 0
    ? 'OFFICIAL · NOT SCANNED'
    : `OFFICIAL · ${answered}/${requested} ANSWERED`
  return <section className="judge-proof" aria-labelledby="proof-title">
    <div className="proof-intro">
      <span className="section-kicker">Production proof</span>
      <h2 id="proof-title">Four layers. One auditable answer.</h2>
      <p>Live retrieval, official Bitget research data, deterministic checks, then bounded synthesis. No order execution.</p>
    </div>
    <div className="proof-stack">
      <div><Database size={16} aria-hidden="true" /><span><b>Bitget rToken</b><small>Read-only UTA market API</small><em>PUBLIC</em></span></div>
      <div><Network size={16} aria-hidden="true" /><span><b>Bitget MCP</b><small>Quotes, candles, dividends, earnings calendar</small><em className={passport.mode === 'live' && answered === 0 ? 'proof-source-missing' : ''} aria-live="polite">{mcpStatus}</em></span></div>
      <div><FileCheck2 size={16} aria-hidden="true" /><span><b>Underlying reference</b><small>Fresh Stock+ quote, or the reported prior close</small><em>TWO-TIER</em></span></div>
      <div><Bot size={16} aria-hidden="true" /><span><b>Qwen investigator</b><small>Every inline citation resolved before it is shown</small><em>BOUNDED</em></span></div>
    </div>
    <div className="proof-links">
      <a href={`${repositoryUrl}/blob/main/submission/validation-report.md`} target="_blank" rel="noreferrer">Validation record <ArrowUpRight size={13} /></a>
      <a href={`${repositoryUrl}/tree/main/benchmark`} target="_blank" rel="noreferrer">Frozen benchmark <ArrowUpRight size={13} /></a>
      <a href={repositoryUrl} target="_blank" rel="noreferrer">Source code <ArrowUpRight size={13} /></a>
    </div>
  </section>
}
