import { describe, expect, it } from 'vitest'
import {
  buildMcpEvidence,
  buildMcpQueries,
  corporateCheckFrom,
  dividendEvidence,
  earningsEvidence,
  historyEvidence,
  mcpSource,
  priceCoherenceFrom,
  quoteEvidence,
} from './mcp-evidence.js'

const SERVER = { name: 'bitget-mcp-server', version: '4.0.3' }
const AT = Date.parse('2026-09-21T15:30:00Z')
const ok = (rows, provider) => ({ ok: true, ms: 100, data: { provider, results: rows } })
const failed = (error) => ({ ok: false, ms: 100, error })

// Shapes below are copied from live responses, field names included. Reading a
// plausible-looking alias instead of the real one is what produced a false "no
// dividend in window" for an instrument that had just gone ex-dividend.
const LIVE_QUOTE = { symbol: 'NVDA', bid: 224.83, ask: 224.86, last_price: 224.865, last_timestamp: '2026-09-21T15:24:54.084260Z', prev_close: 222.27 }
const LIVE_DIVIDEND = { symbol: 'NVDA', ex_dividend_date: '2026-09-09', amount: 0.25, currency: 'USD', declaration_date: '2026-08-25', record_date: '2026-09-09', payment_date: '2026-09-30', event_type: '现金分红', is_special: false }
const LIVE_EARNINGS = { report_date: '2026-11-17', symbol: 'NVDA', name: null, eps_previous: null, eps_consensus: 2.5231, time: 1794873600000 }
const LIVE_CANDLE = { date: '2026-09-18T04:00:00Z', open: 223.5, high: 225.5, low: 222.1, close: 225.29, volume: 90000000, symbol: 'NVDA' }

describe('provenance labelling', () => {
  it('names the MCP server, its version and the vendor that answered', () => {
    expect(mcpSource(SERVER, ok([], 'massive'))).toBe('bitget-mcp-server v4.0.3 · provider massive')
  })

  it('says the provider is unspecified rather than inventing one', () => {
    expect(mcpSource(SERVER, ok([], null))).toBe('bitget-mcp-server v4.0.3 · provider unspecified')
  })

  // The authenticated Stock+ feed is a different pipeline. Calling MCP data
  // exchange-certified would be the exact misattribution this desk catches.
  it('never claims Stock+ or exchange certification', () => {
    const records = buildMcpEvidence({ server: SERVER, entries: { quote: ok([LIVE_QUOTE], 'massive') } }, AT).evidence
    for (const record of records) {
      expect(record.source).not.toMatch(/Stock\+|exchange-certified|certified/i)
    }
  })
})

describe('buildMcpQueries', () => {
  it('strips the .US suffix and upper-cases the ticker', () => {
    expect(buildMcpQueries('nvda.us', AT)[0].params.symbol).toBe('NVDA')
  })

  it('asks for the four official entries', () => {
    expect(buildMcpQueries('NVDA.US', AT).map((query) => query.entryId)).toEqual([
      'equity_price_quote',
      'equity_price_historical',
      'equity_fundamental_dividends',
      'equity_calendar_earnings',
    ])
  })

  it('looks forward for earnings so an upcoming report is visible', () => {
    const earnings = buildMcpQueries('NVDA.US', AT).find((query) => query.id === 'earnings')
    expect(earnings.params.start_date).toBe('2026-08-07')
    expect(earnings.params.end_date).toBe('2027-01-19')
  })

  it('returns nothing for an empty symbol', () => {
    expect(buildMcpQueries('', AT)).toEqual([])
    expect(buildMcpQueries(undefined, AT)).toEqual([])
  })
})

describe('quote evidence', () => {
  it('keeps the live price and the prior close as separate numbers', () => {
    const record = quoteEvidence(ok([LIVE_QUOTE], 'massive'), SERVER, AT)
    expect(record.state).toBe('pass')
    expect(record.quote.price).toBe(224.865)
    expect(record.priorClose).toBe(222.27)
    // Collapsing these is how a desk compares an overnight token price against a
    // price the underlying never traded at.
    expect(record.quote.price).not.toBe(record.priorClose)
  })

  it('derives the quote age from the source timestamp', () => {
    const record = quoteEvidence(ok([LIVE_QUOTE], 'massive'), SERVER, AT)
    expect(record.quote.ageSeconds).toBe(306)
  })

  it('computes the bid/ask spread in bps', () => {
    const record = quoteEvidence(ok([LIVE_QUOTE], 'massive'), SERVER, AT)
    expect(record.summary).toContain('1 bps')
  })

  it('abstains and says why when the entry failed', () => {
    const record = quoteEvidence(failed('timeout'), SERVER, AT)
    expect(record.state).toBe('unknown')
    expect(record.quote).toBeUndefined()
    expect(record.summary).toMatch(/timeout/)
  })

  it('abstains when the entry answered with no rows', () => {
    const record = quoteEvidence(ok([], 'massive'), SERVER, AT)
    expect(record.state).toBe('unknown')
  })

  it('does not turn a null price into a zero-price quote', () => {
    const record = quoteEvidence(ok([{ ...LIVE_QUOTE, last_price: null }], 'massive'), SERVER, AT)
    expect(record.state).toBe('unknown')
    expect(record.quote).toBeNull()
  })
})

describe('history evidence', () => {
  it('reports the window and the latest close', () => {
    const record = historyEvidence(ok([LIVE_CANDLE], 'massive'), SERVER, AT)
    expect(record.state).toBe('pass')
    expect(record.closes).toEqual([{ dateKey: '2026-09-18', close: 225.29 }])
  })

  it('drops rows with no usable close', () => {
    const record = historyEvidence(ok([LIVE_CANDLE, { date: '2026-09-17', close: 0 }, { date: '2026-09-16' }], 'massive'), SERVER, AT)
    expect(record.closes).toHaveLength(1)
  })

  it('abstains when the entry failed', () => {
    expect(historyEvidence(failed('timeout'), SERVER, AT).state).toBe('unknown')
  })

  it('does not call entirely unusable candles a successful history', () => {
    const record = historyEvidence(ok([{ date: '2026-09-18', close: null }], 'massive'), SERVER, AT)
    expect(record.state).toBe('unknown')
    expect(record.closes).toEqual([])
  })
})

describe('MCP price-series coherence', () => {
  it('reconciles the quote prior close with the preceding dated daily candle', () => {
    const quote = quoteEvidence(ok([LIVE_QUOTE], 'massive'), SERVER, AT)
    const history = historyEvidence(ok([{ ...LIVE_CANDLE, close: 222.27 }], 'massive'), SERVER, AT)
    const result = priceCoherenceFrom(quote, history, AT)
    expect(result.check.result).toBe('CONSISTENT')
    expect(result.check.detail).toMatch(/not independent confirmation/)
  })

  it('flags a mismatch without claiming external verification', () => {
    const quote = quoteEvidence(ok([LIVE_QUOTE], 'massive'), SERVER, AT)
    const history = historyEvidence(ok([LIVE_CANDLE], 'massive'), SERVER, AT)
    expect(priceCoherenceFrom(quote, history, AT).check.result).toBe('MISMATCH')
  })

  it('abstains when the quote or dated history is unavailable', () => {
    const quote = quoteEvidence(ok([LIVE_QUOTE], 'massive'), SERVER, AT)
    const history = historyEvidence(failed('timeout'), SERVER, AT)
    expect(priceCoherenceFrom(quote, history, AT).check.state).toBe('unknown')
  })
})

describe('dividend evidence', () => {
  // Regression guard: the live field is `ex_dividend_date`. An earlier version read
  // `ex_date ?? date ?? pay_date`, none of which exist, so a real dividend parsed as
  // no events at all.
  it('reads ex_dividend_date, not an invented alias', () => {
    const record = dividendEvidence(ok([LIVE_DIVIDEND], 'bitget_data'), SERVER, AT)
    expect(record.state).toBe('pass')
    expect(record.events).toHaveLength(1)
    expect(record.events[0].dateKey).toBe('2026-09-09')
    expect(record.events[0].amount).toBe(0.25)
    expect(record.events[0].currency).toBe('USD')
    expect(record.summary).toContain('2026-09-09')
    expect(record.summary).toContain('0.25 USD')
    expect(record.summary).toContain('cash dividend')
    expect(record.summary).not.toContain('现金分红')
  })

  it('does not claim split coverage', () => {
    expect(dividendEvidence(ok([LIVE_DIVIDEND], 'bitget_data'), SERVER, AT).summary).toMatch(/Split adjustment is not covered/)
  })

  it('sorts events by ex-date, newest first', () => {
    const older = { ...LIVE_DIVIDEND, ex_dividend_date: '2026-06-10', amount: 0.01 }
    const record = dividendEvidence(ok([older, LIVE_DIVIDEND], 'bitget_data'), SERVER, AT)
    expect(record.events.map((event) => event.dateKey)).toEqual(['2026-09-09', '2026-06-10'])
  })

  it('scopes an empty window as a bounded statement, not proof of absence', () => {
    const record = dividendEvidence(ok([], 'bitget_data'), SERVER, AT)
    expect(record.state).toBe('pass')
    expect(record.summary).toMatch(/bounded statement about this window/)
  })

  // Rows that arrived but carry no usable date are not the same claim as an empty
  // window, and must not be reported as one.
  it('distinguishes unusable rows from an empty window', () => {
    const record = dividendEvidence(ok([{ symbol: 'NVDA', amount: 0.25 }], 'bitget_data'), SERVER, AT)
    expect(record.events).toHaveLength(0)
    expect(record.summary).toMatch(/none carried a usable ex-dividend date/)
    expect(record.state).toBe('unknown')
  })

  it('stays unknown and refuses to infer absence when retrieval failed', () => {
    const record = dividendEvidence(failed('timeout'), SERVER, AT)
    expect(record.state).toBe('unknown')
    expect(record.summary).toMatch(/Absence of a corporate action is not inferred/)
  })
})

describe('earnings evidence', () => {
  it('reports the next report and how far out it is', () => {
    const record = earningsEvidence(ok([LIVE_EARNINGS], 'finnhub'), SERVER, AT)
    expect(record.state).toBe('pass')
    expect(record.nextReportDateKey).toBe('2026-11-17')
    expect(record.daysOut).toBe(57)
    expect(record.summary).toContain('consensus EPS 2.5231')
  })

  it('picks the earliest report that has not already passed', () => {
    const past = { ...LIVE_EARNINGS, report_date: '2026-08-27' }
    const record = earningsEvidence(ok([LIVE_EARNINGS, past], 'finnhub'), SERVER, AT)
    expect(record.nextReportDateKey).toBe('2026-11-17')
  })

  it('falls back to the most recent report when every date is in the past', () => {
    const past = { ...LIVE_EARNINGS, report_date: '2026-08-27' }
    const record = earningsEvidence(ok([past], 'finnhub'), SERVER, AT)
    expect(record.nextReportDateKey).toBe('2026-08-27')
    expect(record.summary).toMatch(/in the past/)
  })

  it('scopes an empty window as a bounded statement', () => {
    expect(earningsEvidence(ok([], 'finnhub'), SERVER, AT).summary).toMatch(/bounded statement about the window/)
  })

  it('flags unusable rows as caution instead of asserting a quiet calendar', () => {
    const record = earningsEvidence(ok([{ symbol: 'NVDA', name: null }], 'finnhub'), SERVER, AT)
    expect(record.state).toBe('caution')
    expect(record.summary).toMatch(/none carried a usable report date/)
  })

  it('abstains when the entry failed', () => {
    const record = earningsEvidence(failed('timeout'), SERVER, AT)
    expect(record.state).toBe('unknown')
    expect(record.nextReportDateKey).toBeNull()
  })
})

describe('corporate check', () => {
  // Regression guard: this used to be handed the raw MCP entry and read `.events`
  // off it, so it reported "no events in window" while the dividend evidence next
  // to it listed one.
  it('reports the events the dividend evidence actually parsed', () => {
    const dividends = dividendEvidence(ok([LIVE_DIVIDEND], 'bitget_data'), SERVER, AT)
    const check = corporateCheckFrom(dividends, earningsEvidence(ok([LIVE_EARNINGS], 'finnhub'), SERVER, AT))
    expect(check.state).toBe('pass')
    expect(check.result).toBe('1 EVENT')
    expect(check.detail).toContain('2026-09-09')
    expect(check.detail).toContain('2026-11-17')
  })

  it('stays unverifiable when dividends could not be retrieved', () => {
    const check = corporateCheckFrom(dividendEvidence(failed('timeout'), SERVER, AT), null)
    expect(check.state).toBe('unknown')
    expect(check.result).toBe('UNVERIFIABLE')
  })

  it('reports a bounded empty window without asserting a split position', () => {
    const check = corporateCheckFrom(dividendEvidence(ok([], 'bitget_data'), SERVER, AT), null)
    expect(check.state).toBe('pass')
    expect(check.result).toBe('NO EVENTS IN WINDOW')
    expect(check.detail).toMatch(/no split claim is made/)
    expect(check.detail).toMatch(/Earnings-calendar context is unavailable/)
    expect(check.detail).not.toMatch(/calendar was read/)
  })

  it('does not claim no events when dividend rows could not be parsed', () => {
    const dividends = dividendEvidence(ok([{ symbol: 'NVDA', amount: 0.25 }], 'bitget_data'), SERVER, AT)
    expect(corporateCheckFrom(dividends, null).result).toBe('UNVERIFIABLE')
  })
})

describe('buildMcpEvidence', () => {
  it('reports which official entries answered and which failed', () => {
    const built = buildMcpEvidence({
      server: SERVER,
      entries: { quote: ok([LIVE_QUOTE], 'massive'), history: failed('timeout'), dividends: ok([LIVE_DIVIDEND], 'bitget_data'), earnings: ok([LIVE_EARNINGS], 'finnhub') },
    }, AT)
    expect(built.integration.server).toBe('bitget-mcp-server')
    expect(built.integration.version).toBe('4.0.3')
    expect(built.integration.answered).toEqual(['equity_price_quote', 'equity_fundamental_dividends', 'equity_calendar_earnings'])
    expect(built.integration.failed).toEqual(['equity_price_historical'])
  })

  it('emits all four evidence records even when nothing was collected', () => {
    const built = buildMcpEvidence(null, AT)
    expect(built.evidence.map((record) => record.id)).toEqual(['mcp-quote', 'mcp-history', 'mcp-coherence', 'mcp-dividends', 'mcp-earnings'])
    for (const record of built.evidence) expect(record.state).toBe('unknown')
  })

  it('surfaces the quote and prior close for the reference layer', () => {
    const built = buildMcpEvidence({ server: SERVER, entries: { quote: ok([LIVE_QUOTE], 'massive') } }, AT)
    expect(built.quote.quote.price).toBe(224.865)
    expect(built.quote.priorClose).toBe(222.27)
  })
})
