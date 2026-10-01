import { describe, expect, it } from 'vitest'
import { closedCandles, parseStockQuoteCandidates } from './sources.js'
import { pickReference } from './analysis.js'

describe('closed candle boundary', () => {
  it('excludes forming and future bars, retaining a bar only when its full interval ended', () => {
    const now = Date.parse('2026-10-02T19:30:00Z')
    const rows = [19, 18, 20].map((hour) => ({ timestamp: Date.parse(`2026-10-02T${hour}:00:00Z`), close: 100 }))
    expect(closedCandles(rows, 3_600_000, now).map((row) => new Date(row.timestamp).getUTCHours())).toEqual([18])
    expect(closedCandles(rows, 3_600_000, now + 1_800_000).map((row) => new Date(row.timestamp).getUTCHours())).toEqual([18, 19])
  })
})

describe('Stock+ quote response parsing', () => {
  const row = {
    lastDone: 225.53,
    timestamp: '2026-09-23T15:34:00Z',
    tradeStatus: 'Normal',
    preMarketQuote: { lastDone: 224.1, timestamp: '2026-09-23T12:55:00Z' },
    postMarketQuote: null,
    overnightQuote: { lastDone: 223.8, timestamp: '2026-09-23T03:00:00Z' },
  }

  it('parses the documented ISO quote timestamp and embedded session variants', () => {
    const candidates = parseStockQuoteCandidates(row)
    expect(candidates.map((item) => item.session)).toEqual(['regular', 'premarket', 'overnight'])
    expect(candidates[0].timestampMs).toBe(Date.parse('2026-09-23T15:34:00Z'))
    expect(candidates[0].tradeStatus).toBe('Normal')
    expect(candidates[1].price).toBe(224.1)
  })

  it('feeds a fresh regular-session quote into the shared Gate/analysis reference selector', () => {
    const now = Date.parse('2026-09-23T15:35:00Z')
    const reference = pickReference(parseStockQuoteCandidates(row), now)
    expect(reference.kind).toBe('live-quote')
    expect(reference.stale).toBe(false)
    expect(reference.chosen.price).toBe(225.53)
    expect(reference.chosen.ageSeconds).toBe(60)
  })

  it('accepts numeric seconds and milliseconds without shifting the date', () => {
    const seconds = Math.floor(Date.parse('2026-09-23T15:34:00Z') / 1000)
    expect(parseStockQuoteCandidates({ lastDone: 225, timestamp: String(seconds) })[0].timestampMs).toBe(seconds * 1000)
    expect(parseStockQuoteCandidates({ lastDone: 225, timestamp: String(seconds * 1000) })[0].timestampMs).toBe(seconds * 1000)
  })

  it('rejects absent, invalid, and non-positive prices or timestamps', () => {
    expect(parseStockQuoteCandidates(null)).toEqual([])
    expect(parseStockQuoteCandidates({ lastDone: 0, timestamp: row.timestamp })).toEqual([])
    expect(parseStockQuoteCandidates({ lastDone: 225, timestamp: null })).toEqual([])
    expect(parseStockQuoteCandidates({ lastDone: 225, timestamp: 'not-a-date' })).toEqual([])
  })
})
