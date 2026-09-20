# Manual Demo Recording Script — 2:50 Target

Use this as the primary judge-facing walkthrough. Record the real production site in one continuous take. No face camera is required.

## Recording setup

- Record at 1920 × 1080, 30 fps, landscape.
- Use Chrome or Edge in a clean private window at 90–100% zoom.
- Hide bookmarks, downloads, extensions, personal tabs, desktop icons, and notifications.
- Use a visible mouse pointer and move it slowly. Do not add artificial cursor effects.
- Record clear English voice. Do not use background music unless it is almost inaudible.
- Open `https://bitget-market-integrity-desk.vercel.app` before recording and refresh once.
- Use this exact question: `Can I trust Apple's rToken price right now, and what evidence is still missing?`

### Choose the recording window deliberately

Record while the **U.S. market is closed** — for a UTC+8 audience that is roughly **09:00–20:00 local time**, i.e. overnight and pre-market in New York.

This is not a convenience, it is the demo. While the underlying cannot trade, the desk's second reference tier applies: a Yahoo-reported prior close is an available comparison baseline, not an exchange-certified quote, and it is retrievable without an exchange credential. That is the desk's flagship case — the overnight drift nothing can confirm — and it is the only window where the Gate produces a *varied* set of verdicts on screen.

Two failure modes to avoid:

- **Recording during U.S. regular hours without a working Stock+ credential.** Every instrument will be correctly blocked as `UNVERIFIABLE_REFERENCE`. That is honest and defensible, but it is a monotonous demo. If you must record then, confirm first that the Stock+ quote actually authenticates, and keep one blocked instrument visible on purpose — it is good evidence that the gate refuses rather than guesses.
- **Recording during U.S. regular hours with a stale weekend quote.** The reference will be reported as not a valid basis, which is correct but needs narration.

Before recording, open `#gate` and run one sweep. If every instrument reads `UNVERIFIABLE_REFERENCE` and the reason says no reference quote was retrieved, you are in the wrong window — wait for the closed session or configure the credential.

- Keep the take only if the Desk section shows `LIVE · QWEN`. If it returns `SNAPSHOT · RULES`, reload and record another take.
- Do not read exact prices or percentages from this script. Let the live screen supply them, and read them accurately or not at all.

## Shot-by-shot operation and narration

### 0:00–0:12 — Open on Desk

**Action:** Start with the full page visible. Keep the cursor still near the title.

**Say:**

> Tokenized U.S. equities can trade around the clock, but their underlying markets, reference feeds, and information timelines do not. A price difference alone is not an explanation.

### 0:12–0:22 — Introduce the product

**Action:** Point briefly to `Bitget rToken`, `Stock+ reference`, and `Qwen investigator`. Do not click the external links.

**Say:**

> Market Integrity Desk does three things: it explains a repricing, it decides whether the market state can be trusted at all, and it stress-tests the drift against history. Qwen narrates. Deterministic code decides.

### 0:22–0:42 — Submit a natural-language task

**Action:** Click the Research question field, select all existing text, type `Can I trust Apple's rToken price right now, and what evidence is still missing?`, then click `Investigate`. Leave the progress message visible while it runs.

**Say:**

> I ask a natural-language question about Apple. The resolver maps Apple to rAAPLUSDT, checks Bitget market data and the reference, then sends only the recorded evidence to Qwen. The progress message exposes that handoff instead of hiding it behind a spinner.

### 0:42–0:56 — Read the result contract

**Action:** When the result loads, point to the `LIVE · QWEN` mode label, then the Passport verdict and the primary facts. Do not claim the state must be PASS; show whatever live result appears.

**Say:**

> The mode label matters. Live identifies the data path. Qwen identifies a brief that passed the evidence-citation contract. The verdict comes from observable checks, not from model confidence.

### 0:56–1:10 — Prove deterministic arithmetic and freshness

**Action:** Expand `Price alignment` and hold on the formula, threshold and both values. Close it and expand `Quote freshness`, pointing at the separate source ages.

**Say:**

> Alignment is deterministic: the published formula compares the token with its underlying in basis points against a twenty-basis-point boundary. Freshness is checked per source, so a recent token quote cannot make a stale reference fresh. Qwen never performs either calculation.

### 1:10–1:22 — Show honest failure states and provenance

**Action:** Scroll to `Corporate actions` and `Liquidity observability`. In the Evidence rail, select a source item, click `Inspect provenance`, and hold on the raw record.

**Say:**

> Missing evidence never becomes a negative fact. Corporate context stays Unverifiable, unavailable depth stays Not Observable, and every item keeps its provider, endpoint, capture time and raw provenance.

### 1:22–1:44 — The Gate

**Action:** Click `Gate` in the top navigation. Let the sweep finish. Point to the summary headline and the four decision counts. Then expand the most interesting instrument.

**Say:**

> Before any of that, the desk gates its own watchlist. One sweep applies ordered deterministic rules to every instrument and returns one of four decisions: clear, investigate, wait, or blocked. The headline is the worst verdict on the watchlist, not an average — a desk is only as clear as its least verifiable instrument.

**Action:** Inside the expanded card, hold on the code, the reason, the metrics, and the reference line. Then scroll to the conditions and the next step.

**Say:**

> Each verdict names the evidence it cites, the conditions that would change it, and the next thing to check. And it names its own basis: while the underlying can trade, only a fresh authenticated quote counts; while it cannot, a Yahoo-reported prior close is a comparison baseline, not an exchange-certified quote. A gap against a closed market is drift, not a broken alignment, because there is no live price for the token to disagree with. The gate never says buy or sell.

### 1:44–1:56 — The desk log

**Action:** Click `Open in the Desk` on one verdict to show the instrument carrying into the analysis workspace, then return to `Gate` and scroll to the desk log.

**Say:**

> Refusals are recorded, not hidden. Every sweep lands in the audit trail with a refusal rate, because the gate withholding a clear verdict is a result, not a failure. This log is stored in the browser and survives a reload.

### 1:56–2:24 — The Stress test

**Action:** Click `Stress` in the top navigation. Let it load. Hold on the verdict sentence and the four facts, then the distribution row.

**Say:**

> The gate can tell you the reference cannot confirm a drift. That is useless on its own, so the desk answers the follow-up: when this token drifted like this before, what did the following session actually do? It builds closed-market episodes from hourly candles, measures the drift distribution, and matches comparable episodes — using the Yahoo-reported underlying closes where it retrieved them.

**Action:** Scroll to the matched-episode table. Point at a row whose outcome reads `closed flat`, then at a row that moved the same way.

**Say:**

> Each row shows what the rToken closed at, what the underlying closed at, and how the episode is classified. And it does not count a flat close as a confirmation: a drift that resolved to a flat session is reported as closed flat, excluded from the rate, and shown separately — because the move the drift implied never happened. The page prints its own limits: one instrument, weeks of candles, no significance claimed.

### 2:24–2:34 — Explain Qwen's role

**Action:** Click `Desk`, scroll to the AI evidence brief, point to `Question answered`, then click one bracketed citation so the matching evidence item becomes selected.

**Say:**

> Qwen answers the exact submitted question, but it may cite only evidence IDs the server supplied. If those citations fail validation, the product falls back to deterministic rules instead of presenting unsupported AI text.

### 2:34–2:44 — Show Method

**Action:** Click `Method`. Move the pointer across Observe, Verify, Explain, Gate and Abstain, then over the two reference tiers.

**Say:**

> The workflow is Observe, Verify, Explain, Gate, and Abstain — and the desk names which reference tier every claim rests on. It also documents the official Skill layer it probed and withheld, because a source that returns nothing is a missing source, not a finding.

### 2:44–2:50 — Close

**Action:** Click `Desk` and end on the full product view. Keep the URL visible for at least three seconds.

**Say:**

> The question is not whether AI can sound confident. It is whether the system can prove what it knew, when it knew it, and what it could not verify.

## Retake conditions

Discard the take and record again if any of these occur:

- A personal notification, email, wallet address, API key, or unrelated tab appears.
- The Desk section shows `SNAPSHOT · RULES` for the main demonstration.
- The Gate sweep fails to complete, or the Stress test shows its failure panel.
- Qwen takes longer than roughly 25 seconds and pushes the video beyond three minutes.
- The cursor hides important values or moves rapidly back and forth.
- Exact live values are spoken incorrectly.
- The recording is below 1080p, text is blurred, or microphone audio clips.

## Export

- MP4, H.264 video, AAC audio.
- 1920 × 1080, 30 fps.
- Target duration: 2:45–2:55; never exceed 3:00.
- Filename: `market-integrity-desk-live-walkthrough.mp4`.
- Watch the exported file once from beginning to end before uploading.
