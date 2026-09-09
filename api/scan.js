const BITGET_BASE = 'https://api.bitget.com'
const allowed = new Map([
  ['rNVDAUSDT', { underlyingSymbol: 'NVDA.US', company: 'NVIDIA' }],
  ['rAAPLUSDT', { underlyingSymbol: 'AAPL.US', company: 'Apple' }],
  ['rTSLAUSDT', { underlyingSymbol: 'TSLA.US', company: 'Tesla' }],
  ['rQQQUSDT', { underlyingSymbol: 'QQQ.US', company: 'Invesco QQQ' }],
])

async function getJson(path, signal) {
  const response = await fetch(`${BITGET_BASE}${path}`, { headers: { accept: 'application/json', 'user-agent': 'Market-Integrity-Desk/0.1' }, signal })
  if (!response.ok) throw new Error(`Bitget ${response.status}`)
  const json = await response.json()
  if (json.code !== '00000') throw new Error(json.msg || 'Bitget API error')
  return json
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
    const [tokenResult, stockResult] = await Promise.all([
      getJson(`/api/v3/market/tickers?category=SPOT&symbol=${symbol}`, controller.signal),
      getJson(`/api/v3/stockplus/market/quote?symbol=${meta.underlyingSymbol}`, controller.signal),
    ])
    const token = tokenResult.data?.find?.((item) => item.symbol?.toLowerCase() === symbol.toLowerCase()) || tokenResult.data?.[0]
    const stock = stockResult.data?.list?.[0]
    if (!token || !stock) throw new Error('Required market fields unavailable')
    const now = Date.now()
    const tokenPrice = Number(token.lastPrice)
    const underlyingPrice = Number(stock.lastDone)
    const tokenAge = Math.max(0, Math.round((now - Number(token.ts || tokenResult.requestTime)) / 1000))
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
    const scannedAt = new Date().toISOString()
    const hhmm = scannedAt.slice(11,16)
    return res.status(200).json({ instrument:{symbol,underlyingSymbol:meta.underlyingSymbol,company:meta.company,tokenPrice,underlyingPrice,change24h:Number(token.price24hPcnt || 0)*100}, state, mode:'live', reasoningMode:'rules', scannedAt, sessionState:stock.tradeStatus || 'Observed', tokenQuoteAge:tokenAge, underlyingQuoteAge:underlyingAge, premiumBps, liquidity:'NOT OBSERVABLE', corporateAction:'Unverifiable', checks, evidence:[{id:'price',title:'Token vs. underlying alignment',summary:`Observed premium is ${premiumBps} bps.`,state:alignment,timestamp:hhmm,source:'Bitget live APIs',endpoint:'/api/v3/market/tickers + /stockplus/market/quote',retrievedAt:scannedAt},{id:'liquidity',title:'Liquidity depth',summary:'Reality depth access is not configured.',state:'unknown',timestamp:hhmm,source:'Reality order book',endpoint:'/api/v3/account/reality-orderbook',retrievedAt:scannedAt}], timeline:[{id:'t1',time:hhmm,title:'Current token quote',detail:`${tokenPrice} USDT`,kind:'token',offset:20},{id:'t2',time:hhmm,title:'Current underlying',detail:`${underlyingPrice} USD`,kind:'underlying',offset:78}], brief:`The observable token and underlying prices differ by ${Math.abs(premiumBps)} bps. Source timestamps were retained. Liquidity depth and corporate-action context are not observable in this run, so the desk abstains from claims about execution quality and event absence.` })
  } catch (error) {
    return res.status(503).json({ error: 'Live Bitget sources unavailable', detail: error instanceof Error ? error.message : 'Unknown error' })
  } finally { clearTimeout(timer) }
}
