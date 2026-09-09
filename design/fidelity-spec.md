# Fidelity Spec

## Accepted concept

`design/market-integrity-desk-concept.png` at 1536 × 1024.

## Copy lock above the fold

- Market Integrity Desk
- Tokenized U.S. equities. Verifiable market states.
- Live Desk
- Replay Lab
- Methodology
- Read-only research
- rNVDAUSDT
- NVIDIA · tokenized U.S. equity
- Run integrity scan
- Market State Passport
- A reproducible view of what is observable, stale, contradictory, or unverifiable.

## Design system

- Background: true graphite-black `#091017`.
- Surfaces: `#0d161f` and `#111c26`; fine cool-gray rules.
- Semantic accents: mint pass, amber caution, coral fail/contradiction, slate unknown, blue underlying/reference.
- Typography: Inter for interface; IBM Plex Mono for prices, timestamps and formulas.
- Geometry: square to 5px radius, no glass or decorative glow.
- Container model: open rails, tables and evidence rows; no bento cards.

## Component inventory

- Quiet header, watchlist rail, instrument action bar.
- Market State Passport fact rail.
- Expandable deterministic check rows.
- Evidence timeline rail.
- AI evidence brief and selected-source inspector.
- Replay benchmark table and methodology rail.

## Intentional implementation constraints

- All visible text and controls are code-native.
- Snapshot mode must be labeled and never presented as live.
- Liquidity depth remains unknown without an accessible depth source.
