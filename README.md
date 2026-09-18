# Market Integrity Desk

A read-only, evidence-first AI Trading Desk for Bitget tokenized U.S. equities. It produces a reproducible Market State Passport, and explains a repricing by ranking candidate catalysts against publication time — then rejecting the ones whose timing cannot explain the move.

**Live demo:** https://bitget-market-integrity-desk.vercel.app

> Can the current state of a 24/7 tokenized-equity market be supported by fresh, internally consistent evidence?
> And when it reprices, which explanation is actually supported by the record?

![Market Integrity Desk](design/implementation-desktop-final.png)

## Why it exists

A tokenized U.S. equity can trade while its underlying market is closed, stale, or reacting to information published on a different timeline. A price dashboard shows the numbers but does not tell a researcher which facts are fresh, which claims conflict with timestamps, or which questions cannot be answered with the available endpoints. Market Integrity Desk separates those responsibilities:

1. **Observe:** retrieve Bitget rToken and Stock+ values, plus timestamped headlines.
2. **Verify:** calculate premium, freshness, session consistency, move start, drift, turnover and spread in deterministic code.
3. **Explain:** rank only headlines that name the instrument, by publication time against the detected move start.
4. **Gate:** decide whether the market state can be trusted at all, and record the refusals.
5. **Abstain:** expose `UNVERIFIABLE`, `NOT OBSERVABLE` and `NO_STRONG_CATALYST` instead of inventing confidence or a cause.

The target user is a research-driven, medium-frequency Bitget rToken trader who checks a small watchlist before acting, trades while the U.S. market is closed, and values evidence quality over directional predictions. The desk presents analysis; the human makes the decision. It places no orders.

## The four workspaces

| Workspace | Question it answers |
| --- | --- |
| **Desk** (`#live`) | Why did this instrument move, and which explanation does the record actually support? |
| **Gate** (`#gate`) | Can I trust this market state at all, right now, and what exactly blocks it? |
| **Stress** (`#stress`) | When this token drifted like this before, what did the following session do? |
| **Replay / Method** (`#replay`, `#method`) | Frozen cases, and the boundary the desk refuses to cross. |

Views are deep-linkable, so any workspace can be cited or linked directly.

## The pre-trade integrity gate

The desk gates its own watchlist in one sweep and writes down what it refused.

- **Deterministic and ordered.** The first matching rule wins, so the same evidence always produces the same verdict, and any desk-log entry can be reproduced by re-running it.
- **Four decisions:** `CLEAR`, `INVESTIGATE`, `WAIT`, `BLOCKED`. A desk is only as clear as its least verifiable instrument, so the sweep headline is the worst verdict rather than an average.
- **Every verdict names what it rests on:** the evidence ids it cites, the conditions that would change it, and the next research step. The gate never says buy or sell.
- **A refusal is an outcome.** The desk log records refusals and reports the rate, because "the gate withheld a clear verdict on 4 of 4 observations" is a result, not a failure.
- **It checks itself.** Each sweep verifies that every verdict cites evidence the sweep actually holds, and says so when a verdict cites something it did not retrieve.

### The reference is two-tier, and the desk says which tier it used

Every premium and drift claim is a comparison against a reference price. Which price counts depends on whether the underlying can trade:

- **Live quote** — while the underlying's main session runs, only a fresh authenticated quote from that same session is a basis. A quote from an earlier session, or one past the freshness ceiling, is not a basis, and the desk reports which of those it was rather than calling a stalled feed a closed market.
- **Last official close** — while the main session is not running, the price the underlying last traded at *is* the correct basis, and it is retrievable keylessly. This is why the desk's central case, an overnight drift nothing can confirm, does not depend on a credential. A gap against this tier is **drift, not an alignment break**: there is no live underlying price for the token to disagree with.

Both tiers are labelled in the interface and repeated in every verdict that rests on them.

## The historical stress test

The gate can say "the reference cannot confirm this, and the token has moved 478 bps". That is useless unless a human can ask the obvious follow-up. The stress test builds closed-market episodes from hourly rToken candles, anchors each to the last session close, measures what the following session actually did, and reports the base rate with its sample size attached.

- **Measured on the underlying, not only the token.** Official daily closes are retrieved when available and used for the statistics; where they are missing the rToken's own session close is used and labelled a proxy.
- **A flat close is not a confirmation.** A +108 bps drift that resolves to +5 bps is reported as `closed flat`, excluded from the rate and shown separately, so the headline number cannot be inflated by immaterial closes.
- **It refuses to answer when there is nothing to test.** A drift inside the 20 bps alignment threshold is not an event, so the desk declines to compare it to history rather than dressing up a meaningless match.
- **It is a base rate, not a forecast.** The sample is weeks of hourly candles, no significance is claimed, and the declared limits are printed on the page.

## The official Skill layer: probed, and withheld

The hackathon's `@bitget-ai/bitget-signal` layer advertises 19 tools, several of which would genuinely improve this desk — an official price for the underlying, a cross-asset correlation that separates an idiosyncratic move from a market-wide one, a scheduled earnings date, macro release dates. So it was probed properly rather than assumed either way.

`scripts/probe-bitget-signal.mjs` calls every tool with the argument shape published by `tools/list` — not a guessed one, because a probe that calls a tool wrongly measures the probe, not the source — and classifies each answer as `usable`, `empty`, `error` or `timeout`. The saved result is `benchmark/bitget-signal-probe.json`.

**Result: the transport is healthy and the data is not.** `initialize` answers in ~0.4s and `tools/list` in ~0.2s, but of 24 probes only 4 returned any data at all — and **none of those 4 was about a gated instrument or its underlying**. 5 answered with a shell containing no observation, 3 errored, 12 timed out at the 20-second ceiling:

- Every equity, macro and news upstream timed out, errored, or answered with an empty shell: `global_assets` and `cross_asset` (Yahoo), `macro_indicators` and `rates_yields` (FRED), `tradfi_news` (Finnhub), `news_feed` (44 RSS feeds, every one empty), `cn_market` (AKShare), `crypto_market` (CoinGecko), `sentiment_index`.
- The 4 that carry data are crypto ones speaking about pairs Binance lists — a BTC/USDT price, BTC/USDT RSI, and a feed inventory. That is a neighbour, not an integration: it cannot change a single verdict about a tokenized equity.
- **The `exchange` parameter is ignored**: a call requesting `exchange: bitget` for `rTSLA/USDT` answers *"binance does not have market symbol rTSLA/USDT"* — the error names the exchange it actually used, and it is not the one requested. Two control calls confirm the tool itself works, so the failure belongs to the exchange, not the tool. It therefore cannot see Bitget, let alone a tokenized equity.
- `rates_yields` answers `spread_10y2y: 0.0` and `inverted: false` while every yield behind that spread is an empty error shell, and two other tools answer with nothing but the request URL read back to the caller. A zero next to an empty shell is a default and an echoed endpoint is not a fact; the probe's classifier says so rather than counting them as data.

**Decision: withheld.** A working tool that only speaks about BTC is a neighbour, not an integration — it cannot change a single verdict about a tokenized equity — and shipping a 15–30 second call that renders an empty panel would be exactly the dishonesty this desk exists to prevent. The probe is committed so the finding is reproducible and can be re-run: if the upstreams recover, the same script reports `eligible_for_bounded_adapter` and the layer can be integrated against a measured baseline rather than a guess.

## What is real today

- Deterministic premium and freshness checks with published thresholds.
- Explicit `UNVERIFIABLE` and `NOT OBSERVABLE` states.
- Per-item provenance and evidence timestamps.
- A synchronized watchlist that shows only quotes observed during the current session.
- An explicit research action for every Passport, including when the correct action is to wait for missing evidence.
- Responsive Live Desk, Replay Lab, and Methodology views.
- A Vercel serverless endpoint that attempts parallel Bitget rToken and Stock+ retrieval.
- **A move-explanation endpoint** that measures the repricing, locates where it began, retrieves headlines, and ranks them by publication time into `POSSIBLE`, `POSSIBLE_CONTRIBUTING`, `TIMING_INCONSISTENT` and `DISTANT` buckets with an explicit confidence rule and a "what would change this conclusion" list.
- A bounded Qwen investigator that narrates only supplied evidence IDs.
- **A pre-trade integrity gate** with ordered deterministic rules, four decisions, evidence citations, change conditions and a next step for every verdict, plus a self-check that a verdict never cites evidence the sweep did not retrieve.
- **A historical stress test** that builds closed-market episodes, measures the drift distribution, and matches comparable episodes to what the following session actually did — using official underlying closes where available and labelling the proxy where not.
- **A browser-local desk log** that records every sweep including refusals, and reports the refusal rate.
- **A two-tier reference** so the desk's central case works without an authenticated feed.
- A clearly labeled snapshot fallback when live sources cannot be reached.
- A published 16-case frozen benchmark with separate labels, saved Qwen outputs, SHA-256 evidence digests, evaluator code, and a portable report.

## Judge walkthrough

1. Open **Live Desk** and choose `rTSLAUSDT` to show that each instrument creates a new Passport.
2. Run the integrity scan. The badge explicitly distinguishes `LIVE` from `SNAPSHOT` and `QWEN` from `RULES`.
3. Expand **Quote freshness** to audit thresholds and source ages.
4. Read the **Move explanation** panel: likely catalyst, supporting evidence, alternative explanations, and headlines rejected on timing.
5. Select an evidence item and open **Inspect provenance** to reveal its endpoint and retrieval timestamp.
6. Open **Gate** and run the integrity sweep: four verdicts, each naming its evidence, its conditions and its next step. Expand one to audit the evidence provenance, then open the flagged instrument in the Desk.
7. Open **Stress** to see the closed-market drift distribution for an instrument, the comparable historical episodes, and what the following session did in each.
8. Open **Replay Lab** to inspect frozen cases and **Methodology** to see the Observe → Verify → Explain → Gate → Abstain boundary and the declared limits.

## Architecture

```text
Bitget rToken ticker ─┬─> deterministic checks ─> Market State Passport
Bitget Stock+ quote ──┤            │
official daily closes ┘            ├─> move start + drift + turnover + spread ─┐
                                   │                                           ├─> verdict buckets ─> Qwen narrative
keyless headline feeds ────────────┴─> publication-time classification ────────┘   (cited IDs only, server-side key)

rToken hourly candles ─┬─> session-boundary episodes ─> drift distribution ─┐
official daily closes ─┘                                                    ├─> /api/study
                                                                            └─> matched episodes ─> base rate (no model)

ticker + candles + reference ─> measured state ─> ordered gate rules ─> /api/sweep
                                                          │
                                                          └─> verdict + evidence ids + conditions ─> desk log
```

Retrieval lives in `api/_lib/sources.js`; the deterministic modules (`analysis.js`,
`gate.js`, `study.js`) retrieve nothing and call no model, which is what makes every
verdict reproducible from the evidence it cites.

The browser sends only a symbol and a question to `/api/analyze`. Every record the
answer rests on is retrieved, timestamped and ranked server-side, so a client can
never supply its own evidence and have the model endorse it. The model does not
calculate premiums, drift or timing, does not rank catalysts, does not predict
returns, and does not execute orders.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

The Vite-only local run uses the snapshot fallback because `/api/scan` is a Vercel function. Use `vercel dev` to exercise the serverless route locally, or deploy to Vercel.

Set `BITGET_QWEN_API_KEY` only in the server environment to enable the model-backed evidence brief. Qwen output is accepted only when its bracketed citations resolve to supplied evidence IDs; the UI exposes those IDs as selectable evidence links. Without the key, the UI remains functional, explains the deterministic fallback, and labels it `RULES`; the key is never shipped to the browser.

For production, add the key as a Vercel **Production** environment variable in Project Settings, then redeploy. Do not place it in `.env`, commit history, screenshots, issue text, or client-side `VITE_*` variables. Confirm activation by running a scan and checking that the brief badge reads `LIVE · QWEN` and exposes clickable evidence citations.

The public rToken ticker can run without exchange credentials. The Stock+ underlying quote is authenticated; optionally configure the read-only server variables `BITGET_ACCESS_KEY`, `BITGET_SECRET_KEY`, and `BITGET_PASSPHRASE`. If they are absent, the deployment returns a real partial-live Passport with the underlying and dependent checks marked `UNVERIFIABLE`—it never mixes the live rToken with a snapshot underlying. Follow the [read-only Stock+ setup](docs/stockplus-read-only-setup.md) without exposing the key to the repository or browser.

## Validation

The 42-second submission film is available as an [MP4](submission/market-integrity-desk-demo.mp4), with a separate [caption file](submission/market-integrity-desk-demo.srt) and [thumbnail](submission/demo-thumbnail.png). It was rendered from the reproducible Remotion source in `video/`.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

Current developer-observed validation:

- 123/123 tests pass: query and instrument resolution (5), published deterministic integrity rules (22), session labelling, session-aware two-tier reference selection, move detection and start location, the 20 bps event boundary, headline timing verdicts (`POSSIBLE`, `POSSIBLE_CONTRIBUTING`, `TIMING_INCONSISTENT`, `DISTANT`, `TIME_UNKNOWN`), drift, turnover acceleration, top-of-book spread, verdict assembly, confidence rules and the citation gate (36), the ordered gate rules with pipeline contract tests that feed real `pickReference` output into `evaluateGate` (34), and episode construction, drift distribution, scenario matching, underlying-close attachment, outcome classification and the stress-test verdict (26).
- Production build and lint pass.
- Desktop and 390 × 844 browser walkthroughs pass without document-level horizontal overflow.
- Natural-language instrument resolution, question-aware Qwen synthesis, instrument switching, live and fallback scans, navigation, check expansion, evidence selection, and raw provenance reveal were exercised in a production browser.
- The move-explanation endpoint was exercised end to end against live Bitget candles and live headline feeds: a quiet tape produced `NO_MATERIAL_MOVE` with no catalyst named, and a +180 bps repricing with six retrieved headlines all published 57–270 minutes earlier produced `NO_STRONG_CATALYST` with `MEDIUM` confidence rather than a fabricated cause.
- A 2026-09-11 production matrix verified `LIVE · QWEN` for all four supported instruments; all four returned citation sets that exactly matched the evidence IDs present in their briefs, with investigator latency from 7.42 to 12.85 seconds.
- A second frozen benchmark captured 16 instrument-time cases across four closed five-minute cutoffs. Deterministic state accuracy, Qwen availability, citation validity, and bounded-abstention rate were 100%; directional-claim rate was 0%; median Qwen latency was 8.581 seconds.
- The submission film was verified as 1920 × 1080, 30 fps, H.264/AAC, 42.048 seconds.

These are product QA observations, not user-adoption or trading-performance claims. The first benchmark slice contains 16 instrument-time cases but only four unique clock cutoffs, and every case tests the missing-Stock+ path. It proves abstention discipline, not balanced classification or trading accuracy.

## Data policy

The application never turns an unavailable endpoint into a negative fact. In particular, missing Reality depth is shown as `NOT OBSERVABLE`, and missing corporate-action data is shown as `UNVERIFIABLE`.

## Current limitations

- The public rToken path and authenticated Stock+ quote path are verified in production. A 2026-09-14 AAPL run returned both prices and a deterministic +14 bps comparison.
- **While the underlying's main session is running, the gate needs the authenticated Stock+ quote.** If that credential is absent or the endpoint fails, every instrument is blocked as `UNVERIFIABLE_REFERENCE` — correctly, because a live basis cannot be established without it — and the desk reports the retrieval layer's own account of why rather than a market finding. Outside the main session the official-close tier keeps the desk fully functional without credentials.
- The stress test covers the retrieved window only: 500 hourly candles, roughly three weeks and a dozen or so closed-market episodes. It claims no statistical significance, and its excursion figures come from hourly highs and lows.
- The desk log is stored in the browser, so it is per-device and does not survive clearing site data. It is an audit trail, not a server-side record, and it holds no positions because the desk places no orders.
- The frozen benchmark is published, but matched Stock+ candle cases remain absent. On 2026-09-15, both official current and historical Stock+ candle endpoints authenticated but returned empty lists across all four supported symbols during a U.S. intraday probe, so the original missing-reference slice has not been overwritten or replaced with synthetic history.
- The official `bitget-signal` MCP was investigated as a macro/news perception layer. Its current stock-price and selected-news probes were slow and returned errors or empty data, so it is not represented as a production integration.
- Headlines come from keyless public feeds (Yahoo Finance search, with Google News RSS as fallback) and are accepted only when the headline names the instrument. A genuine catalyst that never names it will be missed, and the lookback window is bounded at 8 hours.
- Catalyst ranking is a timing verdict, not a causal proof. A headline published inside the catalyst window is reported as consistent with the move; the desk never states that it caused the move.
- The move-explanation window is the most recent 200 closed five-minute candles, so an event older than roughly 16 hours is out of scope.
- The sponsor Qwen path and first frozen benchmark slice are verified in production. External user testing and a balanced matched-source benchmark remain outstanding.
- Research only; no order execution and no investment advice.

## Repository map

- `api/analyze.js` — the Desk: retrieval plus move explanation and the Qwen investigator.
- `api/sweep.js` — the Gate: one pass over the watchlist, gated verdicts, and a self-check that every verdict cites evidence the sweep holds.
- `api/study.js` — the Stress test: closed-market episodes, the drift distribution and matched historical outcomes.
- `api/_lib/sources.js` — the only file that talks to an external source: Bitget endpoints, HMAC signing, headline feeds, official daily closes.
- `api/_lib/analysis.js` — pure measurement: sessions, the two-tier reference, move detection, drift, turnover, spread.
- `api/_lib/gate.js` — pure, ordered gate rules and the sweep summary.
- `api/_lib/study.js` — pure episode construction, outcome classification and scenario matching.
- `src/lib/integrity.ts` — published deterministic rules.
- `src/lib/desklog.ts` — the browser-local audit trail and its refusal statistics.
- `src/data/snapshots.ts` — labeled product demonstration snapshots.
- `benchmark/` — immutable cases, separate labels, Qwen outputs, evaluator results, and portable report.
- `benchmark/bitget-signal-probe.json` — saved decision gate for the optional official macro/news perception layer.
- `docs/stockplus-read-only-setup.md` — least-privilege credential setup and verification procedure.
- `scripts/verify-stockplus.mjs` — read-only Stock+ entitlement check that never prints credentials.
- `scripts/probe-bitget-signal.mjs` — reproducible health and usefulness gate for the optional official Signal layer.
- `design/fidelity-ledger.md` — concept-to-implementation comparison and intentional deviations.
- `submission/` — judge walkthrough, submission-form draft, validation record, and recording script.

## Security and data discipline

- No exchange credentials are required for the read-only market scan.
- `BITGET_QWEN_API_KEY` stays in the server environment.
- Symbols are selected from a fixed allowlist; arbitrary upstream URLs are not accepted.
- Model input size, output length, request duration, and cited evidence IDs are bounded.
- No wallet, order, balance, or private user data is collected.
