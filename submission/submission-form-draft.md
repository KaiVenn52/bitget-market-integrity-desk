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

Market Integrity Desk produces a Market State Passport for each supported rToken. Deterministic code calculates token-versus-underlying premium, quote freshness, and session consistency using declared thresholds. The model is a bounded investigator: it receives only recorded checks and source items, summarizes what they support, cites supplied evidence IDs, and must abstain when facts are unavailable. The product never converts a failed request into a negative fact, predicts returns, or executes an order.

### Part 2 · Target user and product value

The primary user is a research-driven Retail or Pro Bitget trader with approximately US$10,000–US$250,000 in deployable capital, medium risk tolerance, a 3–20 name tokenized-equity watchlist, and several pre-trade research checks per week. The specific use case is deciding whether an apparent rToken move is based on fresh underlying information or sits inside a stale, contradictory, or partially unobservable market state.

This user currently has to compare exchange quotes, underlying-market timestamps, session status, and news manually. A price terminal does not distinguish unavailable depth from thin liquidity, and a generic LLM can attach a plausible but temporally impossible news explanation. The Passport compresses that research into an auditable view while keeping every conclusion inspectable.

### Part 3 · Validation data and key metrics

**Observed — developer QA:** 9/9 deterministic and natural-language routing unit tests passed; production TypeScript build and lint passed; the core browser walkthrough covers natural-language instrument resolution, question-aware Qwen synthesis, instrument switch, live/fallback scan, deterministic-row expansion, evidence selection, provenance reveal, research action, and view navigation. Desktop and 390 × 844 responsive checks produced no document-level horizontal overflow.

**Observed — production Qwen matrix (2026-09-11, one developer-operated run per instrument):** rNVDAUSDT, rAAPLUSDT, rTSLAUSDT, and rQQQUSDT all returned `LIVE · QWEN`. Each response's clickable evidence-ID set exactly matched the citations present in its brief. Investigator latency ranged from 7.42 to 12.85 seconds. This verifies runtime integration and citation enforcement, not research accuracy or user adoption.

**Observed — frozen benchmark (2026-09-11):** 16 immutable instrument-time cases were captured across four supported rTokens and four fully closed five-minute cutoffs. Separate labels, evidence digests, saved Qwen outputs, evaluator code, and a portable report are published in `benchmark/`. Deterministic state accuracy, Qwen availability, citation validity, and bounded-abstention rate were 100%; directional-claim rate was 0%; median Qwen latency was 8.581 seconds. Because the authenticated Stock+ path was unavailable, all cases test the `UNVERIFIABLE` state; this is not a balanced classification or trading-performance result.

**Observed — evidence discipline:** every current Passport preserves source and retrieval timestamps; unavailable Reality depth is labeled `NOT OBSERVABLE`; unavailable corporate-action context is labeled `UNVERIFIABLE`; snapshot and rules-only modes are visibly labeled. These are implementation observations, not trading-performance claims.

**Not yet observed:** external user activation, retention, trading volume, AUM, incremental fee, and balanced historical classification accuracy. The next validation slice adds matched Stock+ candles and aligned/caution/stale cases, then compares rules-only, LLM-only, and hybrid outputs on state accuracy, unsupported-claim rate, temporal-contradiction catch rate, abstention precision, and median task time.

**Targeted distribution metrics:** 10 qualified tester walkthroughs, at least 80% unaided task completion, median Passport comprehension under 90 seconds, and at least 30% seven-day return usage among testers. Any downstream trading-volume or fee effect will be reported only after observed, never inferred from demo usage.

### Part 4 · Progress

Built: natural-language research intake, question-aware Qwen answers, responsive Live Desk, live-session watchlist, deterministic Passport engine, explicit failure states, actionable research handoff, expandable checks, evidence timeline, per-item provenance, an observed 16-case Replay benchmark, Methodology view, Vercel scan/capture endpoints, and a bounded Qwen evidence endpoint with citation-ID validation. The Bitget integration targets UTA v3 market tickers/candles and Stock+ quotes/candles; the investigator uses Qwen 3.8 Max through the hackathon Responses endpoint with a server-side key.

Problems solved: direct Bitget requests timed out in the initial local network, so the application fails closed into a frozen, timestamped fixture instead of presenting stale data as live. The production deployment returns a current Bitget rToken ticker while unavailable Stock+ reference data remains explicit. Watchlist prices now update only from current-session live scans, and unverifiable session status no longer receives a positive visual treatment. Reality order-book access was not assumed; the product returns `NOT OBSERVABLE`. Model output is accepted only when bracketed citations resolve to IDs in the supplied evidence set.

Not yet completed: deployment-environment verification of the authenticated Stock+ path, a balanced matched-source benchmark, and external user testing. The public rToken path, question-aware Qwen workflow, citation gate, natural-language task, and first missing-reference benchmark slice have been verified in production. The official `bitget-signal` MCP was probed for stock/macro/news context but was not promoted into the live path because the required probes returned errors or empty data with roughly 20-second latency. Next: add read-only Stock+ credentials, rerun the same collector for matched cases, and run tester sessions.

Frameworks and APIs: React, TypeScript, Vite, Vitest, Vercel Functions, Bitget UTA v3 market tickers/candles, Bitget Stock+ quotes/candles, and Qwen 3.8 Max through the Bitget hackathon endpoint. The official `bitget-signal` MCP was evaluated for macro/news context but is not claimed as integrated because the reproducible probes did not return usable data.

### Part 5 · Take on AI Trading

In trading systems, the LLM should not be the calculator or an ungrounded price oracle. It is most valuable where evidence is heterogeneous: extracting event facts, comparing publication time with price-movement time, exposing contradictions, and explaining why the system must abstain. Deterministic software should own arithmetic and hard risk boundaries; the model should add evidence synthesis and workflow orchestration. Agentic trading becomes more trustworthy when the agent can prove what it knew, when it knew it, and which required facts were missing.

## Role of the LLM / AI

Qwen 3.8 Max acts as a bounded evidence investigator. It receives the trader's exact research question together with deterministic Passport checks and recorded evidence items, answers the question directly, and cites only supplied source IDs. The question is treated as untrusted data and cannot override the model's evidence boundary. Qwen is prohibited from calculating premiums, predicting direction, recommending a trade, inventing missing facts, or treating unavailable data as a negative finding. If the endpoint is unavailable or the response lacks valid evidence IDs, the product keeps the deterministic brief and labels it `RULES` rather than `QWEN`. AI coding assistance was also used during implementation, but the product's runtime AI role is the citation-preserving investigation step.

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
