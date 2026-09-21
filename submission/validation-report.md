# Validation Record

Updated: 2026-09-21
Scope: local engine, public production workflow, and three adversarial review rounds
Operator: project developer

This record is linked directly from the deployed desk. Every row below was observed on
the date shown, and rows that describe an earlier state say so.

## Observed results

| Check | Result | Evidence |
|---|---:|---|
| Deterministic, decision, gate, study, routing and rate-limit unit tests | 217/217 passed, nine suites | 5 query and instrument resolution; 22 published deterministic integrity rules; 7 decision memo, including reported-close semantics, embedded base rates and empty-sample refusal; 60 analysis-engine; 36 gate; 29 study; 6 public-endpoint budget; 19 Bitget MCP client; 33 MCP evidence layer. `npm.cmd test` |
| Official Bitget MCP integration | Live, 4/4 entries | `/api/scan` calls `equity_price_quote`, `equity_price_historical`, `equity_fundamental_dividends` and `equity_calendar_earnings` against `bitget-mcp-server v4.0.3`. Each evidence record names the upstream vendor that answered (`massive`, `bitget_data`, `finnhub`); none is labelled Stock+ or exchange-certified. |
| MCP production reliability | 12/12 scans returned all four entries, 2.96–5.35 s | Before the handshake retry was added, the same test produced one all-sources-missing scan in six — a cold CDN handshake consuming the shared budget. |
| MCP dispatch model | Serial, measured | Four concurrent queries on one session left three hanging until timeout while a single one answered in 233 ms, and the one that answered came from a different upstream provider than the same entry returns sequentially. Dispatch is therefore one entry at a time on one session. |
| MCP defects found by testing against live responses | 3 found, 3 fixed, all regression-guarded | The dividend entry's real field is `ex_dividend_date` (a plausible alias reported no dividend for an instrument that had just gone ex-dividend); parallel dispatch deadlocked; the corporate check read raw MCP entries instead of parsed events and reported "no events in window" beside an evidence record listing one. |
| Corporate-action check | Moved from `unknown / UNVERIFIABLE` to a dated result | `1 dividend event retrieved from Bitget MCP; most recent ex-date 2026-09-09 at 0.25 USD. Next scheduled report 2026-11-17.` Split adjustment is explicitly not claimed: the dividend entry is not a split feed and the historical candles carry no adjustment field. |
| Decision memo base rate during the regular session | Fixed and verified | Passing the live few-bps premium as a study target returned an empty sample and cost the memo its base rate. The drift is now handed to the study only at or beyond the 20 bps alignment threshold; below it the study picks its own example and says which one it picked. The memo shows `4 of 5 materially resolved episodes moved the same way as the drift` in both regimes. |
| Decision memo boundaries | Passed locally and rendered | Missing or inconsistent references return `WAIT`; caution states return `INVESTIGATE`; no measured repricing returns `REJECT_THESIS`; a supported passport returns `READY` for human review, never a trade instruction. |
| Production build | Passed | `npm.cmd run build` — Vite 8, 278 kB JS / 40 kB CSS |
| Static lint | Passed | `npm.cmd run lint` |
| API syntax checks | 5/5 passed | `node --check` on `api/analyze.js`, `api/scan.js`, `api/sweep.js`, `api/study.js`, `api/benchmark-source.js` |
| Citation gate closes over the narrative prose | Passed | The gate extracts the inline `[id]` markers from the brief a reader sees and fails a narrative that cites nothing or cites an ID the server never issued. Replayed against three live production answers: all three passed, so the tightening rejects no valid output. |
| Citation gate closes in production | Passed | `/api/analyze` returned `QWEN` reporting "6 inline citations verified in the narrative against server evidence" in 14.5 s |
| U.S. market calendar | Passed | Full holidays and half days computed from the published NYSE rules. Christmas, Thanksgiving, New Year's Day, Good Friday, Memorial Day, Juneteenth, Labor Day, MLK Day and Washington's Birthday all classify as closed; the day after Thanksgiving, Christmas Eve and a qualifying July 3 close the regular session at 13:00 ET. |
| Weekend holiday observation | Passed | Independence Day 2026 falls on a Saturday, so the market is shut on Friday 2026-07-03; in 2027 it falls on a Sunday, so the market is shut on Monday 2027-07-05 |
| Stress-test matching has no look-ahead | Passed | Matched rows key on the drift observed at a stage of the window, never the window's peak. Live: `matchedDriftBps: -30, matchedStageHours: 16, peakDriftBps: 52` |
| The example episode is excluded from its own sample | Passed | When the market is open the most recent closed episode supplies the target and is removed from the pool it is compared against, so it cannot match itself at zero distance |
| Opposite-direction episodes are not called comparable | Passed locally | A +40 bps target does not match a -40 bps-only episode, even at equal absolute magnitude; same-direction matches remain eligible |
| Daily-close provenance | Passed locally | The API and interface identify Yahoo Finance as a secondary daily-close feed, not an exchange-certified primary source; the JSON reference kind is `reported-close` |
| Reported-close expiry | Passed locally | A daily close older than five calendar days is rejected rather than treated as a current comparison baseline |
| Closed-market gate completeness | Passed locally | An aligned prior close no longer bypasses independent repricing and quoted-spread checks; a 200 bps spread returns `INVESTIGATE`, not `CLEAR` |
| Source-time chronology | Passed locally | Token and Stock+ timeline events use their source timestamps and display their individual ages; a stale Stock+ quote is never labelled `Current underlying` |
| Initial scan concurrency | Passed | Token ticker and Stock+ quote are requested together; production `/api/scan` returns a real premium in ~2 s |
| Public endpoint budget | Passed | `/api/analyze` returns `x-ratelimit-limit: 12`, `x-ratelimit-remaining`, and `retry-after` on refusal. Per warm instance, not a global quota — stated as such rather than implied otherwise. |
| Core browser tasks | Passed | Natural-language query, question-aware Qwen answer, instrument switch, live/fallback scan, row expansion, evidence selection, provenance reveal, Gate, Stress, Replay and Method navigation |
| Instrument switch does not show the previous narrative | Passed | The analysis carries its instrument and is withheld while the passport belongs to a different one, closing the 15–20 s window between retrieval finishing and the model answering |
| Same-instrument refresh does not show the previous narrative | Passed locally | Starting any scan clears the previous analysis, and Qwen completion replaces the passport's pending note with the completed investigation state |
| Desktop viewport | Passed | 1440 × 1000, no document-level horizontal overflow |
| Mobile viewport | Passed | 390 × 844, no document-level horizontal overflow |
| Public deployment | Passed | `https://bitget-market-integrity-desk.vercel.app` returned HTTP 200 |
| Four-instrument gate sweep | Passed | Four verdicts, each with a code, reason, meaning, cited evidence ids, change conditions and next step |
| Stress test over retrieved history | Passed | `/api/study` returned 14 closed-market episodes for rAAPLUSDT and rTSLAUSDT over 500 hourly candles |
| Production Qwen latency | 11.0–21.7 s | Bounded reasoning. Eight runs on the real payload measured 13–22 s bounded against 29–43 s unbounded; the unbounded tail exceeded the deadline and fell back to `RULES`. |
| Qwen reasoning is bounded, not merely hoped for | Passed | `reasoning: { effort: 'low' }`, measured. The answer kept all seven citations, the closed-market semantics and the explicit statement that no timing-consistent catalyst was found. |
| Model deadline derived from the function budget | Passed | The deadline is computed from the remaining handler budget rather than fixed, so a slow retrieval cannot cause a bare platform 504 in place of a labelled fallback |
| Frozen benchmark | 16/16 cases evaluated | Four instruments × four closed five-minute cutoffs; immutable evidence digests and separate labels published in `benchmark/` |
| Benchmark evidence boundary | Passed | 100% deterministic state accuracy, Qwen availability, citation validity, and bounded abstention; 0% directional claims |
| Benchmark bundle integrity | Passed | 100% SHA-256 digest validity, five-minute cutoff validity, and OHLC validity; ID coverage matched across cases, labels, and Qwen outputs |

## What these results prove

- The deterministic calculations and state thresholds behave as tested, including the
  exchange calendar that decides whether a market is open at all.
- The citation claim the interface makes is the citation claim it checks: inline IDs in
  the narrative resolve to server evidence, not just IDs in the model's own index.
- The historical comparison contains only scenarios that were recognisable while they
  were happening and moved in the same direction, and never counts an episode as its own precedent.
- The production client compiles and the current code passes static checks.
- The primary research workflow is operable in a real browser, and a stale narrative
  cannot be shown against a different instrument.
- The public endpoint that spends money carries a budget, and the endpoint says what
  kind of budget it is.

## What these results do not prove

- Live Bitget availability from every deployment region.
- Historical classification accuracy, user adoption, retention, AUM, volume, fees, or
  investment performance.
- That the stress test predicts anything. It describes what already happened across a
  small sample of one instrument's recent history. It is a historical base rate, not a
  forward test, and the page says so.
- That resolving a citation ID proves the cited record semantically supports every
  sentence around it. The trader still needs to inspect the record and the claim.
- That Yahoo Finance daily closes have been independently verified against exchange
  records. They are a secondary-feed comparison baseline; missing rows remain missing.
- That the rate limit is a global quota. It is per warm instance; a durable limit would
  need shared storage this desk does not have.
- Balanced state-classification accuracy: all 16 frozen benchmark cases share the
  `UNVERIFIABLE` gold label because Stock+ credentials were absent when that immutable
  slice was captured.
- Qwen availability or latency outside the runs recorded above.

## Defects found by review and fixed

An adversarial review of the deployed product found eight defects. Each was reproduced
before being fixed, and each carries a regression test.

1. **The citation gate did not cover the prose.** The interface said "citations
   verified" while only the `evidenceIds` array had been checked, so a narrative citing
   nothing, or citing an invented ID, still passed. This was the most serious defect
   because it struck at the product's central claim.
2. **The stress test had a look-ahead bias.** It matched on the window's peak drift,
   which is only knowable after the fact, and when the market was open it left the
   example episode inside its own comparison pool.
3. **The session classifier had no holiday calendar.** Christmas morning at 10:00 ET was
   classified as a regular session.
4. **The initial scan serialised two independent requests**, so a slow Stock+ response
   could time out a scan whose public data had already arrived.
5. **The public analysis endpoint had no budget** despite spending a paid model call per
   request.
6. **A static "Stock+ VERIFIED" badge** advertised a credentialed path even when the
   answer rested on the keyless Yahoo-reported prior-close tier.
7. **A stale narrative could outlive an instrument switch**, sitting beside the new
   instrument's passport for 15–20 seconds.
8. **The submission documents were stale**, quoting earlier test counts, a deleted
   endpoint, and an older product state — including this file, which a judge reaches by
   clicking "Validation record" on the deployed site.
9. **Closed-market alignment bypassed independent risks.** The reported-close branch
   returned `CLEAR` before repricing and quoted-spread rules ran; a synthetic 200 bps
   spread now returns `INVESTIGATE` and has a regression test.
10. **A reported close had no expiry.** A month-old daily close could be treated as the
    current comparison baseline. Reported closes now have a five-calendar-day ceiling.
11. **The chronology used retrieval time as source time.** A stale Stock+ quote appeared
    as `Current underlying`. Token and underlying events now show their separate source
    clocks and ages.
12. **The browser timeout could discard a successful live scan.** One production scan
    returned in 5.752 seconds against a 5.5-second client ceiling. The client now leaves
    eight seconds for the server budget plus cold-start, serialization and network time.
13. **A reported prior close was labelled as a live reference** in the move panel. The
    label now keys on the reference kind and reads `Drift vs prior close`.
14. **Refresh state could contradict itself.** A same-instrument refresh left the old
    narrative visible, and the passport still said Qwen was pending after it completed.
    Every scan now clears the old narrative and synchronizes the completion note.

Every published metric must be labeled observed, estimated, or targeted. Demonstration
fixtures must never be described as historical evidence.
