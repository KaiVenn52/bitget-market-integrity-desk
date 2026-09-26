import { etDateKey, priceLabel } from './analysis.js'
import { providerOf, resultsOf } from './bitget-mcp.js'

/**
 * Turn `bitget-mcp-server` responses into evidence records the desk can cite.
 *
 * Provenance rule this module exists to enforce: the MCP platform returns US
 * equity data from upstream vendors, and names them when disclosed (`massive`,
 * `finnhub`, ...). An undisclosed provider stays `unspecified`. It is never
 * "Bitget Stock+" and never "exchange-certified": those
 * describe the authenticated Stock+ feed, which is a different pipeline. A desk
 * whose whole purpose is catching misattributed provenance cannot misattribute
 * its own.
 *
 * Every builder is pure and takes the raw entry result, so the labelling and the
 * abstention behaviour are unit-testable without a network.
 */

/** Source line for an evidence record, naming both the MCP server and the vendor behind it. */
export function mcpSource(server, entry) {
  const name = server?.name ?? 'bitget-mcp-server'
  const version = server?.version ? ` v${server.version}` : ''
  const provider = providerOf(entry)
  return `${name}${version} · provider ${provider ?? 'unspecified'}`
}

/** The catalog entries this desk queries, in the order they are requested. */
export const MCP_QUERIES = [
  { id: 'quote', entryId: 'equity_price_quote' },
  { id: 'history', entryId: 'equity_price_historical' },
  { id: 'dividends', entryId: 'equity_fundamental_dividends' },
  { id: 'earnings', entryId: 'equity_calendar' },
]

/**
 * Build the query list for one underlying.
 *
 * Historical and dividend entries require Unix timestamps in milliseconds,
 * while the calendar accepts YYYY-MM-DD strings. The evidence window is also
 * enforced locally because a provider has previously ignored date filters.
 */
export function buildMcpQueries(underlyingSymbol, nowMs) {
  const symbol = String(underlyingSymbol ?? '').replace(/\.US$/i, '').toUpperCase()
  if (!symbol) return []
  const startTime = Math.trunc(nowMs - 21 * 86_400_000)
  const endTime = Math.trunc(nowMs)
  // Earnings reach further back than the price window: a report that already
  // happened is what a move may be attributable to, so a window that only looks
  // forward would hide the very event the narrative needs.
  const earningsStart = new Date(nowMs - 45 * 86_400_000).toISOString().slice(0, 10)
  const earningsEnd = new Date(nowMs + 120 * 86_400_000).toISOString().slice(0, 10)
  return MCP_QUERIES.map((query) => ({
    ...query,
    params: query.id === 'earnings'
      ? { symbol, start_date: earningsStart, end_date: earningsEnd }
      : query.id === 'history' || query.id === 'dividends'
        ? { symbol, start_time: startTime, end_time: endTime }
        : { symbol },
  }))
}

const isFinite_ = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * Evidence for the underlying quote.
 *
 * `prevClose` is carried separately from `last` on purpose: inside the main
 * session the live price is the only valid basis, and outside it the prior close
 * is. Collapsing them into one number is how a desk talks itself into comparing
 * an overnight token price against a price the underlying never traded at.
 */
export function quoteEvidence(entry, server, nowMs) {
  const retrievedAt = new Date(nowMs).toISOString()
  const row = resultsOf(entry)[0]
  if (!entry?.ok || !row) {
    return {
      id: 'mcp-quote',
      title: 'Underlying quote (Bitget MCP)',
      summary: `No underlying quote was returned by Bitget MCP: ${entry?.error ?? 'entry returned no rows'}. Alignment against a live underlying quote is not calculated from this source.`,
      state: 'unknown',
      timestamp: retrievedAt.slice(11, 16),
      source: mcpSource(server, entry),
      endpoint: 'agent.bitget.com/mcp · equity_price_quote',
      retrievedAt,
    }
  }
  const numeric = (value) => value === null || value === undefined || value === '' ? NaN : Number(value)
  const last = numeric(row.last_price)
  const prevClose = numeric(row.prev_close)
  const bid = numeric(row.bid)
  const ask = numeric(row.ask)
  const lastMs = Number.isFinite(Date.parse(row.last_timestamp)) ? Date.parse(row.last_timestamp) : null
  const ageSeconds = lastMs === null ? null : Math.max(0, Math.round((nowMs - lastMs) / 1000))
  const spread = isFinite_(bid) && isFinite_(ask) && bid > 0 ? Math.round(((ask - bid) / bid) * 10000) : null
  const parts = [
    isFinite_(last) ? `last ${priceLabel(last)}` : 'last unavailable',
    isFinite_(bid) && isFinite_(ask) ? `bid/ask ${priceLabel(bid)}/${priceLabel(ask)}${spread === null ? '' : ` (${spread} bps)`}` : null,
    isFinite_(prevClose) ? `prior close ${priceLabel(prevClose)}` : null,
    ageSeconds === null ? null : `quote age ${ageSeconds}s`,
  ].filter(Boolean)
  return {
    id: 'mcp-quote',
    title: 'Underlying quote (Bitget MCP)',
    summary: `${parts.join('; ')}.`,
    state: isFinite_(last) && last > 0 && lastMs !== null ? 'pass' : 'unknown',
    timestamp: lastMs === null ? retrievedAt.slice(11, 16) : new Date(lastMs).toISOString().slice(11, 16),
    source: mcpSource(server, entry),
    endpoint: 'agent.bitget.com/mcp · equity_price_quote',
    retrievedAt,
    // Carried for the reference layer, which needs the raw numbers rather than prose.
    quote: isFinite_(last) && last > 0 && lastMs !== null
      ? { price: last, timestampMs: lastMs, bid: isFinite_(bid) ? bid : null, ask: isFinite_(ask) ? ask : null, ageSeconds }
      : null,
    priorClose: isFinite_(prevClose) && prevClose > 0 ? prevClose : null,
  }
}

/**
 * Evidence for the daily history.
 *
 * This is a dated series, not a replacement for the authenticated Stock+ feed.
 * Quote/history agreement from the same upstream vendor is an internal
 * consistency check, never independent price confirmation.
 */
export function historyEvidence(entry, server, nowMs) {
  const retrievedAt = new Date(nowMs).toISOString()
  const rows = resultsOf(entry)
  if (!entry?.ok || !rows.length) {
    return {
      id: 'mcp-history',
      title: 'Underlying daily history (Bitget MCP)',
      summary: `No daily candles were returned by Bitget MCP: ${entry?.error ?? 'entry returned no rows'}.`,
      state: 'unknown',
      timestamp: retrievedAt.slice(11, 16),
      source: mcpSource(server, entry),
      endpoint: 'agent.bitget.com/mcp · equity_price_historical',
      retrievedAt,
    }
  }
  const usable = rows.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.date ?? '').slice(0, 10)) && row.close !== null && row.close !== undefined && isFinite_(Number(row.close)) && Number(row.close) > 0)
  if (!usable.length) {
    return { id: 'mcp-history', title: 'Underlying daily history (Bitget MCP)', summary: `${rows.length} candle rows were returned but none had a usable date and positive close.`, state: 'unknown', timestamp: retrievedAt.slice(11, 16), source: mcpSource(server, entry), endpoint: 'agent.bitget.com/mcp · equity_price_historical', retrievedAt, closes: [] }
  }
  usable.sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const first = usable[0]
  const latest = usable[usable.length - 1]
  return {
    id: 'mcp-history',
    title: 'Underlying daily history (Bitget MCP)',
    summary: `${usable.length} daily candles from ${String(first?.date ?? 'unknown').slice(0, 10)} to ${String(latest?.date ?? 'unknown').slice(0, 10)}; latest close ${priceLabel(Number(latest?.close))}.`,
    state: 'pass',
    timestamp: retrievedAt.slice(11, 16),
    source: mcpSource(server, entry),
    endpoint: 'agent.bitget.com/mcp · equity_price_historical',
    retrievedAt,
    closes: usable.map((row) => ({ dateKey: String(row.date ?? '').slice(0, 10), close: Number(row.close) })),
  }
}

/** A within-feed reconciliation only; it cannot establish an independent price. */
export function priceCoherenceFrom(quote, history, nowMs) {
  const timestamp = new Date(nowMs).toISOString().slice(11, 16)
  const base = { id: 'mcp-coherence', title: 'MCP price-series coherence', summary: 'Prior close in the MCP quote agrees with the previous dated MCP daily close' }
  const quoteMs = quote?.quote?.timestampMs
  const priorClose = quote?.priorClose
  const previous = Number.isFinite(quoteMs) && Array.isArray(history?.closes)
    ? history.closes.filter((row) => row.dateKey < etDateKey(quoteMs)).at(-1)
    : null
  if (!previous || !Number.isFinite(priorClose) || priorClose <= 0) {
    const detail = 'A timestamped quote, its prior close, and an earlier dated daily close were not all available. No coherence result is asserted.'
    return {
      check: { ...base, state: 'unknown', result: 'UNVERIFIABLE', detail, observations: [{ label: 'Scope', value: 'MCP within-feed only' }] },
      evidence: { ...base, state: 'unknown', summary: detail, timestamp, source: `${quote?.source ?? 'Bitget MCP · quote unavailable'} + ${history?.source ?? 'Bitget MCP · history unavailable'}`, endpoint: 'equity_price_quote + equity_price_historical', retrievedAt: new Date(nowMs).toISOString() },
    }
  }
  const deltaBps = Math.round(((priorClose - previous.close) / previous.close) * 10_000)
  const matched = Math.abs(deltaBps) <= 2
  const sameProvider = quote.source === history.source && !quote.source.endsWith('provider unspecified')
  const scope = sameProvider ? 'same upstream provider; not independent confirmation' : 'MCP catalog entries; upstream independence not established'
  const detail = `Quote prior close ${priceLabel(priorClose)} versus ${previous.dateKey} daily close ${priceLabel(previous.close)}: ${deltaBps > 0 ? '+' : ''}${deltaBps} bps. ${scope}. Tolerance: 2 bps for published-price rounding.`
  return {
    check: { ...base, state: matched ? 'pass' : 'caution', result: matched ? 'CONSISTENT' : 'MISMATCH', detail, observations: [{ label: 'Quote prior close', value: priceLabel(priorClose) }, { label: `${previous.dateKey} daily close`, value: priceLabel(previous.close) }, { label: 'Scope', value: scope }] },
    evidence: { ...base, state: matched ? 'pass' : 'caution', summary: detail, timestamp, source: `${quote.source} + ${history.source}`, endpoint: 'equity_price_quote + equity_price_historical', retrievedAt: new Date(nowMs).toISOString() },
  }
}

const dividendType = (value) => {
  if (value === '现金分红') return 'cash dividend'
  if (typeof value !== 'string') return null
  return /^[\x20-\x7E]+$/.test(value) ? value : null
}

/**
 * Evidence for dividends, and the input to the corporate-action check.
 *
 * The documented entry can also include stock splits and stock dividends. Its
 * presence does not prove historical prices were split-adjusted. A non-cash
 * event in the window is therefore flagged, never called a cash dividend.
 */
export function dividendEvidence(entry, server, nowMs) {
  const retrievedAt = new Date(nowMs).toISOString()
  const base = {
    id: 'mcp-dividends',
    title: 'Dividend history (Bitget MCP)',
    timestamp: retrievedAt.slice(11, 16),
    source: mcpSource(server, entry),
    endpoint: 'agent.bitget.com/mcp · equity_fundamental_dividends',
    retrievedAt,
  }
  if (!entry?.ok) {
    return { ...base, summary: `Dividend history could not be retrieved: ${entry?.error ?? 'unknown error'}. Absence of a corporate action is not inferred from a failed retrieval.`, state: 'unknown', events: [] }
  }
  const rows = resultsOf(entry)
  // The live provider previously returned decades of history even with date
  // filters. Enforce the desk's bounded UTC date window locally.
  const start = new Date(nowMs - 21 * 86_400_000).toISOString().slice(0, 10)
  const end = new Date(nowMs).toISOString().slice(0, 10)
  const weekendDates = rows
    .map((row) => String(row.ex_dividend_date ?? '').slice(0, 10))
    .filter((dateKey) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey >= start && dateKey <= end)
    .filter((dateKey) => [0, 6].includes(new Date(`${dateKey}T12:00:00Z`).getUTCDay()))
  if (weekendDates.length) {
    return { ...base, summary: `The provider returned ${weekendDates.length} ex-dividend date${weekendDates.length === 1 ? '' : 's'} on a weekend inside ${start}–${end} (${weekendDates.join(', ')}). Corporate-action context is not verified from this response.`, state: 'unknown', events: [] }
  }
  const nonCash = rows.filter((row) => {
    const dateKey = String(row.ex_dividend_date ?? row.split_valid_date ?? '').slice(0, 10)
    return dateKey >= start && dateKey <= end && (row.event_type === '股票拆分' || row.event_type === '股票分红')
  })
  if (nonCash.length) {
    return { ...base, summary: `${nonCash.length} split or stock-dividend event${nonCash.length === 1 ? '' : 's'} appeared inside ${start}–${end}. The reference's split adjustment was not verified, so corporate-action context stays unverified.`, state: 'unknown', events: [] }
  }
  // Field names are taken from the live response, not guessed: the entry returns
  // `ex_dividend_date` and `amount`. Reading a plausible-looking alias instead
  // silently produced zero events and reported "no dividend in window" for an
  // instrument that had just gone ex-dividend — a false negative of exactly the
  // kind this desk exists to catch.
  const events = rows
    .map((row) => ({
      dateKey: String(row.ex_dividend_date ?? '').slice(0, 10),
      amount: Number(row.amount),
      currency: row.currency ?? null,
      eventType: dividendType(row.event_type),
      special: row.is_special === true || row.is_special_dividend === true || String(row.is_special_dividend ?? '') === '1',
    }))
    .filter((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.dateKey) && event.dateKey >= start && event.dateKey <= end)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
  if (!events.length) {
    return {
      ...base,
      summary: rows.length
        ? rows.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(String(row.ex_dividend_date ?? '').slice(0, 10)))
          ? `${rows.length} rows were returned, including unusable ex-dividend dates. Absence inside ${start}–${end} cannot be asserted.`
          : `No dividend events dated ${start}–${end} were found among ${rows.length} returned rows; out-of-window history was excluded. This is not proof of global absence.`
        : `The dividend endpoint answered with no events dated ${start}–${end}. That is a bounded statement about this window, not proof that none occurred.`,
      state: rows.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(String(row.ex_dividend_date ?? '').slice(0, 10))) ? 'unknown' : 'pass',
      events: [],
    }
  }
  const latest = events[0]
  const amount = Number.isFinite(latest.amount) ? ` at ${priceLabel(latest.amount)}${latest.currency ? ` ${latest.currency}` : ''}` : ''
  const type = latest.eventType ? ` (${latest.eventType}${latest.special ? ', special' : ''})` : ''
  return {
    ...base,
    summary: `${events.length} dividend event${events.length === 1 ? '' : 's'} dated ${start}–${end} among ${rows.length} returned rows; most recent ex-date ${latest.dateKey}${amount}${type}. Out-of-window history is excluded. Split adjustment is not covered by this entry.`,
    state: 'pass',
    events,
  }
}

/**
 * Evidence for the earnings calendar.
 *
 * An earnings date inside the catalyst window changes what a move can be
 * attributed to, so this is context the narrative is allowed to use — it is not
 * a price and never becomes a reference.
 */
export function earningsEvidence(entry, server, nowMs) {
  const retrievedAt = new Date(nowMs).toISOString()
  const base = {
    id: 'mcp-earnings',
    title: 'Earnings calendar (Bitget MCP)',
    timestamp: retrievedAt.slice(11, 16),
    source: mcpSource(server, entry),
    endpoint: 'agent.bitget.com/mcp · equity_calendar',
    retrievedAt,
  }
  if (!entry?.ok) {
    return { ...base, summary: `Earnings calendar could not be retrieved: ${entry?.error ?? 'unknown error'}. No claim is made about upcoming results.`, state: 'unknown', nextReportDateKey: null }
  }
  const rows = resultsOf(entry)
  const dated = rows
    .map((row) => {
      // `equity_calendar` (v4.0.5) uses disclosure dates, not the old
      // `equity_calendar_earnings.report_date`. `period_ending` is the fiscal
      // period boundary and must never be presented as an earnings date.
      const hasDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').slice(0, 10))
      const forecast = [row.perf_report_fore_dsclsr_date, row.perf_briefing_fore_dsclsr_date].find(hasDate)
      const actual = [row.perf_report_dsclsr_date, row.perf_brief_dsclsr_date].find(hasDate)
      const legacy = row.report_date
      const dateKey = String(actual ?? forecast ?? legacy ?? '').slice(0, 10)
      const rawEps = row.eps_consensus
      return { dateKey, kind: actual ? 'actual' : forecast ? 'forecast' : 'legacy', epsConsensus: rawEps == null || rawEps === '' ? null : Number(rawEps) }
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.dateKey))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  if (!dated.length) {
    // An answered-but-unusable response is not the same claim as an empty window,
    // and conflating them would let the desk assert a quiet calendar it never read.
    return {
      ...base,
      summary: rows.length
        ? `${rows.length} row${rows.length === 1 ? '' : 's'} were returned but none carried a usable report date, so no scheduled report is asserted.`
        : 'The earnings endpoint answered and returned no scheduled report inside the retrieved window. This is a bounded statement about the window.',
      state: rows.length ? 'caution' : 'pass',
      nextReportDateKey: null,
    }
  }
  const today = new Date(nowMs).toISOString().slice(0, 10)
  const next = dated.find((row) => row.dateKey >= today) ?? dated[dated.length - 1]
  const daysOut = Math.round((Date.parse(`${next.dateKey}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  const label = daysOut < 0 ? 'Latest recorded report' : next.kind === 'actual' ? 'Recorded report date' : 'Next scheduled report'
  return {
    ...base,
    summary: `${label} ${next.dateKey}${daysOut >= 0 ? ` (${daysOut} days out)` : ' (in the past relative to the retrieved window)'}${next.epsConsensus !== null && Number.isFinite(next.epsConsensus) ? `; consensus EPS ${next.epsConsensus}` : ''}.`,
    state: 'pass',
    nextReportDateKey: next.dateKey,
    daysOut,
  }
}

/**
 * Fold the MCP entries into the desk's corporate-action check.
 *
 * The check starts as `unknown / UNVERIFIABLE` because no corporate-action source
 * was wired up. Once the dividend entry answers, the honest state is what that
 * answer supports — and if it did not answer, the check must stay unknown and say
 * which source was missing, because "we could not retrieve it" is not "there was
 * nothing".
 *
 * This takes the *built* dividend and earnings evidence, not the raw MCP entries:
 * the parsed event list is what the evidence layer produced, and reading the raw
 * entry instead silently reported "no events in window" for an instrument that had
 * just gone ex-dividend.
 */
export function corporateCheckFrom(dividends, earnings) {
  if (!dividends || dividends.state === 'unknown') {
    return {
      state: 'unknown',
      result: 'UNVERIFIABLE',
      detail: 'Bitget MCP dividend data was unavailable or could not be parsed, so corporate-action context stays unverified. Absence is not inferred.',
    }
  }
  const events = dividends.events ?? []
  const earningsNote = earnings?.nextReportDateKey
    ? ` Next scheduled report ${earnings.nextReportDateKey}.`
    : earnings?.state === 'pass' ? ' The earnings calendar returned no dated report in its retrieved window.' : ' Earnings-calendar context is unavailable or unusable.'
  if (!events.length) {
    return {
      state: 'pass',
      result: 'NO EVENTS IN WINDOW',
      detail: `Bitget MCP returned no dividend events in the retrieved window.${earningsNote} Split adjustment is not covered by these entries, so no split claim is made.`,
    }
  }
  return {
    state: 'pass',
    result: `${events.length} EVENT${events.length === 1 ? '' : 'S'}`,
    detail: `${events.length} dividend event${events.length === 1 ? '' : 's'} retrieved from Bitget MCP; most recent ex-date ${events[0].dateKey}${Number.isFinite(events[0].amount) ? ` at ${events[0].amount}${events[0].currency ? ` ${events[0].currency}` : ''}` : ''}.${earningsNote} Split adjustment is not covered by these entries, so no split claim is made.`,
  }
}

/**
 * Build every MCP evidence record plus the corporate-action check update.
 * @param collected - the value returned by `mcpQueryMany`.
 */
export function buildMcpEvidence(collected, nowMs) {
  const server = collected?.server ?? null
  const entries = collected?.entries ?? {}
  const quote = quoteEvidence(entries.quote, server, nowMs)
  const history = historyEvidence(entries.history, server, nowMs)
  const dividends = dividendEvidence(entries.dividends, server, nowMs)
  const earnings = earningsEvidence(entries.earnings, server, nowMs)
  const coherence = priceCoherenceFrom(quote, history, nowMs)
  return {
    server,
    evidence: [quote, history, coherence.evidence, dividends, earnings],
    quote,
    history,
    coherence,
    dividends,
    earnings,
    corporateCheck: corporateCheckFrom(dividends, earnings),
    // Reported to the client so the desk can state which official sources answered.
    integration: {
      server: server?.name ?? 'bitget-mcp-server',
      version: server?.version ?? null,
      requested: MCP_QUERIES.map((query) => query.entryId),
      answered: MCP_QUERIES.filter((query) => entries[query.id]?.ok).map((query) => query.entryId),
      failed: MCP_QUERIES.filter((query) => entries[query.id] && !entries[query.id].ok).map((query) => query.entryId),
    },
  }
}
