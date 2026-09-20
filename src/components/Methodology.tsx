import { Layers, ShieldCheck, ShieldQuestion } from 'lucide-react'

export function Methodology() {
  return <main className="content-view methodology-view">
    <div className="view-heading">
      <div>
        <h1>Methodology</h1>
        <p>AI analyzes the move. The integrity layer exposes the records behind its citations, flags missing evidence, and leaves the final judgment of claim support to the trader.</p>
      </div>
    </div>

    <section className="method-rail">
      <div><span>01</span><h2>Observe</h2><p>Retrieve the rToken ticker and candles, a session-aware reference for the underlying, and timestamped headlines. A field that could not be retrieved stays missing rather than being filled with a plausible value.</p></div>
      <div><span>02</span><h2>Verify</h2><p>Measure the repricing, locate where it began, and compute drift, turnover and spread in deterministic code. The language model never calculates these numbers, so the same evidence always produces the same measurement.</p></div>
      <div><span>03</span><h2>Explain</h2><p>Rank only headlines that name the instrument, by publication time against the move start. A headline published after the move is labelled timing-inconsistent, never a cause. The model is instructed to cite supplied evidence IDs; the gate checks the IDs in its narrative, while the reader still judges whether each source supports the claim.</p></div>
      <div><span>04</span><h2>Gate</h2><p>Decide whether the market state can be trusted at all, before any view is formed. Each instrument gets a verdict of clear, investigate, wait or blocked, with the evidence it rests on, the conditions that would change it, and the next research step. The gate never says buy or sell and never places an order.</p></div>
      <div><span>05</span><h2>Abstain</h2><p>Return UNVERIFIABLE, NOT OBSERVABLE or NO_STRONG_CATALYST whenever required evidence is unavailable, contradictory, or simply not found. A refusal is a recorded outcome with its own row in the desk log, not a failure to be hidden.</p></div>
    </section>

    <section className="panel reference-tiers">
      <h2><Layers size={15} aria-hidden /> The reference is two-tier, and the desk says which tier it used</h2>
      <p className="study-sub">Every premium, drift and alignment claim in this desk is a comparison against a reference price. Which price counts as the reference depends on whether the underlying can actually trade, and the desk reports the tier rather than implying one.</p>
      <div className="tier-grid">
        <div>
          <span className="mode-badge mode-qwen">LIVE QUOTE</span>
          <p>While the underlying's main session is running, only a fresh authenticated quote from that same session can serve as a basis. A quote from an earlier session, or one older than the freshness ceiling, is not a basis — and the desk says which of those it was.</p>
        </div>
        <div>
          <span className="mode-badge mode-rules">REPORTED PRIOR CLOSE</span>
          <p>While the main session is not running, the latest Yahoo-reported daily close provides a comparison baseline, not an exchange-certified or live quote. This tier is retrievable without an authenticated feed, so an overnight drift can still be measured. A gap against it is drift, not a verified alignment break: there is no live underlying price for the token to disagree with.</p>
        </div>
      </div>
      <p className="study-context">Both tiers are labelled in the interface and repeated in every verdict that rests on them, so a reader can distinguish an authenticated live quote from a secondary-feed prior close.</p>
    </section>

    <section className="panel limitations">
      <h2><ShieldQuestion size={15} aria-hidden /> Declared limitations</h2>
      <ul>
        <li>Snapshot mode demonstrates product behavior but is not live market evidence.</li>
        <li>Top-of-book values do not prove sufficient execution liquidity.</li>
        <li>A timing-consistent catalyst is consistent with the move, not proof that it caused it.</li>
        <li>Headline retrieval covers a bounded lookback window and a keyless public feed; the absence of a headline is not evidence that none exists.</li>
        <li>Relevance is decided by whether the headline names the instrument, so a genuine catalyst that never names it will be missed.</li>
        <li>The language model narrates verdicts that deterministic code already produced; it does not rank, measure or decide them.</li>
        <li>The historical stress test reports what happened in the retrieved window — weeks of hourly candles, a small sample — and claims no statistical significance. It is a base rate, not a forecast.</li>
        <li>Underlying daily closes come from Yahoo Finance, a secondary feed not independently verified against exchange records. Where they were not retrieved, the historical study falls back to the rToken's own session close and labels that fallback as a proxy.</li>
        <li>The Qwen citation gate checks that inline IDs exist in server-supplied evidence. It does not prove that every sentence is supported by the cited record; a trader must inspect the underlying evidence.</li>
        <li>Excursion figures in the stress test come from hourly highs and lows, so intra-hour extremes are not captured.</li>
        <li>A gate verdict describes whether the state can be verified. It is not advice, and a clear verdict is not a recommendation to trade.</li>
        <li>The official Skill layer was probed with the argument shapes it publishes, and withheld. Its transport answers in under a second, but no tool returned a usable observation about a gated instrument or its underlying, and the one tool that carries data ignores the exchange parameter — it reports a Binance error for a Bitget symbol — so it cannot see Bitget at all. The probe is committed and reproducible; the finding is a missing source, not a market fact.</li>
        <li>This tool does not predict returns or recommend trades.</li>
      </ul>
    </section>

    <section className="panel limitations">
      <h2><ShieldCheck size={15} aria-hidden /> What the desk deliberately does not do</h2>
      <ul>
        <li>It does not place orders, hold positions, or manage risk. It presents analysis; the human trader makes the decision.</li>
        <li>It does not name a cause. The strongest catalyst statement available is that a headline is timing-consistent with a move — never that it caused one.</li>
        <li>It does not fill a missing source with a substitute. When a source fails, the failure is reported as a missing source, not as a finding about the instrument.</li>
        <li>It does not let the browser supply its own evidence. The server decides what was retrieved, and the model may only cite from that set.</li>
      </ul>
    </section>
  </main>
}
