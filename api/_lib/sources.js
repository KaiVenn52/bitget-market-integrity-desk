// Retrieval layer.
//
// Everything in this file talks to an external source. Nothing in this file
// decides anything: callers pass the records to the deterministic modules in
// analysis.js and gate.js. Keeping retrieval separate is what makes the desk
// reproducible — the same endpoints, the same timestamps, the same evidence IDs
// for the analysis endpoint and the integrity sweep alike.

import { createHmac } from 'node:crypto'

export const BITGET_BASE = 'https://api.bitget.com'
export const MAX_HEADLINES = 10
export const HEADLINE_LOOKBACK_HOURS = 8

export const INSTRUMENTS = new Map([
  ['rNVDAUSDT', { underlyingSymbol: 'NVDA.US', ticker: 'NVDA', company: 'NVIDIA', newsQuery: 'NVIDIA' }],
  ['rAAPLUSDT', { underlyingSymbol: 'AAPL.US', ticker: 'AAPL', company: 'Apple', newsQuery: 'Apple' }],
  ['rTSLAUSDT', { underlyingSymbol: 'TSLA.US', ticker: 'TSLA', company: 'Tesla', newsQuery: 'Tesla' }],
  ['rQQQUSDT', { underlyingSymbol: 'QQQ.US', ticker: 'QQQ', company: 'Invesco QQQ', newsQuery: 'Invesco QQQ ETF' }],
])

export const SYMBOLS = [...INSTRUMENTS.keys()]

/** Strip credentials out of anything that might be echoed back to a client. */
export function sanitize(message) {
  const secrets = [process.env.BITGET_ACCESS_KEY, process.env.BITGET_SECRET_KEY, process.env.BITGET_PASSPHRASE, process.env.BITGET_QWEN_API_KEY].filter(Boolean)
  let text = typeof message === 'string' ? message : 'Source error'
  for (const secret of secrets) text = text.replaceAll(secret, '[redacted]')
  return text.replace(/[\r\n]+/g, ' ').slice(0, 180)
}

export async function getJson(path, signal, headers = {}) {
  const response = await fetch(`${BITGET_BASE}${path}`, {
    headers: { accept: 'application/json', 'user-agent': 'Market-Integrity-Desk/0.2', ...headers },
    signal,
  })
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch { throw new Error(`${path} returned non-JSON (${response.status})`) }
  if (!response.ok || json.code !== '00000') throw new Error(`${path} failed: ${json.msg || response.status}`)
  return json
}

export function stockAuthHeaders(path, query) {
  const key = process.env.BITGET_ACCESS_KEY
  const secret = process.env.BITGET_SECRET_KEY
  const passphrase = process.env.BITGET_PASSPHRASE
  if (!key || !secret || !passphrase) return null
  const timestamp = String(Date.now())
  const signature = createHmac('sha256', secret).update(`${timestamp}GET${path}?${query}`).digest('base64')
  return { 'ACCESS-KEY': key, 'ACCESS-SIGN': signature, 'ACCESS-TIMESTAMP': timestamp, 'ACCESS-PASSPHRASE': passphrase, locale: 'en-US' }
}

/** Run a retrieval that is allowed to fail without failing the whole request. */
export async function attempt(fn, fallback) {
  try { return await fn() } catch (error) { return { ...fallback, error: sanitize(error instanceof Error ? error.message : error) } }
}

export const toCandle = (row) => ({
  timestamp: Number(row[0]),
  open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]),
  volume: Number(row[5]), turnover: Number(row[6]),
})

export function fetchTicker(symbol, signal) {
  return getJson(`/api/v3/market/tickers?category=SPOT&symbol=${symbol}`, signal)
}

export function fetchCandles(symbol, interval, limit, signal) {
  return getJson(`/api/v3/market/candles?category=SPOT&symbol=${symbol}&interval=${interval}&limit=${limit}`, signal)
}

/** Stock+ quotes for each session, so the desk can pick the one that applies now. */
export async function fetchReferenceQuotes(meta, signal) {
  const path = '/api/v3/stockplus/market/quote'
  const sessions = ['Intraday', 'PreMarket', 'PostMarket', 'Overnight']
  const results = await Promise.all(sessions.map(async (tradeSession) => {
    const query = `symbol=${encodeURIComponent(meta.underlyingSymbol)}&tradeSessions=${tradeSession}`
    const headers = stockAuthHeaders(path, query)
    if (!headers) return null
    try {
      const json = await getJson(`${path}?${query}`, signal, headers)
      const row = json?.data?.list?.[0]
      if (!row) return null
      return {
        session: tradeSession === 'Intraday' ? 'regular' : tradeSession === 'PreMarket' ? 'premarket' : tradeSession === 'PostMarket' ? 'afterhours' : 'overnight',
        label: tradeSession,
        price: Number(row.lastDone),
        timestampMs: Number(row.timestamp),
        tradeStatus: row.tradeStatus ?? null,
        endpoint: `${path}?tradeSessions=${tradeSession}`,
      }
    } catch { return null }
  }))
  return results.filter((item) => item && Number.isFinite(item.price) && Number.isFinite(item.timestampMs))
}

const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A headline only counts when it names the instrument in its own text. */
export function isRelevant(title, meta) {
  if (!title) return false
  const ticker = new RegExp(`\\b${escapeRe(meta.ticker)}\\b`, 'i')
  const company = new RegExp(escapeRe(meta.company), 'i')
  return ticker.test(title) || company.test(title)
}

/**
 * Keyless headline retrieval. Relevance-filtered: an unrelated headline is not
 * evidence, and the provider's relatedTickers tag is too broad to decide that.
 */
export async function fetchHeadlines(meta, options = {}) {
  const timeoutMs = options.timeoutMs ?? 8000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const notes = []
  const collected = []
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(meta.ticker)}&newsCount=20&quotesCount=0&enableFuzzyQuery=false`
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; MarketIntegrityDesk/0.2)', accept: 'application/json' } })
    if (response.ok) {
      const json = await response.json()
      for (const item of json?.news ?? []) {
        const title = String(item.title ?? '')
        if (!isRelevant(title, meta)) continue
        collected.push({
          id: `news-${collected.length + 1}`,
          title: title.slice(0, 200),
          publisher: String(item.publisher ?? 'Unknown publisher').slice(0, 60),
          link: String(item.link ?? ''),
          publishedMs: Number.isFinite(Number(item.providerPublishTime)) ? Number(item.providerPublishTime) * 1000 : null,
          source: 'Yahoo Finance search',
        })
      }
      notes.push(`Yahoo Finance search returned ${(json?.news ?? []).length} items, ${collected.length} named ${meta.company} or ${meta.ticker} in the headline.`)
    } else {
      notes.push(`Yahoo Finance search returned HTTP ${response.status}.`)
    }
  } catch (error) {
    notes.push(`Yahoo Finance search failed: ${sanitize(error instanceof Error ? error.message : error)}`)
  }
  if (!collected.length) {
    try {
      const response = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(meta.newsQuery + ' stock')}&hl=en-US&gl=US&ceid=US:en`, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; MarketIntegrityDesk/0.2)' } })
      if (response.ok) {
        const xml = await response.text()
        const items = xml.split('<item>').slice(1, 15)
        for (const chunk of items) {
          const title = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s.exec(chunk)?.[1] ?? ''
          const pubDate = /<pubDate>(.*?)<\/pubDate>/s.exec(chunk)?.[1] ?? ''
          const source = /<source[^>]*>(.*?)<\/source>/s.exec(chunk)?.[1] ?? 'Google News'
          const link = /<link>(.*?)<\/link>/s.exec(chunk)?.[1] ?? ''
          const publishedMs = pubDate ? Date.parse(pubDate) : NaN
          if (!isRelevant(title, meta)) continue
          collected.push({ id: `news-${collected.length + 1}`, title: title.replace(/<[^>]+>/g, '').slice(0, 200), publisher: source.slice(0, 60), link, publishedMs: Number.isFinite(publishedMs) ? publishedMs : null, source: 'Google News RSS' })
        }
        notes.push(`Google News RSS supplied ${collected.length} headline(s) naming ${meta.company}.`)
      } else {
        notes.push(`Google News RSS returned HTTP ${response.status}.`)
      }
    } catch (error) {
      notes.push(`Google News RSS failed: ${sanitize(error instanceof Error ? error.message : error)}`)
    }
  }
  clearTimeout(timer)
  const recent = collected
    .filter((item) => item.publishedMs === null || item.publishedMs > Date.now() - HEADLINE_LOOKBACK_HOURS * 3600 * 1000)
    .sort((a, b) => (b.publishedMs ?? 0) - (a.publishedMs ?? 0))
    .slice(0, options.maxHeadlines ?? MAX_HEADLINES)
  return { headlines: recent, note: notes.join(' '), status: recent.length ? 'available' : 'unavailable' }
}
