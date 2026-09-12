import { createHmac } from 'node:crypto'

const required = ['BITGET_ACCESS_KEY', 'BITGET_SECRET_KEY', 'BITGET_PASSPHRASE']
const missing = required.filter((name) => !process.env[name])
if (missing.length) {
  console.error(`Missing server-only variables: ${missing.join(', ')}`)
  process.exit(2)
}

const path = '/api/v3/stockplus/market/quote'
const query = 'symbol=AAPL.US'
const timestamp = String(Date.now())
const signature = createHmac('sha256', process.env.BITGET_SECRET_KEY)
  .update(`${timestamp}GET${path}?${query}`)
  .digest('base64')
const response = await fetch(`https://api.bitget.com${path}?${query}`, {
  headers: {
    'ACCESS-KEY': process.env.BITGET_ACCESS_KEY,
    'ACCESS-SIGN': signature,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': process.env.BITGET_PASSPHRASE,
    accept: 'application/json',
    locale: 'en-US',
  },
})
const payload = await response.json().catch(() => null)
if (!response.ok || payload?.code !== '00000' || !payload?.data?.list?.[0]) {
  console.error(JSON.stringify({ ok: false, httpStatus: response.status, code: payload?.code, message: payload?.msg || 'Unreadable response' }))
  process.exit(1)
}
const quote = payload.data.list[0]
console.log(JSON.stringify({ ok: true, permission: 'Stock+ market data (read-only)', symbol: quote.symbol, timestamp: quote.timestamp, tradeStatus: quote.tradeStatus }))
