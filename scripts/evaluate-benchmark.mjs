import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = resolve(root, 'benchmark')
const [manifest, cases, labels, qwenOutputs] = await Promise.all([
  readFile(resolve(dir, 'manifest.json'), 'utf8').then(JSON.parse),
  readFile(resolve(dir, 'cases.json'), 'utf8').then(JSON.parse),
  readFile(resolve(dir, 'labels.json'), 'utf8').then(JSON.parse),
  readFile(resolve(dir, 'qwen-outputs.json'), 'utf8').then(JSON.parse),
])

const labelsById = new Map(labels.map((item) => [item.id, item]))
const qwenById = new Map(qwenOutputs.map((item) => [item.id, item]))
const directionPattern = /\b(buy|sell|long|short|bullish|bearish|will rise|will fall)\b/i
const abstentionPattern = /\b(unavailable|missing|cannot|unverifiable|not available|insufficient)\b/i

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex')
const hasUniqueIds = (items) => new Set(items.map((item) => item.id)).size === items.length
const sameIds = (left, right) => left.length === right.length && left.every((id) => right.includes(id))
const validCandle = (candle) => {
  const values = ['open', 'high', 'low', 'close'].map((field) => Number(candle?.[field]))
  if (!values.every(Number.isFinite)) return false
  const [open, high, low, close] = values
  return high >= Math.max(open, close, low) && low <= Math.min(open, close, high) && Number.isFinite(Number(candle.timestamp))
}

const caseIds = cases.map((item) => item.id)
const labelIds = labels.map((item) => item.id)
const qwenIds = qwenOutputs.map((item) => item.id)
if (!hasUniqueIds(cases) || !hasUniqueIds(labels) || !hasUniqueIds(qwenOutputs)) throw new Error('Benchmark IDs must be unique')
if (!sameIds(caseIds, labelIds) || !sameIds(caseIds, qwenIds)) throw new Error('Cases, labels, and Qwen outputs must cover the same IDs')

const rows = cases.map((item) => {
  const gold = labelsById.get(item.id)
  const qwen = qwenById.get(item.id)
  const predictedState = item.underlyingCandle ? 'CAUTION' : 'UNVERIFIABLE'
  const { sha256, ...unsigned } = item
  const digestValid = digest(unsigned) === sha256
  const cutoffValid = new Date(item.cutoff).getTime() === Number(item.tokenCandle?.timestamp) + 5 * 60 * 1000
  const candlesValid = validCandle(item.tokenCandle) && (!item.underlyingCandle || validCandle(item.underlyingCandle))
  const suppliedIds = new Set(['token', 'underlying'])
  const citationValid = Boolean(qwen?.available && qwen.evidenceIds?.length && qwen.evidenceIds.every((id) => suppliedIds.has(id)))
  const abstentionValid = Boolean(qwen?.available && abstentionPattern.test(qwen.brief || ''))
  const directionalClaim = Boolean(qwen?.available && directionPattern.test(qwen.brief || ''))
  return {
    id: item.id,
    symbol: item.symbol,
    cutoff: item.cutoff,
    expectedState: gold.expectedState,
    predictedState,
    stateCorrect: predictedState === gold.expectedState,
    qwenAvailable: Boolean(qwen?.available),
    citationValid,
    abstentionValid,
    directionalClaim,
    digestValid,
    cutoffValid,
    candlesValid,
    latencyMs: qwen?.latencyMs ?? null,
  }
})

const ratio = (count, total) => total ? Number((count / total).toFixed(4)) : null
const available = rows.filter((row) => row.qwenAvailable)
const abstentions = rows.filter((row) => row.predictedState === 'UNVERIFIABLE')
const latencies = available.map((row) => row.latencyMs).filter(Number.isFinite).sort((a, b) => a - b)
const middle = Math.floor(latencies.length / 2)
const median = latencies.length
  ? (latencies.length % 2 ? latencies[middle] : Math.round((latencies[middle - 1] + latencies[middle]) / 2))
  : null

const results = {
  schemaVersion: 1,
  evaluatedAt: new Date().toISOString(),
  datasetGeneratedAt: manifest.generatedAt,
  caseCount: rows.length,
  coverage: {
    instruments: [...new Set(rows.map((row) => row.symbol))].length,
    underlyingAvailableCases: cases.filter((item) => item.underlyingCandle).length,
    underlyingMissingCases: cases.filter((item) => !item.underlyingCandle).length,
  },
  metrics: {
    deterministicStateAccuracy: ratio(rows.filter((row) => row.stateCorrect).length, rows.length),
    abstentionPrecision: ratio(abstentions.filter((row) => row.stateCorrect).length, abstentions.length),
    qwenAvailabilityRate: ratio(available.length, rows.length),
    citationValidityRate: ratio(available.filter((row) => row.citationValid).length, available.length),
    boundedAbstentionRate: ratio(available.filter((row) => row.abstentionValid).length, available.length),
    directionalClaimRate: ratio(available.filter((row) => row.directionalClaim).length, available.length),
    evidenceDigestValidityRate: ratio(rows.filter((row) => row.digestValid).length, rows.length),
    cutoffValidityRate: ratio(rows.filter((row) => row.cutoffValid).length, rows.length),
    ohlcValidityRate: ratio(rows.filter((row) => row.candlesValid).length, rows.length),
    medianQwenLatencyMs: median,
  },
  caveats: [
    'This first benchmark slice measures missing-reference abstention, citation integrity, and runtime availability; it does not estimate trading performance.',
    'If Stock+ credentials are absent, all cases share the UNVERIFIABLE gold label. Add authenticated matched Stock+ candles before treating state accuracy as a balanced classification metric.',
    'Directional-claim detection is a bounded lexical guard, not a semantic hallucination evaluator.',
  ],
  rows,
}

if (results.metrics.evidenceDigestValidityRate !== 1 || results.metrics.cutoffValidityRate !== 1 || results.metrics.ohlcValidityRate !== 1) {
  throw new Error('Benchmark integrity validation failed')
}

await writeFile(resolve(dir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)
console.log(JSON.stringify(results.metrics, null, 2))
