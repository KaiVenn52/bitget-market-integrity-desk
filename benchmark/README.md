# Frozen benchmark

This directory contains the first reproducible Market Integrity Desk benchmark slice.

- `manifest.json` defines the population, interval, cutoff, and evidence policy.
- `cases.json` contains 16 immutable instrument-time evidence bundles and SHA-256 digests.
- `labels.json` keeps gold labels separate from evidence.
- `qwen-outputs.json` preserves the observed bounded-investigator responses and latency.
- `results.json` contains evaluator output and case-level checks.
- `report.html` is the portable, reader-facing validation report generated from `artifact.json`.
- `bitget-signal-probe.json` records the official Agent Hub MCP probe and the decision not to promote an unusable response path.

The first slice covers four supported rTokens across four fully closed five-minute cutoffs on September 11, 2026 UTC. Stock+ credentials were not present, so all cases test missing-reference abstention. The slice can validate evidence-boundary behavior, citation integrity, and runtime availability; it cannot establish balanced classification accuracy or trading performance.

Regenerate after deploying `api/benchmark-source.js`:

```powershell
npm.cmd run benchmark:collect
npm.cmd run benchmark:evaluate
npm.cmd run benchmark:report
```

To add the missing comparison leg, follow `docs/stockplus-read-only-setup.md`. Never commit or paste credential values into project files or chat.
