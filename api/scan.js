import { createHmac } from 'node:crypto'
import { mcpQueryMany } from './_lib/bitget-mcp.js'
import { buildMcpEvidence, buildMcpQueries } from './_lib/mcp-evidence.js'

// The official MCP runs four catalog entries one at a time, so this route needs
// more than the couple of seconds the Bitget market calls alone required.
export const config = { maxDuration: 30 }

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
const utcClock = (value) => {
  const ms = Number(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(11, 16) : 'N/A'
}

export default async function handler(req, res) {
  const symbol = String(req.query.symbol || 'rNVDAUSDT')
  const meta = allowed.get(symbol)
  if (!meta) return res.status(400).json({ error: 'Unsupported symbol' })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 11000)
  try {
    const stockPath = '/api/v3/stockplus/market/quote'
    const stockQuery = `symbol=${encodeURIComponent(meta.underlyingSymbol)}`
    // The token ticker, the Stock+ quote and the official Bitget MCP are
    // independent, so they are requested together. Run in sequence they each spent
    // the whole 5.5s budget, so a slow Stock+ response could time out a scan whose
    // public data had already arrived. The MCP client keeps its own, smaller
    // budget: it must degrade the evidence set, never the route.
    const [tokenResult, stockResult, mcpResult] = await Promise.all([
      getJson(`/api/v3/market/tickers?category=SPOT&symbol=${symbol}`, controller.signal),
      getJson(`${stockPath}?${stockQuery}`, controller.signal, stockAuthHeaders(stockPath, stockQuery)).catch(() => null),
      mcpQueryMany(buildMcpQueries(meta.underlyingSymbol, Date.now())).catch(() => null),
    ])
    const token = tokenResult.data?.find?.((item) => item.symbol?.toLowerCase() === symbol.toLowerCase()) || tokenResult.data?.[0]
    const stock = stockResult?.data?.list?.[0]
    if (!token) throw new Error('Required rToken ticker fields unavailable')
    const now = Date.now()
    const mcp = buildMcpEvidence(mcpResult, now)
    const tokenPrice = Number(token.lastPrice)
    const tokenTime = Number(token.ts || tokenResult.requestTime)
    const tokenAge = Math.max(0, Math.round((now - tokenTime) / 1000))
    const scannedAt = new Date().toISOString()
    const hhmm = scannedAt.slice(11,16)
    const tokenClock = utcClock(tokenTime)

    if (!stock) {
      const tokenFreshness = tokenAge <= 30 ? 'pass' : tokenAge <= 120 ? 'caution' : 'fail'
      const checks = [
        { id:'alignment', title:'Price alignment', summary:'Token vs. underlying within declared threshold', state:'unknown', result:'UNVERIFIABLE', detail:'The live rToken ticker was retrieved, but the authenticated Stock+ quote was unavailable. No premium was calculated.', observations:[{label:'Token price',value:`${tokenPrice} USDT`},{label:'Underlying',value:'Credentialed source unavailable',accent:'unknown'}]},
        { id:'freshness', title:'Quote freshness', summary:'Available source timestamps are checked independently', state:tokenFreshness, result:`Token ${tokenAge}s · Underlying N/A`, detail:'The rToken timestamp is current-source evidence. Underlying freshness remains unknown.', observations:[{label:'Token quote age',value:`${tokenAge}s`,accent:tokenFreshness},{label:'Underlying quote age',value:'Unavailable',accent:'unknown'}]},
        { id:'session', title:'Session consistency', summary:'Underlying session status is required', state:'unknown', result:'UNVERIFIABLE', detail:'Session consistency cannot be established without the Stock+ response.', observations:[{label:'Policy',value:'Abstain when reference source is missing'}]},
        mcp.coherence.check,
        { id:'corporate', title:'Corporate actions', summary:'Dividend events from the official Bitget MCP; earnings are separate catalyst context', ...mcp.corporateCheck, observations:[{label:'Source',value:mcp.integration.answered.includes('equity_fundamental_dividends') ? 'bitget-mcp-server' : 'Unavailable'},{label:'Policy',value:'Never infer absence from missing data'}]},
        { id:'liquidity', title:'Liquidity observability', summary:'Sufficient depth exists to characterize execution risk', state:'unknown', result:'NOT OBSERVABLE', detail:'Reality depth access is not configured.', observations:[{label:'Output',value:'No thin/deep claim made'}]},
      ]
      return res.status(200).json({ instrument:{symbol,underlyingSymbol:meta.underlyingSymbol,company:meta.company,tokenPrice,underlyingPrice:null,change24h:Number(token.price24hPcnt || 0)*100}, state:'UNVERIFIABLE', mode:'live', reasoningMode:'rules', scannedAt, sessionState:'Unverifiable', tokenQuoteAge:tokenAge, underlyingQuoteAge:null, premiumBps:null, liquidity:'NOT OBSERVABLE', corporateAction:mcp.corporateCheck.result, integration:mcp.integration, checks, evidence:[{id:'token',title:'Live rToken ticker',summary:`${symbol} last price ${tokenPrice} USDT; quote age ${tokenAge}s.`,state:tokenFreshness,timestamp:tokenClock,source:'Bitget UTA public market data',endpoint:'/api/v3/market/tickers',retrievedAt:scannedAt},{id:'underlying',title:'Underlying Stock+ quote',summary:'Authenticated Stock+ quote was unavailable; alignment is not calculated.',state:'unknown',timestamp:hhmm,source:'Bitget Stock+',endpoint:'/api/v3/stockplus/market/quote',retrievedAt:scannedAt},...mcp.evidence,{id:'liquidity',title:'Liquidity depth',summary:'Reality depth access is not configured.',state:'unknown',timestamp:hhmm,source:'Reality order book',endpoint:'/api/v3/account/reality-orderbook',retrievedAt:scannedAt}], timeline:[{id:'t1',time:tokenClock,title:'Token quote',detail:`${tokenPrice} USDT · ${tokenAge}s old`,kind:'token',offset:22},{id:'t2',time:hhmm,title:'Evidence boundary',detail:'Underlying unavailable',kind:'underlying',offset:82}], brief:`A live ${symbol} ticker was retrieved at ${tokenPrice} USDT with a source age of ${tokenAge} seconds. The Stock+ underlying quote was not available to this deployment, so price alignment, session consistency, and underlying freshness are unverifiable. Liquidity depth is not observable; dividend events and earnings are reported separately when the MCP entries answer. The desk abstains from an integrity conclusion rather than combining live and snapshot data.`, briefEvidenceIds:[], researchAction:'Do not use token-versus-underlying alignment as a decision input until a fresh Stock+ quote is available. Re-run after authenticated reference data returns.', reasoningNote:'Deterministic fallback · Qwen enrichment pending' })
    }

    const underlyingPrice = Number(stock.lastDone)
    const stockTime = new Date(stock.timestamp).getTime()
    const underlyingAge = Math.max(0, Math.round((now - stockTime) / 1000))
    const stockClock = utcClock(stockTime)
    const premiumBps = bps(tokenPrice, underlyingPrice)
    const alignment = checkState(premiumBps, 20, 100)
    const freshness = Math.max(tokenAge, underlyingAge) <= 30 ? 'pass' : Math.max(tokenAge, underlyingAge) <= 120 ? 'caution' : 'fail'
    const checks = [
      { id:'alignment', title:'Price alignment', summary:'Token vs. underlying within declared threshold', state:alignment, result:`${premiumBps > 0 ? '+' : ''}${premiumBps} bps`, detail:'Signed premium is computed from the latest observable prices.', observations:[{label:'Formula',value:'(token − underlying) / underlying × 10,000'},{label:'Pass threshold',value:'absolute premium ≤ 20 bps'}]},
      { id:'freshness', title:'Quote freshness', summary:'Both markets publish recent, timestamped data', state:freshness, result:`Token ${tokenAge}s · Underlying ${underlyingAge}s`, detail:'Freshness is evaluated independently per source.', observations:[{label:'Token quote age',value:`${tokenAge}s`,accent:freshness},{label:'Underlying quote age',value:`${underlyingAge}s`,accent:freshness}]},
      { id:'session', title:'Session status', summary:'Exchange-reported Stock+ trading status is preserved', state:'pass', result:String(stock.tradeStatus || 'OBSERVED').toUpperCase(), detail:'This records the exchange-provided status without inferring whether two venues share identical trading hours.', observations:[{label:'Observed',value:String(stock.tradeStatus || 'Available'),accent:'pass'}]},
      mcp.coherence.check,
      { id:'corporate', title:'Corporate actions', summary:'Dividend events from the official Bitget MCP; earnings are separate catalyst context', ...mcp.corporateCheck, observations:[{label:'Source',value:mcp.integration.answered.includes('equity_fundamental_dividends') ? 'bitget-mcp-server' : 'Unavailable'},{label:'Policy',value:'Never infer absence from missing data'}]},
      { id:'liquidity', title:'Liquidity observability', summary:'Sufficient depth exists to characterize execution risk', state:'unknown', result:'NOT OBSERVABLE', detail:'Reality depth access is not configured.', observations:[{label:'Output',value:'No thin/deep claim made'}]},
    ]
    const state = alignment === 'fail' || freshness === 'fail' || checks.some((c) => c.state === 'unknown') ? 'CAUTION' : 'PASS'
    return res.status(200).json({ instrument:{symbol,underlyingSymbol:meta.underlyingSymbol,company:meta.company,tokenPrice,underlyingPrice,change24h:Number(token.price24hPcnt || 0)*100}, state, mode:'live', reasoningMode:'rules', scannedAt, sessionState:stock.tradeStatus || 'Observed', tokenQuoteAge:tokenAge, underlyingQuoteAge:underlyingAge, premiumBps, liquidity:'NOT OBSERVABLE', corporateAction:mcp.corporateCheck.result, integration:mcp.integration, checks, evidence:[{id:'price',title:'Token vs. underlying alignment',summary:`Observed premium is ${premiumBps} bps; token source time ${tokenClock} UTC, underlying source time ${stockClock} UTC; Stock+ status is ${String(stock.tradeStatus || 'observed')}.`,state:alignment,timestamp:hhmm,source:'Bitget live APIs',endpoint:'/api/v3/market/tickers + /stockplus/market/quote',retrievedAt:scannedAt},...mcp.evidence,{id:'liquidity',title:'Liquidity depth',summary:'Reality depth access is not configured.',state:'unknown',timestamp:hhmm,source:'Reality order book',endpoint:'/api/v3/account/reality-orderbook',retrievedAt:scannedAt}], timeline:[{id:'t1',time:tokenClock,title:'Token quote',detail:`${tokenPrice} USDT · ${tokenAge}s old`,kind:'token',offset:20},{id:'t2',time:stockClock,title:'Underlying quote',detail:`${underlyingPrice} USD · ${underlyingAge}s old`,kind:'underlying',offset:78}], brief:`The observed token and underlying prices differ by ${Math.abs(premiumBps)} bps. Their source times and ages are shown separately; the underlying value is not described as current when it is stale. Liquidity depth is not observable; dividend events and earnings are reported separately when the MCP entries answer. The desk makes no claim about split adjustment or execution quality.`, briefEvidenceIds:[], researchAction:state === 'PASS' ? 'The observable alignment checks pass. Review event and liquidity evidence before making a trading decision.' : 'Pause the market-state conclusion and inspect the failed or missing checks before relying on this price relationship.', reasoningNote:'Deterministic fallback · Qwen enrichment pending' })
  } catch (error) {
    return res.status(503).json({ error: 'Live Bitget sources unavailable', detail: error instanceof Error ? error.message : 'Unknown error' })
  } finally { clearTimeout(timer) }
}
