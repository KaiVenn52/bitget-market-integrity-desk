import { describe, expect, it } from 'vitest'
import { parseStockQuoteCandidates } from './sources.js'
import { pickReference } from './analysis.js'

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
