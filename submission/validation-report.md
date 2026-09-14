# Validation Record

Date: 2026-09-15
Scope: local engine plus public production workflow
Operator: project developer

## Observed results

| Check | Result | Evidence |
|---|---:|---|
| Deterministic and query-routing unit tests | 27/27 passed | Published ±20/±100 bps and 30/120-second boundaries, state degradation, missing checks, and natural-language routing |
| Production build | Passed | `npm.cmd run build` |
| Static lint | Passed | `npm.cmd run lint` |
| API syntax checks | 2/2 passed | `node --check api/scan.js`, `node --check api/evidence.js` |
| Core browser tasks | Passed | Natural-language query, question-aware Qwen answer, instrument switch, live/fallback scan, row expansion, evidence selection, provenance reveal, Replay and Method navigation |
| Judge proof discoverability | Passed | Live Desk names the Bitget rToken, read-only Stock+, and bounded Qwen layers and links directly to validation, benchmark, and source artifacts |
| Desktop viewport | Passed | `design/implementation-desktop-final.png`, 1440 × 1000 |
| Mobile viewport | Passed | `design/implementation-mobile-final.png`, 390 × 844; no document-level horizontal overflow |
| Public deployment | Passed | Stable Vercel URL returned HTTP 200 |
| Public live rToken scan | Passed | Bitget returned current rToken tickers |
| Authenticated Stock+ quote | Passed | AAPL returned a real Stock+ reference price; production calculated a deterministic +14 bps comparison and preserved the stale-quote caution |
| Authenticated Stock+ candles | Partial | Both current and historical official endpoints authenticated but returned empty lists across all four supported symbols, including a U.S. intraday probe; no matched cases were fabricated |
| Immediate research entry | Passed | Initial automatic Qwen scan removed; the primary action was enabled after DOM load at 1440 × 1000 and 390 × 844 |
| Public natural-language task | Passed | An Apple question resolved to rAAPLUSDT; the exact question appeared in the result and Qwen answered it directly |
| Production Qwen matrix | 4/4 passed | NVDA, AAPL, TSLA, and QQQ returned `LIVE · QWEN`; returned evidence IDs exactly matched brief citations |
| Production Qwen latency | 7.42–12.85 s | One developer-operated run per supported instrument on 2026-09-11 |
| Frozen benchmark | 16/16 cases evaluated | Four instruments × four closed five-minute cutoffs; immutable evidence digests and separate labels published in `benchmark/` |
| Benchmark evidence boundary | Passed | 100% deterministic state accuracy, Qwen availability, citation validity, and bounded abstention; 0% directional claims |
| Benchmark bundle integrity | Passed | 100% SHA-256 digest validity, five-minute cutoff validity, and OHLC validity; ID coverage matched across cases, labels, and Qwen outputs |
| Benchmark median Qwen latency | 8.581 s | Saved per-case production timings |
| Production Replay regression | Passed | 16 rows and protocol disclosure verified at 1440 × 1000 and 390 × 844; no framework overlay, document overflow, or console issues |
| Portable report packaging | Passed with structural-only browser status | 14 blocks, 5 metrics, 1 chart, and 1 table packaged; local Chromium headless-shell was unavailable to the official verifier |
| Submission film | Passed | 42.048 s; 1920 × 1080; 30 fps; H.264 video and AAC audio; six representative frames visually inspected |

## What these results prove

- The deterministic calculations and state thresholds behave as tested.
- Controlled boundary tests cover both signs of price divergence, exact threshold transitions, source-age degradation, and the minimum observable-check rule. These are rule tests, not historical-market accuracy claims.
- The production client compiles and the current code passes static checks.
- The primary research workflow is operable in a real browser.
- The submitted natural-language question reaches the bounded Qwen investigator rather than serving only as a symbol selector.
- The production sponsor endpoint can return citation-verified briefs for every supported instrument.
- The frozen missing-reference slice is reproducible and the hybrid workflow abstains consistently when Stock+ evidence is absent.
- Failure states remain visible and inspectable.
- The live Stock+ path records corporate-action unavailability as its own source item, so Qwen can cite the missing-evidence boundary instead of relying on an uncited check label.
- The deployed server can retrieve both the public Bitget rToken ticker and authenticated Stock+ quote, calculate their signed basis-point difference, and preserve independent source ages.
- A judge can reach the validation record, frozen benchmark, and public source repository from the production interface without relying on the submission description.
- Watchlist quotes are populated only by current-session live scans; frozen fixtures no longer appear as live watchlist prices.
- Snapshot evidence retains its frozen source timestamp and is never presented with a synthetic current quote age.

## What these results do not prove

- Live Bitget availability from every deployment region.
- Historical classification accuracy, user adoption, retention, AUM, volume, fees, or investment performance.
- Balanced state-classification accuracy: all 16 frozen benchmark cases still share the `UNVERIFIABLE` gold label because Stock+ credentials were absent when that immutable slice was captured.
- Qwen availability or latency outside the 20 observed production calls (four live workflow checks plus 16 frozen benchmark requests).

## Benchmark protocol and next slice

The first slice freezes 16 instrument-time cases with immutable evidence bundles and keeps labels separate. Both official current and historical Stock+ candle routes were retried on 2026-09-15 and returned successful empty lists for all four instruments despite the quote entitlement working. A balanced matched-source slice therefore remains blocked by source availability and is not substituted with synthetic history. If source rows become available, continue evaluating:

1. state accuracy;
2. unsupported-claim rate;
3. temporal-contradiction catch rate;
4. abstention precision;
5. median completion time.

Every published metric must be labeled observed, estimated, or targeted. Demonstration fixtures must never be described as historical evidence.
