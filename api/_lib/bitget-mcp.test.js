import { afterEach, describe, expect, it, vi } from 'vitest'
import { mcpQueryMany, parseMcpBody, providerOf, resultsOf, unwrapToolResult } from './bitget-mcp.js'

afterEach(() => { vi.unstubAllGlobals() })

describe('parseMcpBody', () => {
  it('parses a bare JSON body', () => {
    expect(parseMcpBody('{"jsonrpc":"2.0","id":1,"result":{}}')).toEqual({ jsonrpc: '2.0', id: 1, result: {} })
  })

  it('parses the JSON-RPC payload out of an SSE stream', () => {
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n\n'
    expect(parseMcpBody(sse)).toEqual({ jsonrpc: '2.0', id: 2, result: { ok: true } })
  })

  it('skips a [DONE] sentinel and keeps scanning', () => {
    const sse = 'data: [DONE]\ndata: {"jsonrpc":"2.0","id":3,"result":{"n":3}}\n'
    expect(parseMcpBody(sse)).toEqual({ jsonrpc: '2.0', id: 3, result: { n: 3 } })
  })

  // An empty or unparseable body is how a dead session shows up. Returning null
  // lets the caller record a failed source instead of throwing mid-scan.
  it('returns null for an empty body', () => {
    expect(parseMcpBody('')).toBeNull()
    expect(parseMcpBody('   \n  ')).toBeNull()
  })

  it('returns null for a body that carries no JSON', () => {
    expect(parseMcpBody('<html>502 Bad Gateway</html>')).toBeNull()
    expect(parseMcpBody('data: not-json\n')).toBeNull()
  })
})

describe('unwrapToolResult', () => {
  it('prefers structuredContent', () => {
    const message = { result: { structuredContent: { entries: [1] }, content: [{ type: 'text', text: '{"entries":[2]}' }] } }
    expect(unwrapToolResult(message)).toEqual({ entries: [1] })
  })

  it('falls back to the text part when structuredContent is absent', () => {
    const message = { result: { content: [{ type: 'text', text: '{"entries":[2]}' }] } }
    expect(unwrapToolResult(message)).toEqual({ entries: [2] })
  })

  it('returns null when the tool reported an error', () => {
    expect(unwrapToolResult({ result: { isError: true, structuredContent: { a: 1 } } })).toBeNull()
  })

  it('returns null when there is no result', () => {
    expect(unwrapToolResult({ error: { message: 'nope' } })).toBeNull()
    expect(unwrapToolResult(null)).toBeNull()
  })
})

describe('result accessors', () => {
  it('reads the results array', () => {
    expect(resultsOf({ data: { results: [{ a: 1 }] } })).toEqual([{ a: 1 }])
  })

  it('returns an empty array rather than undefined when nothing came back', () => {
    expect(resultsOf({ data: {} })).toEqual([])
    expect(resultsOf(undefined)).toEqual([])
  })

  it('reports the upstream vendor that answered', () => {
    expect(providerOf({ data: { provider: 'massive' } })).toBe('massive')
    expect(providerOf({ data: {} })).toBeNull()
  })
})

/** A fetch stub that answers each JSON-RPC method from a scripted queue. */
function stubFetch(handler) {
  const calls = []
  vi.stubGlobal('fetch', async (url, init) => {
    const body = init.method === 'DELETE'
      ? { method: '__delete__', sessionId: init.headers['mcp-session-id'] }
      : JSON.parse(init.body)
    calls.push(body)
    if (init.method === 'DELETE') return { ok: true, status: 200 }
    return handler(body, calls.length)
  })
  return calls
}

const jsonResponse = (payload, headers = {}) => ({
  ok: true,
  status: 200,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  text: async () => JSON.stringify(payload),
})

describe('mcpQueryMany', () => {
  it('initializes once and then issues entries one at a time', async () => {
    const order = []
    const calls = stubFetch((body) => {
      if (body.method === 'initialize') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { serverInfo: { name: 'bitget-mcp-server', version: '4.0.3' } } }, { 'mcp-session-id': 'sess-1' })
      }
      if (body.method === 'notifications/initialized') return { ok: true, status: 202, headers: { get: () => null }, text: async () => '' }
      order.push(body.params.arguments.entry_id)
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { structuredContent: { success: true, data: { provider: 'massive', results: [1] } } } })
    })

    const result = await mcpQueryMany([
      { id: 'a', entryId: 'equity_price_quote', params: { symbol: 'NVDA' } },
      { id: 'b', entryId: 'equity_calendar_earnings', params: { symbol: 'NVDA' } },
    ])

    expect(result.server).toEqual({ name: 'bitget-mcp-server', version: '4.0.3' })
    expect(result.entries.a.ok).toBe(true)
    expect(result.entries.b.ok).toBe(true)
    // Serial dispatch is the behaviour the live server supports: concurrent calls
    // on one session hung until timeout while a single one answered in 233ms.
    expect(order).toEqual(['equity_price_quote', 'equity_calendar_earnings'])
    // The session established by `initialize` must be reused, not re-negotiated.
    expect(calls.filter((call) => call.method === 'initialize')).toHaveLength(1)
    expect(calls.filter((call) => call.method === '__delete__')).toEqual([{ method: '__delete__', sessionId: 'sess-1' }])
    expect(calls.at(-1).method).toBe('__delete__')
  })

  it('does not attach an id to a notification', async () => {
    const calls = stubFetch((body) => (body.method === 'initialize'
      ? jsonResponse({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 's', version: '1' } } }, { 'mcp-session-id': 'x' })
      : { ok: true, status: 202, headers: { get: () => null }, text: async () => '' }))

    await mcpQueryMany([{ id: 'a', entryId: 'e', params: {} }])
    const notification = calls.find((call) => call.method === 'notifications/initialized')
    expect(notification).toBeDefined()
    expect('id' in notification).toBe(false)
  })

  it('reports every entry as failed when initialize fails, without issuing them', async () => {
    const calls = stubFetch(() => ({ ok: false, status: 502, headers: { get: () => null }, text: async () => 'bad gateway' }))
    const result = await mcpQueryMany([{ id: 'a', entryId: 'e1', params: {} }, { id: 'b', entryId: 'e2', params: {} }])
    expect(result.server).toBeNull()
    expect(result.entries.a.ok).toBe(false)
    expect(result.entries.b.ok).toBe(false)
    expect(result.entries.a.error).toMatch(/initialize failed/)
    // Two handshake attempts, and no entry issued behind a dead session.
    expect(calls.filter((call) => call.method === 'initialize')).toHaveLength(2)
    expect(calls.filter((call) => call.method === 'tools/call')).toHaveLength(0)
    expect(calls.filter((call) => call.method === '__delete__')).toHaveLength(0)
  })

  // A cold CDN handshake was the observed cause of an all-sources-missing scan.
  it('retries the handshake once and recovers', async () => {
    let attempts = 0
    stubFetch((body) => {
      if (body.method === 'initialize') {
        attempts += 1
        if (attempts === 1) return { ok: false, status: 0, headers: { get: () => null }, text: async () => '' }
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { serverInfo: { name: 's', version: '1' } } }, { 'mcp-session-id': 'x' })
      }
      if (body.method === 'notifications/initialized') return { ok: true, status: 202, headers: { get: () => null }, text: async () => '' }
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { structuredContent: { success: true, data: { results: [1] } } } })
    })

    const result = await mcpQueryMany([{ id: 'a', entryId: 'e', params: {} }])
    expect(attempts).toBe(2)
    expect(result.entries.a.ok).toBe(true)
  })

  it('marks the platform-reported failure inside a successful frame as a failure', async () => {
    stubFetch((body) => (body.method === 'initialize'
      ? jsonResponse({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 's', version: '1' } } }, { 'mcp-session-id': 'x' })
      : body.method === 'notifications/initialized'
        ? { ok: true, status: 202, headers: { get: () => null }, text: async () => '' }
        : jsonResponse({ jsonrpc: '2.0', id: body.id, result: { structuredContent: { success: false, error: { message: 'symbol not found' } } } })))

    const result = await mcpQueryMany([{ id: 'a', entryId: 'e', params: {} }])
    expect(result.entries.a.ok).toBe(false)
    expect(result.entries.a.error).toBe('symbol not found')
  })

  it('preserves a string-valued platform failure and still releases the session', async () => {
    const calls = stubFetch((body) => (body.method === 'initialize'
      ? jsonResponse({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 's' } } }, { 'mcp-session-id': 'failed-entry' })
      : body.method === 'notifications/initialized'
        ? { ok: true, status: 202, headers: { get: () => null }, text: async () => '' }
        : jsonResponse({ jsonrpc: '2.0', id: body.id, result: { structuredContent: { success: false, error: 'upstream unavailable' } } })))
    const result = await mcpQueryMany([{ id: 'a', entryId: 'e' }])
    expect(result.entries.a.error).toBe('upstream unavailable')
    expect(calls.at(-1)).toEqual({ method: '__delete__', sessionId: 'failed-entry' })
  })

  it('retains the server error message on non-2xx responses', async () => {
    stubFetch(() => ({
      ok: false, status: 503,
      headers: { get: () => null },
      text: async () => '{"jsonrpc":"2.0","error":{"message":"Too many open sessions"}}',
    }))
    const result = await mcpQueryMany([{ id: 'a', entryId: 'e' }])
    expect(result.entries.a.error).toContain('HTTP 503: Too many open sessions')
  })

  it('releases a session minted by a failed handshake before retrying', async () => {
    let attempts = 0
    const calls = stubFetch((body) => {
      if (body.method === 'initialize') {
        attempts += 1
        return attempts === 1
          ? { ok: false, status: 503, headers: { get: () => 'abandoned-session' }, text: async () => '{}' }
          : jsonResponse({ jsonrpc: '2.0', id: body.id, result: { serverInfo: { name: 's' } } }, { 'mcp-session-id': 'active-session' })
      }
      if (body.method === 'notifications/initialized') return { ok: true, status: 202, headers: { get: () => null }, text: async () => '' }
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { structuredContent: { success: true, data: { results: [1] } } } })
    })
    const result = await mcpQueryMany([{ id: 'a', entryId: 'e' }])
    expect(result.entries.a.ok).toBe(true)
    expect(calls.filter((call) => call.method === '__delete__')).toEqual([
      { method: '__delete__', sessionId: 'abandoned-session' },
      { method: '__delete__', sessionId: 'active-session' },
    ])
  })

  it('skips remaining entries once the shared budget is spent', async () => {
    stubFetch((body) => (body.method === 'initialize'
      ? jsonResponse({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 's', version: '1' } } }, { 'mcp-session-id': 'x' })
      : body.method === 'notifications/initialized'
        ? { ok: true, status: 202, headers: { get: () => null }, text: async () => '' }
        : jsonResponse({ jsonrpc: '2.0', id: body.id, result: { structuredContent: { success: true, data: { results: [] } } } })))

    // A zero budget cannot cover the handshake either, so everything is reported
    // rather than silently dropped.
    const result = await mcpQueryMany([{ id: 'a', entryId: 'e1', params: {} }], { budgetMs: 0 })
    expect(result.entries.a.ok).toBe(false)
    expect(result.entries.a.error).toMatch(/initialize failed|skipped/)
  })

  it('returns an empty result for an empty query list', async () => {
    const calls = stubFetch(() => jsonResponse({}))
    const result = await mcpQueryMany([])
    expect(result).toEqual({ server: null, entries: {} })
    expect(calls).toHaveLength(0)
  })
})
