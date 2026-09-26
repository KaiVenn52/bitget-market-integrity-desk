/** Bitget's keyless MCP catalog. Every response is evidence, never a certified exchange quote. */
export const MCP_URL = process.env.BITGET_MCP_URL || 'https://agent.bitget.com/mcp'
export const MCP_PROTOCOL_VERSION = '2026-07-28'
export const MCP_CALL_TIMEOUT_MS = 6000
export const MCP_TOTAL_BUDGET_MS = 7000

/** The server can return JSON or a streamable-HTTP SSE frame. */
export function parseMcpBody(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed) } catch { return null }
  }
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try { return JSON.parse(payload) } catch { /* keep looking */ }
  }
  return null
}

export function unwrapToolResult(message) {
  const result = message?.result
  if (!result || result.isError) return null
  if (result.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent
  const value = result.content?.find?.((part) => part?.type === 'text')?.text
  if (typeof value !== 'string') return null
  try { return JSON.parse(value) } catch { return null }
}

/** The current Bitget server advertises only the stateless 2026-07-28 protocol. */
async function rpc(method, params, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      'Mcp-Method': method,
      'Mcp-Name': params.name,
    }
    const body = {
      jsonrpc: '2.0', id: 1, method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
          'io.modelcontextprotocol/clientInfo': { name: 'bitget-market-integrity-desk', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }
    const response = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
    const message = parseMcpBody(await response.text())
    const ms = Date.now() - started
    if (!response.ok) return { ok: false, ms, error: `HTTP ${response.status}${message?.error?.message ? `: ${message.error.message}` : ''}` }
    if (!message) return { ok: false, ms, error: 'unparseable response body' }
    if (message.error) return { ok: false, ms, error: message.error.message || 'JSON-RPC error' }
    return { ok: true, ms, message }
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}

/** Serial, deadline-bounded queries; a failed source never prevents later queries. */
export async function mcpQueryMany(queries, options = {}) {
  const timeoutMs = options.timeoutMs ?? MCP_CALL_TIMEOUT_MS
  const deadline = Date.now() + (options.budgetMs ?? MCP_TOTAL_BUDGET_MS)
  const entries = {}
  const list = (queries ?? []).filter((query) => query?.id && query?.entryId)
  let server = null
  for (const query of list) {
    const left = Math.max(0, deadline - Date.now())
    if (left <= 0) {
      entries[query.id] = { ok: false, error: 'skipped: shared MCP budget exhausted', ms: 0, skipped: true }
      continue
    }
    const call = await rpc('tools/call', {
      name: 'do_query', arguments: { entry_id: query.entryId, params: query.params ?? {} },
    }, Math.min(timeoutMs, left))
    if (!call.ok) {
      entries[query.id] = { ok: false, error: call.error, ms: call.ms }
      continue
    }
    server ??= call.message?.result?._meta?.['io.modelcontextprotocol/serverInfo'] ?? null
    const payload = unwrapToolResult(call.message)
    if (!payload) {
      entries[query.id] = { ok: false, error: 'entry returned no payload', ms: call.ms }
      continue
    }
    if (payload.success === false || payload.error) {
      const status = Number.isInteger(payload.status_code) ? `HTTP ${payload.status_code}` : null
      entries[query.id] = { ok: false, error: typeof payload.error === 'string' ? payload.error : payload.error?.message ?? status ?? 'platform reported failure', ms: call.ms }
      continue
    }
    entries[query.id] = { ok: true, data: payload.data ?? payload, ms: call.ms }
  }
  return { server, entries }
}

export function resultsOf(entry) {
  const results = entry?.data?.results
  return Array.isArray(results) ? results : []
}

export function providerOf(entry) {
  return entry?.data?.provider ?? null
}
