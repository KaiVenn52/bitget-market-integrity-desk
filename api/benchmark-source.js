import { createHmac } from 'node:crypto'

const BITGET_BASE = 'https://api.bitget.com'
const INTERVAL_MS = 5 * 60 * 1000
const allowed = new Map([
  ['rNVDAUSDT', { underlyingSymbol: 'NVDA.US', company: 'NVIDIA' }],
  ['rAAPLUSDT', { underlyingSymbol: 'AAPL.US', company: 'Apple' }],
  ['rTSLAUSDT', { underlyingSymbol: 'TSLA.US', company: 'Tesla' }],
  ['rQQQUSDT', { underlyingSymbol: 'QQQ.US', company: 'Invesco QQQ' }],
])

export const config = { maxDuration: 15 }

async function getJson(path, signal, headers = {}) {
  const response = await fetch(`${BITGET_BASE}${path}`, {
    headers: { accept: 'application/json', 'user-agent': 'Market-Integrity-Desk/0.1', ...headers },
    signal,
  })
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch { throw new Error('Source returned non-JSON') }
  if (!response.ok || json.code !== '00000') throw new Error(json.msg || 'Bitget API error')
  return json
}

function stockAuthHeaders(path, query) {
  const key = process.env.BITGET_ACCESS_KEY
  const secret = process.env.BITGET_SECRET_KEY
  const passphrase = process.env.BITGET_PASSPHRASE
  if (!key || !secret || !passphrase) return null
  const timestamp = String(Date.now())
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}GET${path}?${query}`)
    .digest('base64')
  return {
    'ACCESS-KEY': key,
    'ACCESS-SIGN': signature,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': passphrase,
    locale: 'en-US',
  }
}

const numeric = (value) => Number(value)
const timestampMs = (value) => Number(value) < 1_000_000_000_000 ? Number(value) * 1000 : Number(value)

function normalizeTokenCandle(row) {
  return {
    timestamp: numeric(row[0]),
    open: numeric(row[1]),
    high: numeric(row[2]),
    low: numeric(row[3]),
    close: numeric(row[4]),
    volume: numeric(row[5]),
    turnover: numeric(row[6]),
  }
}

function normalizeStockCandle(row) {
  return {
    timestamp: timestampMs(row.timestamp),
    open: numeric(row.open),
    high: numeric(row.high),
    low: numeric(row.low),
    close: numeric(row.close),
    volume: numeric(row.volume),
    turnover: numeric(row.turnover),
    tradeSession: row.tradeSession || 'Unknown',
  }
}

export default async function handler(req, res) {
  const symbol = String(req.query.symbol || '')
  const meta = allowed.get(symbol)
  if (!meta) return res.status(400).json({ error: 'Unsupported symbol' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const tokenPath = `/api/v3/market/candles?category=SPOT&symbol=${symbol}&interval=5m&limit=8`
    const stockPath = '/api/v3/stockplus/market/candlestick'
    const stockQuery = `symbol=${encodeURIComponent(meta.underlyingSymbol)}&period=Min_5&count=20&adjustType=NoAdjust`
    const stockHeaders = stockAuthHeaders(stockPath, stockQuery)
    const stockPromise = stockHeaders
      ? getJson(`${stockPath}?${stockQuery}`, controller.signal, stockHeaders).catch(() => null)
      : Promise.resolve(null)
    const [tokenResult, stockResult] = await Promise.all([
      getJson(tokenPath, controller.signal),
      stockPromise,
    ])

    const capturedAtMs = Date.now()
    const tokenCandles = (tokenResult.data || [])
      .map(normalizeTokenCandle)
      .filter((row) => Number.isFinite(row.timestamp) && row.timestamp + INTERVAL_MS <= capturedAtMs)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 4)
      .sort((a, b) => a.timestamp - b.timestamp)
    const stockCandles = (stockResult?.data?.list || [])
      .map(normalizeStockCandle)
      .filter((row) => Number.isFinite(row.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp)

    if (tokenCandles.length < 4) return res.status(503).json({ error: 'Fewer than four closed rToken candles were available' })

    return res.status(200).json({
      schemaVersion: 1,
      capturedAt: new Date(capturedAtMs).toISOString(),
      instrument: { symbol, ...meta },
      interval: '5m',
      tokenSource: {
        name: 'Bitget UTA v3',
        endpoint: '/api/v3/market/candles',
        requestTime: new Date(Number(tokenResult.requestTime || capturedAtMs)).toISOString(),
      },
      stockSource: {
        name: 'Bitget Stock+',
        endpoint: stockPath,
        status: stockHeaders ? (stockResult ? 'available' : 'request_failed') : 'credentials_missing',
      },
      tokenCandles,
      stockCandles,
    })
  } catch (error) {
    return res.status(503).json({
      error: 'Benchmark source unavailable',
      detail: error?.name === 'AbortError' ? 'Source request timed out' : 'Source request failed',
    })
  } finally {
    clearTimeout(timer)
  }
}
