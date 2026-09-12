import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outputDir = resolve(root, 'benchmark')
const baseUrl = process.env.BENCHMARK_BASE_URL || 'https://bitget-market-integrity-desk.vercel.app'
const symbols = ['rNVDAUSDT', 'rAAPLUSDT', 'rTSLAUSDT', 'rQQQUSDT']

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex')
const bps = (token, underlying) => Math.round(((token - underlying) / underlying) * 10_000)

function nearestStock(candle, stockCandles) {
  return stockCandles
    .map((stock) => ({ stock, distance: Math.abs(stock.timestamp - candle.timestamp) }))
    .filter(({ distance }) => distance <= 5 * 60 * 1000)
    .sort((a, b) => a.distance - b.distance)[0]?.stock || null
}

function expectedState(underlying) {
  if (!underlying) return 'UNVERIFIABLE'
  return 'CAUTION'
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response.json()
}

async function collectSource(symbol) {
  return fetchJson(`${baseUrl}/api/benchmark-source?symbol=${encodeURIComponent(symbol)}`)
}

async function investigate(item, label) {
  const evidence = [
    {
      id: 'token',
      title: 'Frozen rToken candle',
      summary: `${item.symbol} closed at ${item.tokenCandle.close} USDT for the five-minute interval ending ${item.cutoff}.`,
      source: 'Bitget UTA v3',
      retrievedAt: item.sourceRetrievedAt,
    },
    {
      id: 'underlying',
      title: 'Frozen Stock+ reference candle',
      summary: item.underlyingCandle
        ? `${item.underlyingSymbol} closed at ${item.underlyingCandle.close} USD for the matched interval.`
        : 'No authenticated Stock+ candle was available in the frozen evidence bundle; alignment cannot be calculated.',
      source: 'Bitget Stock+',
      retrievedAt: item.sourceRetrievedAt,
    },
  ]
  const started = Date.now()
  const response = await fetchJson(`${baseUrl}/api/evidence`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      researchQuestion: `At the ${item.cutoff} cutoff, can ${item.symbol}'s market state be supported by the frozen evidence?`,
      symbol: item.symbol,
      state: label,
      checks: [{
        id: 'alignment',
        title: 'Price alignment',
        state: item.underlyingCandle ? 'caution' : 'unknown',
        result: item.underlyingCandle ? `${bps(item.tokenCandle.close, item.underlyingCandle.close)} bps` : 'UNVERIFIABLE',
        detail: item.underlyingCandle ? 'Calculated from matched closed candles.' : 'Reference candle missing at the cutoff.',
      }],
      evidence,
    }),
  })
  return { ...response, latencyMs: Date.now() - started }
}

await mkdir(outputDir, { recursive: true })
const sourceBundles = await Promise.all(symbols.map(collectSource))
const cases = []
const labels = []

for (const bundle of sourceBundles) {
  for (const tokenCandle of bundle.tokenCandles) {
    const underlyingCandle = nearestStock(tokenCandle, bundle.stockCandles || [])
    const id = `${bundle.instrument.symbol}-${new Date(tokenCandle.timestamp).toISOString()}`
    const item = {
      id,
      symbol: bundle.instrument.symbol,
      underlyingSymbol: bundle.instrument.underlyingSymbol,
      company: bundle.instrument.company,
      cutoff: new Date(tokenCandle.timestamp + 5 * 60 * 1000).toISOString(),
      interval: bundle.interval,
      tokenCandle,
      underlyingCandle,
      stockSourceStatus: bundle.stockSource.status,
      sourceRetrievedAt: bundle.capturedAt,
      sources: [bundle.tokenSource, bundle.stockSource],
    }
    cases.push({ ...item, sha256: digest(item) })
    labels.push({ id, expectedState: expectedState(underlyingCandle), rationale: underlyingCandle ? 'Matched sources exist; unobserved corporate-action and depth checks keep the overall state at CAUTION.' : 'A required Stock+ reference is absent, so alignment must remain UNVERIFIABLE.' })
  }
}

if (cases.length < 12 || cases.length > 20) throw new Error(`Expected 12-20 cases, received ${cases.length}`)

const labelById = new Map(labels.map((item) => [item.id, item.expectedState]))
const qwenOutputs = []
for (let offset = 0; offset < cases.length; offset += 4) {
  const batch = cases.slice(offset, offset + 4)
  const outputs = await Promise.all(batch.map(async (item) => {
    try { return { id: item.id, ...(await investigate(item, labelById.get(item.id))) } }
    catch (error) { return { id: item.id, available: false, reason: error instanceof Error ? error.message : 'Unknown investigator error', latencyMs: null } }
  }))
  qwenOutputs.push(...outputs)
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  caseCount: cases.length,
  instruments: symbols,
  interval: '5m',
  cutoffDefinition: 'The end of a fully closed five-minute rToken candle.',
  evidencePolicy: 'Only evidence timestamped at or before the cutoff is included. Labels are stored separately.',
  sourceBaseUrl: baseUrl,
}

await Promise.all([
  writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile(resolve(outputDir, 'cases.json'), `${JSON.stringify(cases, null, 2)}\n`),
  writeFile(resolve(outputDir, 'labels.json'), `${JSON.stringify(labels, null, 2)}\n`),
  writeFile(resolve(outputDir, 'qwen-outputs.json'), `${JSON.stringify(qwenOutputs, null, 2)}\n`),
])

console.log(`Captured ${cases.length} frozen cases in ${outputDir}`)
