import { createHmac } from 'node:crypto'

const BITGET_BASE = 'https://api.bitget.com'
const allowed = new Map([
  ['rNVDAUSDT', { underlyingSymbol: 'NVDA.US', company: 'NVIDIA' }],
  ['rAAPLUSDT', { underlyingSymbol: 'AAPL.US', company: 'Apple' }],
  ['rTSLAUSDT', { underlyingSymbol: 'TSLA.US', company: 'Tesla' }],
  ['rQQQUSDT', { underlyingSymbol: 'QQQ.US', company: 'Invesco QQQ' }],
])

async function getJson(path, signal, headers = {}) {
  const response = await fetch(`${BITGET_BASE}${path}`, { headers: { accept: 'application/json', 'user-agent': 'Market-Integrity-Desk/0.1', ...headers }, signal })
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch { throw new Error(`${path} returned non-JSON (${response.status})`) }
  if (!response.ok || json.code !== '00000') throw new Error(`${path} failed (${response.status}): ${json.msg || 'Bitget API error'}`)
  return json
}

function stockAuthHeaders(path, query) {
  const key = process.env.BITGET_ACCESS_KEY
  const secret = process.env.BITGET_SECRET_KEY
  const passphrase = process.env.BITGET_PASSPHRASE
  if (!key || !secret || !passphrase) return {}
  const timestamp = String(Date.now())
  const payload = `${timestamp}GET${path}?${query}`
  const signature = createHmac('sha256', secret).update(payload).digest('base64')
  return { 'ACCESS-KEY': key, 'ACCESS-SIGN': signature, 'ACCESS-TIMESTAMP': timestamp, 'ACCESS-PASSPHRASE': passphrase, locale: 'en-US' }
}

const bps = (a, b) => Math.round(((a - b) / b) * 10000)
const checkState = (value, pass, caution) => Math.abs(value) <= pass ? 'pass' : Math.abs(value) <= caution ? 'caution' : 'fail'

export default async function handler(req, res) {
  const symbol = String(req.query.symbol || 'rNVDAUSDT')
  const meta = allowed.get(symbol)
  if (!meta) return res.status(400).json({ error: 'Unsupported symbol' })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5500)
  try {
    const tokenResult = await getJson(`/api/v3/market/tickers?category=SPOT&symbol=${symbol}`, controller.signal)
    const stockPath = '/api/v3/stockplus/market/quote'
    const stockQuery = `symbol=${encodeURIComponent(meta.underlyingSymbol)}`
    let stockResult = null
    try { stockResult = await getJson(`${stockPath}?${stockQuery}`, controller.signal, stockAuthHeaders(stockPath, stockQuery)) } catch { stockResult = null }
    const token = tokenResult.data?.find?.((item) => item.symbol?.toLowerCase() === symbol.toLowerCase()) || tokenResult.data?.[0]
    const stock = stockResult?.data?.list?.[0]
    if (!token) throw new Error('Required rToken ticker fields unavailable')
    const now = Date.now()
    const tokenPrice = Number(token.lastPrice)
    const tokenAge = Math.max(0, Math.round((now - Number(token.ts || tokenResult.requestTime)) / 1000))
    const scannedAt = new Date().toISOString()
    const hhmm = scannedAt.slice(11,16)

    if (!stock) {
      const tokenFreshness = tokenAge <= 30 ? 'pass' : tokenAge <= 120 ? 'caution' : 'fail'
      const checks = [
        { id:'alignment', title:'Price alignment', summary:'Token vs. underlying within declared threshold', state:'unknown', result:'UNVERIFIABLE', detail:'The live rToken ticker was retrieved, but the authenticated Stock+ quote was unavailable. No premium was calculated.', observations:[{label:'Token price',value:`${tokenPrice} USDT`},{label:'Underlying',value:'Credentialed source unavailable',accent:'unknown'}]},
        { id:'freshness', title:'Quote freshness', summary:'Available source timestamps are checked independently', state:tokenFreshness, result:`Token ${tokenAge}s · Underlying N/A`, detail:'The rToken timestamp is current-source evidence. Underlying freshness remains unknown.', observations:[{label:'Token quote age',value:`${tokenAge}s`,accent:tokenFreshness},{label:'Underlying quote age',value:'Unavailable',accent:'unknown'}]},
        { id:'session', title:'Session consistency', summary:'Underlying session status is required', state:'unknown', result:'UNVERIFIABLE', detail:'Session consistency cannot be established without the Stock+ response.', observations:[{label:'Policy',value:'Abstain when reference source is missing'}]},
        { id:'corporate', title:'Corporate actions', summary:'Split and dividend context is machine-readable', state:'unknown', result:'UNVERIFIABLE', detail:'Corporate-action data was not available in this scan.', observations:[{label:'Policy',value:'Never infer absence from missing data'}]},
        { id:'liquidity', title:'Liquidity observability', summary:'Sufficient depth exists to characterize execution risk', state:'unknown', result:'NOT OBSERVABLE', detail:'Reality depth access is not configured.', observations:[{label:'Output',value:'No thin/deep claim made'}]},
      ]
      return res.status(200).json({ instrument:{symbol,underlyingSymbol:meta.underlyingSymbol,company:meta.company,tokenPrice,underlyingPrice:null,change24h:Number(token.price24hPcnt || 0)*100}, state:'UNVERIFIABLE', mode:'live', reasoningMode:'rules', scannedAt, sessionState:'Unverifiable', tokenQuoteAge:tokenAge, underlyingQuoteAge:null, premiumBps:null, liquidity:'NOT OBSERVABLE', corporateAction:'Unverifiable', checks, evidence:[{id:'token',title:'Live rToken ticker',summary:`${symbol} last price ${tokenPrice} USDT; quote age ${tokenAge}s.`,state:tokenFreshness,timestamp:hhmm,source:'Bitget UTA public market data',endpoint:'/api/v3/market/tickers',retrievedAt:scannedAt},{id:'underlying',title:'Underlying Stock+ quote',summary:'Authenticated Stock+ quote was unavailable; alignment is not calculated.',state:'unknown',timestamp:hhmm,source:'Bitget Stock+',endpoint:'/api/v3/stockplus/market/quote',retrievedAt:scannedAt},{id:'corporate',title:'Corporate-action context',summary:'No machine-readable response available; absence is not inferred.',state:'unknown',timestamp:hhmm,source:'Bitget Stock+ / Reality',endpoint:'Not retrieved',retrievedAt:scannedAt},{id:'liquidity',title:'Liquidity depth',summary:'Reality depth access is not configured.',state:'unknown',timestamp:hhmm,source:'Reality order book',endpoint:'/api/v3/account/reality-orderbook',retrievedAt:scannedAt}], timeline:[{id:'t1',time:hhmm,title:'Live token quote',detail:`${tokenPrice} USDT`,kind:'token',offset:22},{id:'t2',time:hhmm,title:'Evidence boundary',detail:'Underlying unavailable',kind:'underlying',offset:82}], brief:`A live ${symbol} ticker was retrieved at ${tokenPrice} USDT with a source age of ${tokenAge} seconds. The Stock+ underlying quote was not available to this deployment, so price alignment, session consistency, and underlying freshness are unverifiable. Liquidity depth and corporate-action context are also not observable. The desk abstains from an integrity conclusion rather than combining live and snapshot data.`, briefEvidenceIds:[], researchAction:'Do not use token-versus-underlying alignment as a decision input until a fresh Stock+ quote is available. Re-run after authenticated reference data returns.', reasoningNote:'Deterministic fallback · Qwen enrichment pending' })
    }

    const underlyingPrice = Number(stock.lastDone)
    const stockTime = new Date(stock.timestamp).getTime()
    const underlyingAge = Math.max(0, Math.round((now - stockTime) / 1000))
    const premiumBps = bps(tokenPrice, underlyingPrice)
    const alignment = checkState(premiumBps, 20, 100)
    const freshness = Math.max(tokenAge, underlyingAge) <= 30 ? 'pass' : Math.max(tokenAge, underlyingAge) <= 120 ? 'caution' : 'fail'
    const checks = [
      { id:'alignment', title:'Price alignment', summary:'Token vs. underlying within declared threshold', state:alignment, result:`${premiumBps > 0 ? '+' : ''}${premiumBps} bps`, detail:'Signed premium is computed from the latest observable prices.', observations:[{label:'Formula',value:'(token − underlying) / underlying × 10,000'},{label:'Pass threshold',value:'absolute premium ≤ 20 bps'}]},
      { id:'freshness', title:'Quote freshness', summary:'Both markets publish recent, timestamped data', state:freshness, result:`Token ${tokenAge}s · Underlying ${underlyingAge}s`, detail:'Freshness is evaluated independently per source.', observations:[{label:'Token quote age',value:`${tokenAge}s`,accent:freshness},{label:'Underlying quote age',value:`${underlyingAge}s`,accent:freshness}]},
      { id:'session', title:'Session consistency', summary:'Observed exchange status is preserved', state:'pass', result:String(stock.tradeStatus || 'OBSERVED').toUpperCase(), detail:'The exchange-provided session status is preserved.', observations:[{label:'Observed',value:String(stock.tradeStatus || 'Available'),accent:'pass'}]},
      { id:'corporate', title:'Corporate actions', summary:'Split and dividend context is machine-readable', state:'unknown', result:'UNVERIFIABLE', detail:'Corporate-action endpoint is not part of this initial scan.', observations:[{label:'Policy',value:'Never infer absence from missing data'}]},
      { id:'liquidity', title:'Liquidity observability', summary:'Sufficient depth exists to characterize execution risk', state:'unknown', result:'NOT OBSERVABLE', detail:'Reality depth access is not configured.', observations:[{label:'Output',value:'No thin/deep claim made'}]},
    ]
    const state = alignment === 'fail' || freshness === 'fail' || checks.some((c) => c.state === 'unknown') ? 'CAUTION' : 'PASS'
    return res.status(200).json({ instrument:{symbol,underlyingSymbol:meta.underlyingSymbol,company:meta.company,tokenPrice,underlyingPrice,change24h:Number(token.price24hPcnt || 0)*100}, state, mode:'live', reasoningMode:'rules', scannedAt, sessionState:stock.tradeStatus || 'Observed', tokenQuoteAge:tokenAge, underlyingQuoteAge:underlyingAge, premiumBps, liquidity:'NOT OBSERVABLE', corporateAction:'Unverifiable', checks, evidence:[{id:'price',title:'Token vs. underlying alignment',summary:`Observed premium is ${premiumBps} bps.`,state:alignment,timestamp:hhmm,source:'Bitget live APIs',endpoint:'/api/v3/market/tickers + /stockplus/market/quote',retrievedAt:scannedAt},{id:'liquidity',title:'Liquidity depth',summary:'Reality depth access is not configured.',state:'unknown',timestamp:hhmm,source:'Reality order book',endpoint:'/api/v3/account/reality-orderbook',retrievedAt:scannedAt}], timeline:[{id:'t1',time:hhmm,title:'Current token quote',detail:`${tokenPrice} USDT`,kind:'token',offset:20},{id:'t2',time:hhmm,title:'Current underlying',detail:`${underlyingPrice} USD`,kind:'underlying',offset:78}], brief:`The observable token and underlying prices differ by ${Math.abs(premiumBps)} bps. Source timestamps were retained. Liquidity depth and corporate-action context are not observable in this run, so the desk abstains from claims about execution quality and event absence.`, briefEvidenceIds:[], researchAction:state === 'PASS' ? 'The observable alignment checks pass. Review event and liquidity evidence before making a trading decision.' : 'Pause the market-state conclusion and inspect the failed or missing checks before relying on this price relationship.', reasoningNote:'Deterministic fallback · Qwen enrichment pending' })
  } catch (error) {
    return res.status(503).json({ error: 'Live Bitget sources unavailable', detail: error instanceof Error ? error.message : 'Unknown error' })
  } finally { clearTimeout(timer) }
}
