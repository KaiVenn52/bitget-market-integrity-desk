# Validation Record

Date: 2026-09-09  
Scope: local product behavior and deterministic engine  
Operator: project developer

## Observed results

| Check | Result | Evidence |
|---|---:|---|
| Deterministic and query-routing unit tests | 9/9 passed | `npm.cmd test` |
| Production build | Passed | `npm.cmd run build` |
| Static lint | Passed | `npm.cmd run lint` |
| API syntax checks | 2/2 passed | `node --check api/scan.js`, `node --check api/evidence.js` |
| Core browser tasks | 7/7 completed | Natural-language query, instrument switch, live/fallback scan, row expansion, evidence selection, provenance reveal, navigation |
| Desktop viewport | Passed | `design/implementation-desktop-final.png`, 1440 × 1000 |
| Mobile viewport | Passed | `design/implementation-mobile-final.png`, 390 × 844; no document-level horizontal overflow |
| Public deployment | Passed | Stable Vercel URL returned HTTP 200 |
| Public live rToken scan | Passed | Bitget returned a current rNVDAUSDT ticker; Passport labeled `LIVE · RULES` and underlying `Unavailable` |
| Public natural-language task | Passed | “Check Apple market integrity…” resolved to rAAPLUSDT and returned a current `LIVE · RULES` Passport |
| Submission film | Passed | 42.048 s; 1920 × 1080; 30 fps; H.264 video and AAC audio; six representative frames visually inspected |

## What these results prove

- The deterministic calculations and state thresholds behave as tested.
- The production client compiles and the current code passes static checks.
- The primary research workflow is operable in a real browser.
- Failure states remain visible and inspectable.
- The deployed server can retrieve the public Bitget rToken ticker and preserve an authenticated Stock+ failure as a partial-live `UNVERIFIABLE` Passport.
- Watchlist quotes are populated only by current-session live scans; frozen fixtures no longer appear as live watchlist prices.
- Snapshot evidence retains its frozen source timestamp and is never presented with a synthetic current quote age.

## What these results do not prove

- Live Bitget availability from every deployment region.
- Qwen output quality until the sponsor-issued credential is configured and `LIVE · QWEN` is observed in production.
- Historical classification accuracy, user adoption, retention, AUM, volume, fees, or investment performance.

## Next benchmark protocol

Freeze 12–20 cases with a timestamp boundary and immutable evidence bundle. Keep labels in a separate file until evaluation. Compare rules-only, LLM-only, and hybrid outputs on:

1. state accuracy;
2. unsupported-claim rate;
3. temporal-contradiction catch rate;
4. abstention precision;
5. median completion time.

Every published metric must be labeled observed, estimated, or targeted. Demonstration fixtures must never be described as historical evidence.
