# Bitget AI Hackathon S2 — Submission Draft

Human-only fields are marked `[[REQUIRED]]`. Do not submit this document without replacing them.

## Team

- **Team Name:** Market Integrity Desk
- **Team Lead Bitget UID:** `[[REQUIRED: numbers only]]`
- **Team Lead Email:** `[[REQUIRED: active email]]`
- **Team Lead Contact:** `[[REQUIRED: Telegram or X handle]]`
- **Member Background:** Developer
- **University Name:** Leave blank unless eligible
- **Apply for Demo Day:** Yes
- **How did you hear about this event?:** Twitter / X
- **Competition Track:** AI Trading Desk
- **Competition Sub-theme:** Open Theme

## Project

- **Project Name:** Market Integrity Desk
- **One-line Project Summary:** Evidence-first AI desk for Bitget rTokens: deterministic market checks, time-bounded reasoning, and auditable source provenance.

## Project Description

### Part 1 · Thesis

Bitget rTokens can trade around the clock while their U.S.-equity underlyings, reference feeds, and corporate-information timelines do not share the same availability. The resulting problem is not simply whether two prices differ; it is whether the current market state is supported by fresh and internally consistent evidence. Existing dashboards show prices, and generic chatbots explain moves, but neither makes missing evidence explicit or lets a researcher reproduce each claim.

Market Integrity Desk produces a Market State Passport for each supported rToken. Deterministic code calculates token-versus-underlying premium, quote freshness, and session consistency using declared thresholds. When the token reprices, the desk measures the move, locates where it began, retrieves timestamped headlines, and ranks each one by publication time against that boundary — labelling a headline published after the move as `TIMING_INCONSISTENT` rather than a cause. The model is a bounded investigator: it receives only recorded checks, computed metrics and source items, narrates what they support, cites supplied evidence IDs, and must abstain when facts are unavailable. The product never converts a failed request into a negative fact, predicts returns, or executes an order.

The product thesis is therefore two-sided: AI explains the move, and the integrity layer proves which parts of that explanation are actually supported. A plausible narrative is not the deliverable; a narrative whose every claim resolves to a timestamped record — and whose missing pieces are named — is.

### Part 2 · Target user and product value

The primary user is a research-driven Retail or Pro Bitget trader with approximately US$10,000–US$250,000 in deployable capital, medium risk tolerance, a 3–20 name tokenized-equity watchlist, and several pre-trade research checks per week. The specific use case is deciding whether an apparent rToken move is based on fresh underlying information or sits inside a stale, contradictory, or partially unobservable market state — and, once the token has repriced, which explanation the record actually supports.

The moment that matters is the one the underlying market cannot cover: while U.S. equities are closed, the rToken still trades, and a trader (or an agent acting for one) has to decide whether a 40 bps or 400 bps gap is information or noise. This desk does not answer that question with a prediction. It answers it with the record: what was fresh, what was stale, which headline was published before the move and which was published after it, and what would have to change for the conclusion to change.

This user currently has to compare exchange quotes, underlying-market timestamps, session status, and news manually. A price terminal does not distinguish unavailable depth from thin liquidity, and a generic LLM can attach a plausible but temporally impossible news explanation. The Passport compresses that research into an auditable view while keeping every conclusion inspectable.

### Part 3 · Validation data and key metrics

**Observed — developer QA:** 54/54 tests passed: 27 deterministic and natural-language routing tests covering both signs of the published price thresholds, exact freshness boundaries, minimum evidence coverage, and state degradation, plus 27 move-explanation tests covering session labelling, session-aware reference selection, move detection and start location, the 20 bps event boundary, headline timing verdicts, drift, turnover acceleration, top-of-book spread, verdict assembly, confidence rules, and the citation gate. Production TypeScript build and lint passed. These controlled rule tests are not historical-market accuracy claims. The core browser walkthrough covers natural-language instrument resolution, question-aware Qwen synthesis, instrument switch, live/fallback scan, deterministic-row expansion, evidence selection, provenance reveal, research action, and view navigation. Desktop and 390 × 844 responsive checks produced no document-level horizontal overflow.

**Observed — production Qwen matrix (2026-09-11, one developer-operated run per instrument):** rNVDAUSDT, rAAPLUSDT, rTSLAUSDT, and rQQQUSDT all returned `LIVE · QWEN`. Each response's clickable evidence-ID set exactly matched the citations present in its brief. Investigator latency ranged from 7.42 to 12.85 seconds. This verifies runtime integration and citation enforcement, not research accuracy or user adoption.

**Observed — frozen benchmark (2026-09-11):** 16 immutable instrument-time cases were captured across four supported rTokens and four fully closed five-minute cutoffs. Separate labels, evidence digests, saved Qwen outputs, evaluator code, and a portable report are published in `benchmark/`. Deterministic state accuracy, Qwen availability, citation validity, and bounded-abstention rate were 100%; directional-claim rate was 0%; median Qwen latency was 8.581 seconds. Because the authenticated Stock+ path was unavailable, all cases test the `UNVERIFIABLE` state; this is not a balanced classification or trading-performance result.

**Observed — evidence discipline:** every current Passport preserves source and retrieval timestamps; unavailable Reality depth is labeled `NOT OBSERVABLE`; unavailable corporate-action context is labeled `UNVERIFIABLE`; snapshot and rules-only modes are visibly labeled. These are implementation observations, not trading-performance claims.

**Observed — repricing attribution, end to end (2026-09-17, developer-operated):** the move-explanation endpoint was exercised against live Bitget candles and live headline feeds. A quiet tape produced `NO_MATERIAL_MOVE` and named no catalyst. An injected +180 bps repricing with six retrieved headlines published 57–270 minutes earlier produced `NO_STRONG_CATALYST` with `MEDIUM` confidence, listed the observed repricing, the 2.57× turnover response and the 172 bps drift as supporting evidence, and rejected every headline on timing rather than selecting the least-bad one. This verifies the refusal path, not catalyst accuracy.

**Observed — overnight drift versus the next session (developer-computed, 2026-09-01 → 2026-09-15, single instrument rTSLAUSDT):** 194 hourly observations inside windows where the underlying could not trade were measured against the last session close. Median absolute drift was 22 bps, the 90th percentile was 133 bps, the maximum was 478 bps, 51.5% of observations exceeded the 20 bps alignment threshold, 14.9% exceeded 100 bps, and 6.2% exceeded 200 bps. Comparing the pre-open token price with the following session's official close-to-close move across 8 nights gave a mean absolute error of 108 bps, correct direction on 6 of 8 nights, and all three repricings larger than 400 bps correct in direction and within 114 bps of the eventual move. The largest case: on 2026-09-04 the token stood 478 bps below its previous close before the U.S. market opened, and TSLA closed 592 bps lower that session.

**Limits of that study:** one instrument, eight nights, a developer-computed measurement rather than an audited dataset, no statistical significance claimed, and the reading is taken roughly 30 minutes before the open, so part of the relationship is mechanical (a same-day open-to-close move). The conclusion drawn is narrow and defensible: overnight rToken repricing carried information about the next session in this sample, which is precisely why the desk exists — not to predict the move, but to state which parts of an explanation the record supports, and to name what it cannot verify.

**Not yet observed:** external user activation, retention, trading volume, AUM, incremental fee, and balanced historical classification accuracy. If Stock+ candle rows become available, the next benchmark slice will add matched aligned/caution/stale cases and compare rules-only, LLM-only, and hybrid outputs on state accuracy, unsupported-claim rate, temporal-contradiction catch rate, abstention precision, and median task time.

External user-testing and retention metrics are not claimed in this submission. The submitted validation scope is developer-operated production QA, controlled boundary tests, cited live Qwen runs, and a frozen replay benchmark. Any downstream trading-volume or fee effect will be reported only after it is directly observed, never inferred from demo usage.

### Part 4 · Progress

Built: natural-language research intake, question-aware Qwen answers, responsive Live Desk, live-session watchlist, deterministic Passport engine, explicit failure states, actionable research handoff, expandable checks, evidence timeline, per-item provenance, an observed 16-case Replay benchmark, Methodology view, Vercel scan/capture endpoints, and a bounded Qwen investigator with citation-ID validation. The current version adds a move-explanation desk: repricing detection across 5/15/60-minute windows with start location, session-aware Stock+ reference selection (regular, pre-market, after-hours, overnight), drift widening/convergence over 15 minutes, turnover acceleration, top-of-book spread and size, relevance-filtered timestamped headlines, and deterministic verdict buckets (`MOST_SUPPORTED`, `POSSIBLE_CONTRIBUTING`, `TIMING_INCONSISTENT`, `NO_STRONG_CATALYST`, `NO_MATERIAL_MOVE`) with an explicit confidence rule and a "what would change this conclusion" list. A production-proof strip names each live layer and links judges directly to validation, benchmark, and source artifacts. The Bitget integration targets UTA v3 market tickers/candles and Stock+ quotes/candles; the investigator uses Qwen 3.8 Max through the hackathon Responses endpoint with a server-side key.

Trust boundary: the previous browser-supplied investigator endpoint was retired. The client now sends only a symbol and a question to a single analysis endpoint that retrieves the sources, computes the metrics, assembles the evidence set, and then lets the model narrate it. A client can no longer submit its own "evidence" and have the model endorse it, and the model cannot rank catalysts or compute timing because those verdicts are already fixed by deterministic code before it is called.

Problems solved: direct Bitget requests timed out in the initial local network, so the application fails closed into a frozen, timestamped fixture instead of presenting stale data as live. The production deployment returns a current Bitget rToken ticker while unavailable Stock+ reference data remains explicit. Watchlist prices now update only from current-session live scans, and unverifiable session status no longer receives a positive visual treatment. The desk opens immediately without spending a Qwen request or locking the research action; after submission it exposes the transition from Bitget retrieval to Qwen audit. Reality order-book access was not assumed; the product returns `NOT OBSERVABLE`. Model output is accepted only when bracketed citations resolve to IDs in the supplied evidence set.

Not yet completed: a balanced matched-source benchmark. The public rToken path, authenticated Stock+ quote path, question-aware Qwen workflow, citation gate, natural-language task, and first missing-reference benchmark slice have been verified in production. On 2026-09-14, the AAPL production run returned both the rToken and Stock+ prices and calculated a deterministic +14 bps comparison; the state remained `CAUTION` because the weekend underlying quote was stale. On 2026-09-15, both official current and historical Stock+ candle routes authenticated but returned empty lists for all four supported symbols during a U.S. intraday probe, so the original frozen benchmark was not overwritten and synthetic history was not substituted. External user testing is outside this submission's validation scope; adoption, retention, and comprehension are not claimed. The official `bitget-signal` MCP was probed for stock/macro/news context but was not promoted into the live path because the required probes returned errors or empty data with roughly 20-second latency.

Frameworks and APIs: React, TypeScript, Vite, Vitest, Vercel Functions, Bitget UTA v3 market tickers/candles, Bitget Stock+ quotes/candles, and Qwen 3.8 Max through the Bitget hackathon endpoint. The official `bitget-signal` MCP was evaluated for macro/news context but is not claimed as integrated because the reproducible probes did not return usable data.

### Part 5 · Take on AI Trading

In trading systems, the LLM should not be the calculator or an ungrounded price oracle. It is most valuable where evidence is heterogeneous: extracting event facts, comparing publication time with price-movement time, exposing contradictions, and explaining why the system must abstain. Deterministic software should own arithmetic and hard risk boundaries; the model should add evidence synthesis and workflow orchestration. Agentic trading becomes more trustworthy when the agent can prove what it knew, when it knew it, and which required facts were missing.

## Role of the LLM / AI

Qwen 3.8 Max acts as a bounded investigator and narrator. It receives the trader's exact research question together with deterministic checks, computed metrics (repricing, drift, turnover, spread, session) and recorded evidence items including each headline's publication time and timing verdict. It answers the question directly and cites only supplied source IDs. The question is treated as untrusted data and cannot override the model's evidence boundary. Qwen is prohibited from calculating premiums, drift or timing, from overturning a timing verdict, from predicting direction, from recommending a trade, from inventing missing facts, and from treating unavailable data as a negative finding. If the endpoint is unavailable, or the response lacks resolvable evidence IDs, the product keeps the deterministic narrative and labels it `RULES` rather than `QWEN`. AI coding assistance was also used during implementation, but the product's runtime AI role is the citation-preserving explanation step — the model narrates a verdict it did not produce.

## Submission Material Links

- **Required · Project demo:** https://bitget-market-integrity-desk.vercel.app
- **Required · Public GitHub repository:** https://github.com/KaiVenn52/bitget-market-integrity-desk
- **Required · Full research-task walkthrough:** https://github.com/KaiVenn52/bitget-market-integrity-desk/blob/main/submission/walkthrough.md
- **Recommended · Demo video, ≤3 minutes:** https://github.com/KaiVenn52/bitget-market-integrity-desk/raw/main/submission/market-integrity-desk-demo.mp4
- **Validation report:** https://github.com/KaiVenn52/bitget-market-integrity-desk/blob/main/submission/validation-report.md
- **Methodology and limitations:** https://github.com/KaiVenn52/bitget-market-integrity-desk/blob/main/README.md

## Remaining form fields

- **X Project Post URL:** `[[REQUIRED AFTER PUBLICATION]]`
- **Did this team participate in S1?:** `[[REQUIRED: Yes or No]]`
- **Material Additions Since S1:** Leave blank if No; otherwise describe only substantial additions.
- **Apply for Post-event Kimi K3 Token Credits:** Yes
- **Open to Playbook Review and Listing Discussion:** Yes
