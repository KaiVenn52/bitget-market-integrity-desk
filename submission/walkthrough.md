# Full Research-Task Walkthrough

## Research question

Two questions, in the order a trader actually asks them:

1. Can I trust the current `rTSLAUSDT` market state at all?
2. If it repriced, what does the record actually support?

## Reproducible procedure

### A · The Desk: explain the move

1. Open the deployed Market Integrity Desk. Every workspace is deep-linkable, so a step can be linked directly: `#live`, `#gate`, `#stress`, `#replay`, `#method`.
2. On **Live Desk**, enter `Check Tesla market integrity and show me what is missing` in **Research question**, then choose **Investigate**. The language layer resolves the supported instrument, sends the exact question into the bounded research contract, and triggers a scan. The watchlist can be used as a deterministic alternative.
3. Read the mode badge before interpreting the result:
   - `LIVE` means the server returned current Bitget source data.
   - `SNAPSHOT` means the live route was unavailable and the visible prices are demonstration data.
   - `QWEN` means the evidence brief passed the evidence-ID contract.
   - `RULES` means only deterministic synthesis is shown.
4. Read the Passport state and each fact cell. Interpret the state from the displayed alignment and independent source ages. During the 2026-09-14 verification run, AAPL was `CAUTION` because the weekend Stock+ quote was stale even though price alignment passed.
5. Expand **Price alignment**. Confirm that no premium is calculated from the token price alone. When both sources are available, the declared formula is `(token - underlying) / underlying × 10,000` with a 20 bps pass threshold.
6. Expand **Quote freshness**. Compare each source age with the 30-second pass and 120-second caution boundaries.
7. Inspect **Corporate actions** and **Liquidity observability**. They must remain `UNVERIFIABLE` and `NOT OBSERVABLE` when the required endpoints are absent.
8. Select an item in the **Evidence** rail. Confirm the source name, endpoint, retrieval timestamp, and recorded state.
9. Open **Inspect provenance**. Confirm that the raw record agrees with the selected evidence item.
10. Read **Research action**. When reference evidence is missing, it must tell the researcher not to use the unavailable comparison and when to re-run the task.
11. If the badge is `QWEN`, confirm that the visible **Question answered** matches the submitted question. Select a bracketed citation and confirm it opens the corresponding evidence item supplied to the model.
12. Read the **Move explanation** panel: the likely catalyst, the supporting evidence, the alternative explanations, and the headlines rejected on timing.

### B · The Gate: decide whether the state can be trusted

13. Open **Gate** and run the integrity sweep. It applies ordered deterministic rules to the whole watchlist in one pass.
14. Confirm the headline is the **worst** verdict across the watchlist, not an average. A desk is only as clear as its least verifiable instrument.
15. Expand an instrument. Each verdict must name its code, its reason, what it means, the evidence ids it cites, the conditions that would change it, and a next research step. The gate never says buy or sell.
16. Check the reference line. The desk reports which basis the verdict rests on: a fresh authenticated same-session quote, or the Yahoo-reported prior close while the underlying cannot trade. A closed-market gap must be reported as drift, never as an alignment break — there is no live underlying price for the token to disagree with.
17. Choose **Open in the Desk** and confirm the instrument carries into the analysis workspace.
18. Read the **desk log**. Every sweep is recorded, including refusals, with the refusal rate. A refusal is a recorded outcome, not a failure. Reload the page and confirm the log persists.

### C · The Stress test: answer the follow-up

19. Open **Stress**. The desk builds closed-market episodes from hourly rToken candles, measures the distribution of drift, and reports what the following session actually did across comparable episodes.
20. Read the four facts: the drift being tested, the matching band, the number of episodes built, and how many Yahoo-reported underlying closes were retrieved.
21. Read the distribution: median, 90th percentile and maximum absolute drift, and the share of observations beyond the 20 bps threshold.
22. Read the matched-episode table. Each row shows the peak drift, what the rToken closed at, what the **underlying** closed at, the classified outcome, and the error. Confirm the outcome is one of `same way`, `against it`, or `closed flat` — a drift that resolved to a flat close is **not** counted as a confirmation, and the flat rows are excluded from the headline rate and reported separately.
23. Confirm the desk refuses to answer when there is nothing to test. A drift inside the 20 bps threshold is not an event, so the desk declines to compare it to history rather than dressing up a meaningless match.
24. Read the declared limits printed on the page. One instrument, weeks of hourly candles, hourly-resolution excursions, no significance claimed.

### D · Replay and Method

25. Open **Replay Lab** and choose **Inspect protocol**. Confirm that 16 observed instrument-time cases appear, the protocol disclosure expands, and the note identifies this as a missing-reference abstention slice rather than a balanced accuracy result.
26. Open **Methodology** and confirm the separation of Observe, Verify, Explain, Gate and Abstain, the two reference tiers, and the declared limits — including the probed-and-withheld official Skill layer.

## Expected conclusion

The Desk does not answer whether TSLA or its rToken will rise or fall. It answers which current facts are observable, which checks pass, where source evidence is missing, whether the state can be verified at all, what comparable episodes did in the retrieved history, and whether the displayed brief was generated by Qwen or deterministic rules. A snapshot run is valid evidence of product behavior, but not evidence of a live market state.

## Failure-state walkthrough

Block the live scan route or run the Vite-only local build. The UI must:

- return a Passport rather than crash;
- show `SNAPSHOT · RULES`;
- retain `UNVERIFIABLE` and `NOT OBSERVABLE` states;
- avoid claiming that there is no corporate action or that liquidity is thin;
- keep all provenance inspectable.

Two further failure states are worth checking, because both were real defects found by running the built app rather than by reading the code:

- **A missing reference must not be reported as a market finding.** When no quote can be established, the gate must repeat the retrieval layer's own account of why — distinguishing "no source responded" from "a source responded but cannot serve as a basis" — instead of asserting a cause of its own.
- **The stress test must show a failure panel rather than a blank page** if its endpoint cannot be reached, and switching instruments must never leave a previous instrument's result on screen.
