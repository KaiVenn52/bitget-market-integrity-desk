# Validation Record

Date: 2026-09-09  
Scope: local product behavior and deterministic engine  
Operator: project developer

## Observed results

| Check | Result | Evidence |
|---|---:|---|
| Deterministic unit tests | 4/4 passed | `npm.cmd test` |
| Production build | Passed | `npm.cmd run build` |
| Static lint | Passed | `npm.cmd run lint` |
| API syntax checks | 2/2 passed | `node --check api/scan.js`, `node --check api/evidence.js` |
| Core browser tasks | 6/6 completed | Instrument switch, scan fallback, row expansion, evidence selection, provenance reveal, navigation |
| Desktop viewport | Passed | `design/implementation-desktop-final.png`, 1536 × 1024 |
| Mobile viewport | Passed | `design/implementation-mobile-final.png`, 390 × 844; no document-level horizontal overflow |
| Public deployment | Passed | Stable Vercel URL returned HTTP 200 |
| Public live rToken scan | Passed | Bitget returned a current rNVDAUSDT ticker; Passport labeled `LIVE · RULES` and underlying `Unavailable` |

## What these results prove

- The deterministic calculations and state thresholds behave as tested.
- The production client compiles and the current code passes static checks.
- The primary research workflow is operable in a real browser.
- Failure states remain visible and inspectable.
- The deployed server can retrieve the public Bitget rToken ticker and preserve an authenticated Stock+ failure as a partial-live `UNVERIFIABLE` Passport.

## What these results do not prove

- Live Bitget availability from every deployment region.
- Qwen output quality without a configured hackathon credential.
- Historical classification accuracy, user adoption, retention, AUM, volume, fees, or investment performance.

## Next benchmark protocol

Freeze 12–20 cases with a timestamp boundary and immutable evidence bundle. Keep labels in a separate file until evaluation. Compare rules-only, LLM-only, and hybrid outputs on:

1. state accuracy;
2. unsupported-claim rate;
3. temporal-contradiction catch rate;
4. abstention precision;
5. median completion time.

Every published metric must be labeled observed, estimated, or targeted. Demonstration fixtures must never be described as historical evidence.
