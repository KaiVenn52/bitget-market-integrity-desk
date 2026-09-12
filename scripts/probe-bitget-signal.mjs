import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MCP_URL = 'https://datahub.noxiaohao.com/mcp'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseSse(text) {
  const records = text.split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)))
  return records.at(-1)
}

async function rpc(body, sessionId, timeoutMs = 25_000) {
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
  return { sessionId: response.headers.get('mcp-session-id') || sessionId, payload: parseSse(text) }
}

const initialized = await rpc({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'market-integrity-desk-probe', version: '0.1.0' } },
})

const probes = [
  { name: 'global_assets', arguments: { action: 'price', symbol: 'AAPL' } },
  { name: 'news_feed', arguments: { action: 'latest', feeds: 'cnbc,techcrunch', keyword: 'Apple', limit: 3 } },
]

const results = []
for (let index = 0; index < probes.length; index += 1) {
  const started = Date.now()
  try {
    const result = await rpc({ jsonrpc: '2.0', id: index + 2, method: 'tools/call', params: probes[index] }, initialized.sessionId)
    results.push({ tool: probes[index].name, latencyMs: Date.now() - started, result: result.payload?.result || result.payload?.error || null })
  } catch (error) {
    results.push({ tool: probes[index].name, latencyMs: Date.now() - started, error: error instanceof Error ? error.name : 'UnknownError' })
  }
}

const useful = results.filter((item) => {
  const content = item.result?.content?.[0]
  if (!content || item.result?.isError) return false
  try {
    const parsed = JSON.parse(content.text)
    if (Array.isArray(parsed)) return parsed.some((entry) => Array.isArray(entry.items) && entry.items.length)
    if (parsed && typeof parsed === 'object') return Object.values(parsed).some((value) => value && typeof value === 'object' && !value.error)
  } catch { return Boolean(content.text?.trim()) }
  return false
})
const report = {
  probedAt: new Date().toISOString(),
  server: MCP_URL,
  package: '@bitget-ai/bitget-signal',
  probes: results,
  usableProbeCount: useful.length,
  productionIntegrationDecision: useful.length === results.length ? 'eligible_for_bounded_adapter' : 'withheld',
  decisionReason: useful.length === results.length
    ? 'All requested tools returned usable source data inside the probe timeout.'
    : 'At least one required tool timed out, errored, or returned no usable source data. The live desk remains unchanged to protect latency and evidence quality.',
}
await writeFile(resolve(root, 'benchmark', 'bitget-signal-probe.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
