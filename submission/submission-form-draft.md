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

**Observed — developer QA:** 9/9 deterministic and natural-language routing unit tests passed; production TypeScript build and lint passed; the core browser walkthrough covers natural-language instrument resolution, instrument switch, live/fallback scan, deterministic-row expansion, evidence selection, provenance reveal, research action, and view navigation. Desktop and 390 × 844 responsive checks produced no document-level horizontal overflow.

**Observed — evidence discipline:** every current Passport preserves source and retrieval timestamps; unavailable Reality depth is labeled `NOT OBSERVABLE`; unavailable corporate-action context is labeled `UNVERIFIABLE`; snapshot and rules-only modes are visibly labeled. These are implementation observations, not trading-performance claims.

**Not yet observed:** external user activation, retention, trading volume, AUM, incremental fee, and historical classification accuracy. The next validation stage freezes 12–20 point-in-time cases, publishes labels and evidence cutoffs, and compares rules-only, LLM-only, and hybrid outputs on state accuracy, unsupported-claim rate, temporal-contradiction catch rate, abstention precision, and median task time.

**Targeted distribution metrics:** 10 qualified tester walkthroughs, at least 80% unaided task completion, median Passport comprehension under 90 seconds, and at least 30% seven-day return usage among testers. Any downstream trading-volume or fee effect will be reported only after observed, never inferred from demo usage.

### Part 4 · Progress

Built: natural-language research intake, responsive Live Desk, live-session watchlist, deterministic Passport engine, explicit failure states, actionable research handoff, expandable checks, evidence timeline, per-item provenance, Replay Lab, Methodology view, Vercel scan endpoint, and a bounded Qwen evidence endpoint with citation-ID validation. The Bitget integration targets UTA v3 market tickers and Stock+ quotes; the investigator targets the hackathon Qwen Responses endpoint with a server-side key.

Problems solved: direct Bitget requests timed out in the initial local network, so the application fails closed into a frozen, timestamped fixture instead of presenting stale data as live. The production deployment returns a current Bitget rToken ticker while unavailable Stock+ reference data remains explicit. Watchlist prices now update only from current-session live scans, and unverifiable session status no longer receives a positive visual treatment. Reality order-book access was not assumed; the product returns `NOT OBSERVABLE`. Model output is accepted only when bracketed citations resolve to IDs in the supplied evidence set.

Not yet completed: deployment-environment verification of the authenticated Stock+ and Qwen paths, frozen historical benchmark, and external user testing. The public rToken path and natural-language workflow have been verified in production, and a 42-second public demo film has been rendered. Next: configure sponsor credentials if issued, publish the benchmark artifact, and run tester sessions.

Frameworks and APIs: React, TypeScript, Vite, Vitest, Vercel Functions, Bitget UTA v3 market ticker, Bitget Stock+ quote, and Qwen 3.8 Max through the Bitget hackathon endpoint.

### Part 5 · Take on AI Trading

In trading systems, the LLM should not be the calculator or an ungrounded price oracle. It is most valuable where evidence is heterogeneous: extracting event facts, comparing publication time with price-movement time, exposing contradictions, and explaining why the system must abstain. Deterministic software should own arithmetic and hard risk boundaries; the model should add evidence synthesis and workflow orchestration. Agentic trading becomes more trustworthy when the agent can prove what it knew, when it knew it, and which required facts were missing.

## Role of the LLM / AI

Qwen 3.8 Max acts as a bounded evidence investigator. It receives the deterministic Passport checks and recorded evidence items, writes a compact market-state brief, and cites the supplied evidence IDs. It is prohibited from calculating premiums, predicting direction, recommending a trade, inventing missing facts, or treating unavailable data as a negative finding. If the endpoint is not configured or the response lacks valid evidence IDs, the product keeps the deterministic brief and labels it `RULES` rather than `QWEN`. AI coding assistance was also used during implementation, but the product's runtime AI role is the citation-preserving investigation step.

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
