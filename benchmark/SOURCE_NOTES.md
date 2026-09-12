# Benchmark source notes

- Audience: Bitget hackathon judges and product reviewers.
- Grain: one supported rToken at one fully closed five-minute cutoff.
- Population: four supported rTokens times four closed cutoffs, producing 16 instrument-time cases and four unique clock cutoffs.
- Primary source: Bitget UTA v3 `/api/v3/market/candles` through the deployed allowlisted benchmark source route.
- Reference source: Bitget Stock+ `/api/v3/stockplus/market/candlestick`; unavailable in this run because the required read-only variables were absent.
- Label policy: labels are saved separately from evidence; missing required Stock+ reference means `UNVERIFIABLE`.
- Qwen policy: exact frozen question plus two evidence records; every cited ID must exist in the supplied evidence array.
- Chart map: the report uses one single-series categorical bar chart of saved Qwen latency by case (`case` × `latencyMs`). It answers whether production latency varied materially across the 16 requests without implying a time trend from only four unique clock cutoffs. One blue palette root plus neutral axes is sufficient; case and instrument remain available in the audit table and tooltip.
- Classification limitation: this slice tests abstention precision, not balanced state accuracy.
