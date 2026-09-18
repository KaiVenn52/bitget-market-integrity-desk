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
4. **Abstain:** expose `UNVERIFIABLE`, `NOT OBSERVABLE` and `NO_STRONG_CATALYST` instead of inventing confidence or a cause.

The target user is a research-driven, medium-frequency Bitget rToken trader who checks a small watchlist before acting, trades while the U.S. market is closed, and values evidence quality over directional predictions.

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
- A clearly labeled snapshot fallback when live sources cannot be reached.
- A published 16-case frozen benchmark with separate labels, saved Qwen outputs, SHA-256 evidence digests, evaluator code, and a portable report.

## Judge walkthrough

1. Open **Live Desk** and choose `rTSLAUSDT` to show that each instrument creates a new Passport.
2. Run the integrity scan. The badge explicitly distinguishes `LIVE` from `SNAPSHOT` and `QWEN` from `RULES`.
3. Expand **Quote freshness** to audit thresholds and source ages.
4. Read the **Move explanation** panel: likely catalyst, supporting evidence, alternative explanations, and headlines rejected on timing.
5. Select an evidence item and open **Inspect provenance** to reveal its endpoint and retrieval timestamp.
6. Open **Replay Lab** to inspect frozen cases and **Methodology** to see the Observe → Verify → Explain → Abstain boundary.

## Architecture

```text
Bitget rToken ticker ─┐
                      ├─> deterministic checks ─> Market State Passport
Bitget Stock+ quote ─┘            │
                                  ├─> move start + drift + turnover + spread ─┐
                                  │                                           ├─> verdict buckets ─> Qwen narrative
keyless headline feeds ───────────┴─> publication-time classification ────────┘   (cited IDs only, server-side key)
```

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

- 54/54 tests pass: deterministic and natural-language routing (27), plus 27 move-explanation tests covering session labelling, session-aware reference selection, move detection and start location, the 20 bps event boundary, headline timing verdicts (`POSSIBLE`, `POSSIBLE_CONTRIBUTING`, `TIMING_INCONSISTENT`, `DISTANT`, `TIME_UNKNOWN`), drift, turnover acceleration, top-of-book spread, verdict assembly, confidence rules, and the citation gate.
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
- The frozen benchmark is published, but matched Stock+ candle cases remain absent. On 2026-09-15, both official current and historical Stock+ candle endpoints authenticated but returned empty lists across all four supported symbols during a U.S. intraday probe, so the original missing-reference slice has not been overwritten or replaced with synthetic history.
- The official `bitget-signal` MCP was investigated as a macro/news perception layer. Its current stock-price and selected-news probes were slow and returned errors or empty data, so it is not represented as a production integration.
- Headlines come from keyless public feeds (Yahoo Finance search, with Google News RSS as fallback) and are accepted only when the headline names the instrument. A genuine catalyst that never names it will be missed, and the lookback window is bounded at 8 hours.
- Catalyst ranking is a timing verdict, not a causal proof. A headline published inside the catalyst window is reported as consistent with the move; the desk never states that it caused the move.
- The move-explanation window is the most recent 200 closed five-minute candles, so an event older than roughly 16 hours is out of scope.
- The sponsor Qwen path and first frozen benchmark slice are verified in production. External user testing and a balanced matched-source benchmark remain outstanding.
- Research only; no order execution and no investment advice.

## Repository map

- `api/scan.js` — allowlisted, bounded live-source scan.
- `api/evidence.js` — server-only Qwen investigator with evidence-ID validation.
- `api/benchmark-source.js` — allowlisted source capture for closed rToken and optional Stock+ candles.
- `src/lib/integrity.ts` — published deterministic rules.
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
