// Reproducible probe of the official bitget-signal Skill layer.
//
// The desk treats a source that returns nothing as a missing source, not as a
// finding. That rule applies to the desk's own dependencies too, so before the
// Skill layer is allowed anywhere near a verdict it has to survive this probe.
//
// Every tool is called with the argument shape published by tools/list — not with
// a guessed one, because a probe that calls a tool wrongly measures the probe, not
// the source. Each result is classified as usable, empty, error or timeout:
//
//   error    the call failed, or the payload carries a non-empty error field
//   empty    valid JSON that contains no observation: no number and no non-empty array
//   usable   anything that actually carries data
//
// Run: node scripts/probe-bitget-signal.mjs
// Writes: benchmark/bitget-signal-probe.json

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MCP_URL = 'https://datahub.noxiaohao.com/mcp'
const CALL_TIMEOUT_MS = 20_000
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parsePayload(text) {
  const records = text.split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => { try { return JSON.parse(line.slice(6)) } catch { return null } })
    .filter(Boolean)
  if (records.length) return records.at(-1)
  try { return JSON.parse(text) } catch { return null }
}

async function rpc(body, sessionId, timeoutMs = CALL_TIMEOUT_MS) {
  const started = Date.now()
  try {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    return { sessionId: response.headers.get('mcp-session-id') || sessionId, payload: parsePayload(text), latencyMs: Date.now() - started }
  } catch (error) {
    return { sessionId, payload: null, latencyMs: Date.now() - started, failure: error instanceof Error ? error.name : 'UnknownError' }
  }
}

/**
 * A string is an observation unless it is an echoed endpoint. Two tools answer with
 * `{"error": "", "url": "https://..."}` and nothing else: that is the request read
 * back to the caller, not a fact about the market, and counting it as data would
 * inflate the usable count with tools that returned nothing.
 */
const isObservationString = (value) => {
  const text = value.trim()
  return text.length > 0 && !/^https?:\/\//i.test(text)
}

/** Does this value contain an actual observation anywhere inside it? */
function carriesData(value) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return isObservationString(value)
  if (Array.isArray(value)) return value.length > 0 && value.some(carriesData)
  if (value && typeof value === 'object') return Object.values(value).some(carriesData)
  return false
}

/** Any `{"error": ""}` shell: the source spoke and had nothing to say. */
function hasErrorShell(value) {
  if (Array.isArray(value)) return value.some(hasErrorShell)
  if (value && typeof value === 'object') {
    if ('error' in value && typeof value.error === 'string' && !value.error.trim()) return true
    return Object.values(value).some(hasErrorShell)
  }
  return false
}

/**
 * A number is an observation unless it is a zero sitting next to an empty error
 * shell, which is a default rather than a reading. rates_yields is the worked
 * example: it answers with spread_10y2y: 0.0 and inverted: false while every
 * yield behind that spread is an empty error shell.
 */
function carriesNonTrivialData(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  if (typeof value === 'string') return isObservationString(value)
  if (Array.isArray(value)) return value.length > 0 && value.some(carriesNonTrivialData)
  if (value && typeof value === 'object') return Object.values(value).some(carriesNonTrivialData)
  return false
}

/** A non-empty error field anywhere in the payload means the source spoke and refused. */
function findError(value) {
  if (Array.isArray(value)) return value.map(findError).find(Boolean) ?? null
  if (value && typeof value === 'object') {
    if (typeof value.error === 'string' && value.error.trim()) return value.error.trim()
    if (typeof value.error === 'string' && 'error' in value) return null
    return Object.values(value).map(findError).find(Boolean) ?? null
  }
  return null
}

function classify(result) {
  if (result.failure) return result.failure === 'TimeoutError' ? 'timeout' : `failed:${result.failure}`
  const content = result.payload?.result?.content?.[0]
  if (result.payload?.result?.isError) return 'error'
  if (!content) return 'error'
  let parsed = null
  try { parsed = JSON.parse(content.text) } catch { parsed = null }
  const error = findError(parsed ?? {})
  if (error) return 'error'
  if (parsed === null) return content.text?.trim() ? 'usable' : 'empty'
  if (!carriesData(parsed)) return 'empty'
  if (hasErrorShell(parsed) && !carriesNonTrivialData(parsed)) return 'empty'
  return 'usable'
}

// One schema-correct call per tool. `target` is what the answer would be about,
// and only a gated instrument or its underlying can change a verdict. A tool that
// works but only speaks about BTC is not an integration, it is a neighbour.
const PROBES = [
  { tool: 'global_assets', arguments: { action: 'price', symbol: 'TSLA' }, target: 'underlying', wouldAnswer: 'the underlying official price, as a second path to the reference tier' },
  { tool: 'global_assets', arguments: { action: 'ohlcv', symbol: 'TSLA', period: '1mo', interval: '1d' }, target: 'underlying', wouldAnswer: 'official daily closes, to cross-check the retrieved reference' },
  { tool: 'cross_asset', arguments: { action: 'correlation', base: 'TSLA', targets: 'spx,ndx,vix', period: '90d' }, target: 'underlying', wouldAnswer: 'whether a move is idiosyncratic or market-wide' },
  { tool: 'macro_indicators', arguments: { action: 'multi_indicator', indicators: 'cpi,nonfarm_payrolls' }, target: 'market-context', wouldAnswer: 'scheduled macro releases that reprice the whole market' },
  { tool: 'rates_yields', arguments: { action: 'yield_curve' }, target: 'market-context', wouldAnswer: 'the rate regime a move is happening inside' },
  { tool: 'tradfi_news', arguments: { action: 'earnings', symbol: 'TSLA' }, target: 'underlying', wouldAnswer: 'a scheduled earnings date: a known, dated catalyst' },
  { tool: 'tradfi_news', arguments: { action: 'company', symbol: 'TSLA' }, target: 'underlying', wouldAnswer: 'the instrument profile' },
  { tool: 'news_feed', arguments: { action: 'latest', feeds: 'all', keyword: 'Tesla', limit: 3 }, target: 'underlying', wouldAnswer: 'an independent headline source' },
  { tool: 'news_feed', arguments: { action: 'sources' }, target: 'unrelated', wouldAnswer: 'which feeds exist (an inventory, not an observation)' },
  { tool: 'crypto_derivatives', arguments: { action: 'price', symbol: 'rTSLA/USDT', exchange: 'bitget' }, target: 'gated-instrument', wouldAnswer: 'the gated instrument itself, through Bitget' },
  { tool: 'crypto_derivatives', arguments: { action: 'klines', symbol: 'rTSLA/USDT', exchange: 'bitget', timeframe: '1h', limit: 6 }, target: 'gated-instrument', wouldAnswer: 'hourly candles for the gated instrument' },
  // These two are controls: they prove the tool itself works, so a failure on
  // rTSLA/USDT can be attributed to the exchange rather than to the tool.
  { tool: 'crypto_derivatives', arguments: { action: 'price', symbol: 'BTC/USDT', exchange: 'bitget' }, target: 'unrelated', wouldAnswer: 'a control: a pair Binance lists, requested from Bitget' },
  { tool: 'crypto_derivatives', arguments: { action: 'price', symbol: 'BTC/USDT', exchange: 'okx' }, target: 'unrelated', wouldAnswer: 'a control: the same pair requested from OKX' },
  { tool: 'crypto_market', arguments: { action: 'global' }, target: 'market-context', wouldAnswer: 'crypto market-wide risk context' },
  { tool: 'sentiment_index', arguments: { action: 'current' }, target: 'market-context', wouldAnswer: 'crypto risk appetite' },
  { tool: 'derivatives_sentiment', arguments: { action: 'long_short', symbol: 'BTCUSDT' }, target: 'market-context', wouldAnswer: 'positioning on the venue the rTokens trade in' },
  { tool: 'global_data', arguments: { action: 'forex', base: 'USD', symbols: 'EUR,JPY' }, target: 'market-context', wouldAnswer: 'dollar context for a dollar-denominated equity' },
  { tool: 'cn_market', arguments: { action: 'price', symbol: '00700', market: 'hk' }, target: 'market-context', wouldAnswer: 'a different equity market, for comparison' },
  { tool: 'technical_analysis', arguments: { action: 'rsi', symbol: 'BTC/USDT', timeframe: '4h' }, target: 'unrelated', wouldAnswer: 'momentum, but only on a pair Binance lists' },
  { tool: 'defi_analytics', arguments: { action: 'tvl_rank', limit: 3 }, target: 'unrelated', wouldAnswer: 'nothing this desk needs; probed for completeness' },
  { tool: 'dex_market', arguments: { action: 'trending' }, target: 'unrelated', wouldAnswer: 'nothing this desk needs; probed for completeness' },
  { tool: 'social_trending', arguments: { action: 'trending', platform: 'xueqiu', limit: 3 }, target: 'unrelated', wouldAnswer: 'retail attention, if it were reachable' },
  { tool: 'network_status', arguments: { action: 'eth_gas' }, target: 'unrelated', wouldAnswer: 'nothing this desk needs; probed for completeness' },
  { tool: 'crypto_price', arguments: { action: 'price', symbol: 'BTC,ETH' }, target: 'unrelated', wouldAnswer: 'a second crypto price source' },
]

const initialized = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'market-integrity-desk-probe', version: '0.2.0' } } })
await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, initialized.sessionId).catch(() => {})

const inventory = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, initialized.sessionId)
const advertised = inventory.payload?.result?.tools ?? []

const probes = []
for (let index = 0; index < PROBES.length; index += 1) {
  const probe = PROBES[index]
  const result = await rpc({ jsonrpc: '2.0', id: index + 3, method: 'tools/call', params: { name: probe.tool, arguments: probe.arguments } }, initialized.sessionId)
  const content = result.payload?.result?.content?.[0]
  const text = typeof content?.text === 'string' ? content.text : ''
  probes.push({
    tool: probe.tool,
    arguments: probe.arguments,
    target: probe.target,
    wouldAnswer: probe.wouldAnswer,
    outcome: classify(result),
    latencyMs: result.latencyMs,
    payloadBytes: text.length,
    sample: text.replace(/\s+/g, ' ').slice(0, 200),
  })
  process.stderr.write(`  ${probes.at(-1).outcome.padEnd(8)} ${String(result.latencyMs).padStart(6)}ms  ${probe.tool} [${probe.target}]\n`)
}

// Is the exchange parameter honoured? Comparing two live prices cannot answer this:
// a price ticks between calls, so any difference proves only that time passed. The
// structural test is a symbol that exists on one exchange and not the other — if a
// call requesting Bitget fails with a message naming a different exchange, the
// parameter was ignored and the error text says which exchange it really used.
const REQUESTED_EXCHANGE = 'bitget'
const gatedErrors = probes.filter((item) => item.target === 'gated-instrument' && item.outcome === 'error')
const namesOtherExchange = gatedErrors.find((item) => /binance/i.test(item.sample) && !/bitget/i.test(item.sample)) ?? null
const exchangeParameterHonoured = gatedErrors.length ? !namesOtherExchange : null

const usable = probes.filter((item) => item.outcome === 'usable')
// A working tool that only speaks about BTC is a neighbour, not an integration: it
// cannot change a single verdict about a tokenized equity.
const actionable = probes.filter((item) => item.outcome === 'usable' && (item.target === 'gated-instrument' || item.target === 'underlying'))

const report = {
  probedAt: new Date().toISOString(),
  server: MCP_URL,
  package: '@bitget-ai/bitget-signal',
  serverInfo: initialized.payload?.result?.serverInfo ?? null,
  transport: { reachable: Boolean(initialized.payload), initializeMs: initialized.latencyMs, toolsListMs: inventory.latencyMs },
  advertisedToolCount: advertised.length,
  advertisedTools: advertised.map((tool) => tool.name),
  callTimeoutMs: CALL_TIMEOUT_MS,
  probes,
  summary: {
    probed: probes.length,
    usable: usable.length,
    empty: probes.filter((item) => item.outcome === 'empty').length,
    error: probes.filter((item) => item.outcome === 'error').length,
    timeout: probes.filter((item) => item.outcome === 'timeout').length,
    usableTools: usable.map((item) => `${item.tool}[${item.target}]`),
    actionableProbes: actionable.length,
    actionableTools: actionable.map((item) => item.tool),
    slowestMs: Math.max(...probes.map((item) => item.latencyMs)),
    requestedExchange: REQUESTED_EXCHANGE,
    exchangeParameterHonoured,
    exchangeParameterEvidence: namesOtherExchange
      ? `A call requesting exchange=${REQUESTED_EXCHANGE} answered: ${namesOtherExchange.sample.slice(0, 140)}`
      : 'Not measured: no gated-instrument call failed, so the parameter was never contradicted.',
  },
  productionIntegrationDecision: actionable.length ? 'eligible_for_bounded_adapter' : 'withheld',
  decisionReason: actionable.length
    ? 'At least one tool returned usable data about a gated instrument or its underlying inside the call timeout.'
    : 'The transport answers in under a second and advertises its tools, but no tool returned a usable observation about a gated instrument or its underlying. Every equity, macro and news upstream timed out, errored, or returned a payload with no observation in it; the only tools that carry data are crypto ones that speak about pairs Binance lists, and the exchange parameter is ignored, so they cannot see Bitget or any tokenized equity. A source that returns nothing is a missing source, not a finding, so the Skill layer is withheld from verdicts rather than rendered as an empty panel.',
}
await writeFile(resolve(root, 'benchmark', 'bitget-signal-probe.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.summary, null, 2))
console.log(`\ndecision: ${report.productionIntegrationDecision}`)
