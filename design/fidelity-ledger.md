# Concept Fidelity Ledger

Accepted reference: `market-integrity-desk-concept.png` (1536 x 1024). Final implementation captures: `implementation-desktop-final.png` and `implementation-mobile-final.png`.

## Visual comparison

1. **Information architecture — matched.** The implementation preserves the concept's quiet header, left watchlist rail, central Passport and checks, right evidence inspector, and full-width evidence timeline.
2. **Palette and semantics — matched.** Graphite surfaces, cool-gray separators, mint pass, amber caution, coral contradiction, slate unknown, and blue reference data all retain their original roles.
3. **Typography and density — matched.** Inter drives interface hierarchy while IBM Plex Mono is used for symbols, prices, timestamps, formulas, and machine states. The intentionally dense institutional layout is preserved.
4. **Passport and checks — matched.** The fact rail, status stamp, five deterministic checks, row expansion, formulas, and explicit unknown states are code-native and interactive.
5. **Evidence system — matched.** The timeline, numbered evidence list, selected-source detail, timestamps, endpoints, and raw provenance reveal reproduce the concept's audit trail.
6. **Responsive behavior — extended intentionally.** The source concept was desktop-only. At 390 x 844 the watchlist becomes a horizontal rail, the scan action stacks, the Passport becomes a two-column fact grid, and the evidence inspector moves below the desk. Browser QA confirms no document-level horizontal overflow.

## Copy diff and intentional deviations

- Above-the-fold copy in `fidelity-spec.md` is preserved.
- `Read-only research` replaces the generated concept's operational-status language because this build does not execute orders or claim system-wide availability.
- `SNAPSHOT · RULES` is shown when live APIs or Qwen are unavailable. `LIVE · QWEN` is reserved for successful responses from both configured server-side routes.
- Corporate actions remain `Unverifiable`; the implementation never converts a missing endpoint into `No active event`.
- Quote freshness uses the published implementation threshold of pass at 30 seconds or less and caution at 120 seconds or less. It is visible in the expanded check rather than hidden in model reasoning.
- Dynamic UTC timestamps replace the static design date.
- The design's AI brief becomes `Evidence brief` during deterministic fallback and changes to `AI evidence brief` only after a citation-preserving Qwen response.

## Verified interactions

- Switching from rNVDAUSDT to rTSLAUSDT updates the Passport and runs a fresh scan.
- An unavailable local serverless route returns a labeled snapshot instead of a false live state.
- Replay Lab and Methodology navigation render their dedicated views.
- Check rows and raw provenance expand and collapse.
- Search filtering, evidence selection, and benchmark action were exercised in browser QA.
