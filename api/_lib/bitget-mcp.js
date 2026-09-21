/**
 * Bitget MCP client (`bitget-mcp-server`).
 *
 * The official S2 handbook points AI Trading Desk entries at
 * `https://agent.bitget.com/mcp` for US stock / ETF research data, and the
 * server needs no account or API key. It exposes exactly two tools:
 *
 *   guide    - list the data catalog (categories -> entries)
 *   do_query - execute one catalog entry by id
 *
 * Transport is streamable HTTP. A POST answers either with a bare JSON body or
 * with an SSE stream whose `data:` lines carry the JSON-RPC payload; which one
 * arrives is the server's choice, so both are parsed here.
 *
 * Everything in this module degrades instead of throwing. A research desk that
 * cannot reach one perception source must still answer, and must say which
 * source was missing rather than silently dropping the claim that depended on it.
 */

export const MCP_URL = process.env.BITGET_MCP_URL || 'https://agent.bitget.com/mcp'
export const MCP_PROTOCOL_VERSION = '2024-11-05'
/** Per-call ceiling. The route's own budget is smaller, so this never dominates it. */
export const MCP_CALL_TIMEOUT_MS = 6000
/**
 * Ceiling for a whole `mcpQueryMany` run, handshake included.
 *
 * Measured against the live server: `initialize` is ~0.4s warm and each entry is
 * 0.2-0.9s when issued one at a time, so four entries normally fit in ~2.5s. The
 * server is behind a CDN and a cold start can push the handshake past a second,
 * which is why the budget is generous relative to the typical case: the observed
 * failure mode was a slow handshake consuming the budget and starving every entry
 * after it, turning a good scan into an all-sources-missing scan.
 */
export const MCP_TOTAL_BUDGET_MS = 7000
/** A cold handshake is worth one retry before the perception layer is given up on. */
export const MCP_INITIALIZE_ATTEMPTS = 2

/**
 * Pull the JSON-RPC payload out of whichever body shape the server returned.
 * @returns the parsed message, or null when nothing parseable was present.
 */
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
    try { return JSON.parse(payload) } catch { /* keep scanning */ }
  }
  return null
}

/**
 * Unwrap a `tools/call` result into the catalog entry's own payload.
 *
 * The server nests the real answer as a JSON *string* inside `content[0].text`,
 * and repeats it in `structuredContent`. `structuredContent` is preferred
 * because it needs no second parse; the text copy is the fallback for any entry
 * that only fills one of the two.
 */
export function unwrapToolResult(message) {
  const result = message?.result
  if (!result) return null
  if (result.isError) return null
  if (result.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent
  const text = result.content?.find?.((part) => part?.type === 'text')?.text
  if (typeof text !== 'string') return null
  try { return JSON.parse(text) } catch { return null }
}

/**
 * One JSON-RPC exchange. Never throws: a timeout, a transport error, a non-2xx
 * status and an unparseable body all come back as `{ ok: false }` with a reason.
 */
async function rpc(method, params, sessionId, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
    if (sessionId) headers['mcp-session-id'] = sessionId
    const body = { jsonrpc: '2.0', method, params }
    // A JSON-RPC notification must not carry an id, and expects no reply.
    if (!method.startsWith('notifications/')) body.id = 1
    const response = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
    const nextSession = response.headers.get('mcp-session-id') || sessionId
    const text = await response.text()
    const ms = Date.now() - started
    if (!response.ok) return { ok: false, sessionId: nextSession, ms, error: `HTTP ${response.status}` }
    const message = parseMcpBody(text)
    if (!message) return { ok: false, sessionId: nextSession, ms, error: 'unparseable response body' }
    if (message.error) return { ok: false, sessionId: nextSession, ms, error: message.error.message || 'JSON-RPC error' }
    return { ok: true, sessionId: nextSession, ms, message }
  } catch (error) {
    return { ok: false, sessionId, ms: Date.now() - started, error: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Run several catalog entries against a single MCP session.
 *
 * One `initialize` serves every entry, and the entries are then issued **one at a
 * time**. That is not a stylistic choice: against the live server, dispatching
 * four entries concurrently on one session left three of them hanging until their
 * timeout while a single one answered in 233ms, and the one that did answer came
 * back from a different upstream provider than the same entry returns when asked
 * sequentially. Serial dispatch is the behaviour the server actually supports.
 *
 * The budget is shared: once it is spent, the remaining entries are reported as
 * skipped rather than issued, so a slow source degrades the evidence set instead
 * of the whole route.
 *
 * @param queries - `[{ id, entryId, params }]`
 * @returns `{ server, entries: { [id]: { ok, data, error, ms } } }`
 */
export async function mcpQueryMany(queries, options = {}) {
  const timeoutMs = options.timeoutMs ?? MCP_CALL_TIMEOUT_MS
  const budgetMs = options.budgetMs ?? MCP_TOTAL_BUDGET_MS
  const deadline = Date.now() + budgetMs
  const entries = {}
  const list = (queries ?? []).filter((query) => query?.id && query?.entryId)
  if (!list.length) return { server: null, entries }

  const remaining = () => Math.max(0, deadline - Date.now())
  let init = null
  for (let attempt = 1; attempt <= MCP_INITIALIZE_ATTEMPTS; attempt += 1) {
    const left = remaining()
    if (left <= 0) break
    init = await rpc('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'bitget-market-integrity-desk', version: '1.0.0' },
    }, null, Math.min(timeoutMs, left))
    if (init.ok) break
  }

  if (!init?.ok) {
    for (const query of list) entries[query.id] = { ok: false, error: `MCP initialize failed: ${init?.error ?? 'budget exhausted'}`, ms: init?.ms ?? 0 }
    return { server: null, entries }
  }

  const server = init.message?.result?.serverInfo ?? null
  const sessionId = init.sessionId

  // Best-effort handshake completion: a notification, so a failure here is not
  // fatal and must not be allowed to reject the queries that follow.
  await rpc('notifications/initialized', {}, sessionId, Math.min(timeoutMs, remaining() || timeoutMs)).catch(() => {})

  for (const query of list) {
    const left = remaining()
    if (left <= 0) {
      entries[query.id] = { ok: false, error: 'skipped: shared MCP budget exhausted', ms: 0, skipped: true }
      continue
    }
    const call = await rpc('tools/call', { name: 'do_query', arguments: { entry_id: query.entryId, params: query.params ?? {} } }, sessionId, Math.min(timeoutMs, left))
    if (!call.ok) {
      entries[query.id] = { ok: false, error: call.error, ms: call.ms }
      continue
    }
    const payload = unwrapToolResult(call.message)
    if (!payload) {
      entries[query.id] = { ok: false, error: 'entry returned no payload', ms: call.ms }
      continue
    }
    // The platform reports its own failures inside a successful JSON-RPC frame.
    if (payload.success === false || payload.error) {
      entries[query.id] = { ok: false, error: payload.error?.message ?? 'platform reported failure', ms: call.ms }
      continue
    }
    entries[query.id] = { ok: true, data: payload.data ?? payload, ms: call.ms }
  }

  return { server, entries }
}

/** The `results` array a catalog entry returns, or `[]` when it returned nothing usable. */
export function resultsOf(entry) {
  const results = entry?.data?.results
  return Array.isArray(results) ? results : []
}

/** The upstream vendor that actually answered, as reported by the platform. */
export function providerOf(entry) {
  return entry?.data?.provider ?? null
}
