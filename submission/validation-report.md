# Validation Record

Date: 2026-09-11
Scope: local engine plus public production workflow
Operator: project developer

## Observed results

| Check | Result | Evidence |
|---|---:|---|
| Deterministic and query-routing unit tests | 9/9 passed | `npm.cmd test` |
| Production build | Passed | `npm.cmd run build` |
| Static lint | Passed | `npm.cmd run lint` |
| API syntax checks | 2/2 passed | `node --check api/scan.js`, `node --check api/evidence.js` |
| Core browser tasks | Passed | Natural-language query, question-aware Qwen answer, instrument switch, live/fallback scan, row expansion, evidence selection, provenance reveal, Replay and Method navigation |
| Desktop viewport | Passed | `design/implementation-desktop-final.png`, 1440 × 1000 |
| Mobile viewport | Passed | `design/implementation-mobile-final.png`, 390 × 844; no document-level horizontal overflow |
| Public deployment | Passed | Stable Vercel URL returned HTTP 200 |
| Public live rToken scan | Passed | Bitget returned current rToken tickers; missing Stock+ remained explicit |
| Public natural-language task | Passed | An Apple question resolved to rAAPLUSDT; the exact question appeared in the result and Qwen answered it directly |
| Production Qwen matrix | 4/4 passed | NVDA, AAPL, TSLA, and QQQ returned `LIVE · QWEN`; returned evidence IDs exactly matched brief citations |
| Production Qwen latency | 7.42–12.85 s | One developer-operated run per supported instrument on 2026-09-11 |
| Submission film | Passed | 42.048 s; 1920 × 1080; 30 fps; H.264 video and AAC audio; six representative frames visually inspected |

## What these results prove

- The deterministic calculations and state thresholds behave as tested.
- The production client compiles and the current code passes static checks.
- The primary research workflow is operable in a real browser.
- The submitted natural-language question reaches the bounded Qwen investigator rather than serving only as a symbol selector.
- The production sponsor endpoint can return citation-verified briefs for every supported instrument.
- Failure states remain visible and inspectable.
- The deployed server can retrieve the public Bitget rToken ticker and preserve an authenticated Stock+ failure as a partial-live `UNVERIFIABLE` Passport.
- Watchlist quotes are populated only by current-session live scans; frozen fixtures no longer appear as live watchlist prices.
- Snapshot evidence retains its frozen source timestamp and is never presented with a synthetic current quote age.

## What these results do not prove

- Live Bitget availability from every deployment region.
- Historical classification accuracy, user adoption, retention, AUM, volume, fees, or investment performance.
- Qwen availability or latency outside the four observed production calls.

## Next benchmark protocol

Freeze 12–20 cases with a timestamp boundary and immutable evidence bundle. Keep labels in a separate file until evaluation. Compare rules-only, LLM-only, and hybrid outputs on:

1. state accuracy;
2. unsupported-claim rate;
3. temporal-contradiction catch rate;
4. abstention precision;
5. median completion time.

Every published metric must be labeled observed, estimated, or targeted. Demonstration fixtures must never be described as historical evidence.
