# X Project Post Draft

Tokenized equities trade 24/7. Their evidence doesn't.

Over 500 hours of rTSLA candles, 395 of them sat inside windows where the U.S. market was closed. 68.4% of those hours drifted more than 20 bps from the Yahoo-reported prior close. The median was 36 bps. The 90th percentile was 121.

Some of that is information. Some of it is noise. You cannot tell which from the price.

So I built a desk that refuses to pretend it can.

**It gates itself before you act.** One sweep, four verdicts per instrument — clear, investigate, wait, blocked — each naming the evidence it cites, what would change it, and the next thing to check. A desk is only as clear as its least verifiable instrument, so the headline is the worst verdict, not an average. Every verdict is checked against evidence the sweep actually holds, so none can cite a source that was never retrieved.

**It names its own basis.** While the underlying can trade, only a fresh authenticated quote counts. While it can't, a Yahoo-reported prior close is the comparison baseline, not an exchange-certified quote — and the desk says which tier it used. A gap against a closed market is drift, not a broken alignment: there is no live price for the token to disagree with.

**It answers the follow-up.** "The reference cannot confirm this" is useless on its own. So the desk builds closed-market episodes from history and shows what the following session actually did across comparable ones. And it does not count a flat close as a confirmation — a 108 bps drift that resolved to 8 bps is reported as closed flat and excluded from the rate, because the move never happened.

Qwen writes the explanation from server-retrieved evidence; its inline citation IDs must resolve to records the desk actually holds. ID resolution is checked automatically, while whether a record truly supports a sentence remains for the trader to inspect. When nothing matches the timing it says NO_STRONG_CATALYST instead of inventing a cause. A refusal is a recorded outcome here, with its own row in the audit trail and a refusal rate — not a failure to hide.

I also probed the official bitget-signal Skill layer instead of assuming. Its transport answers in under a second; of 24 probes only 4 returned any data, and none of them was about an instrument this desk gates. So it is withheld, and the probe is committed so anyone can re-run it. A source that returns nothing is a missing source, not a finding — that rule applies to my own dependencies too.

AI explains the move. The integrity layer proves what supports it.

Live: https://bitget-market-integrity-desk.vercel.app
Code: https://github.com/KaiVenn52/bitget-market-integrity-desk
#BitgetHackathon @Bitget_AI
