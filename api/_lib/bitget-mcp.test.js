import { afterEach, describe, expect, it, vi } from 'vitest'
import { MCP_PROTOCOL_VERSION, mcpQueryMany, parseMcpBody, providerOf, resultsOf, unwrapToolResult } from './bitget-mcp.js'

afterEach(() => { vi.unstubAllGlobals() })

describe('MCP response parsing', () => {
  it('accepts JSON and SSE, but not empty or invalid bodies', () => {
    expect(parseMcpBody('{"result":1}')).toEqual({ result: 1 })
    expect(parseMcpBody('event: message\ndata: {"result":2}\n\n')).toEqual({ result: 2 })
    expect(parseMcpBody('data: [DONE]\ndata: {"result":3}\n')).toEqual({ result: 3 })
    expect(parseMcpBody('')).toBeNull()
    expect(parseMcpBody('<html>503</html>')).toBeNull()
  })

  it('prefers structured content, falls back to text, and rejects tool errors', () => {
    expect(unwrapToolResult({ result: { structuredContent: { a: 1 }, content: [{ type: 'text', text: '{"a":2}' }] } })).toEqual({ a: 1 })
    expect(unwrapToolResult({ result: { content: [{ type: 'text', text: '{"a":2}' }] } })).toEqual({ a: 2 })
    expect(unwrapToolResult({ result: { isError: true, structuredContent: { a: 1 } } })).toBeNull()
    expect(unwrapToolResult({ error: { message: 'nope' } })).toBeNull()
  })

  it('reads provider and result rows only when present', () => {
    expect(resultsOf({ data: { results: [1] } })).toEqual([1])
    expect(resultsOf({ data: {} })).toEqual([])
    expect(providerOf({ data: { provider: 'massive' } })).toBe('massive')
    expect(providerOf()).toBeNull()
  })
})

const response = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
})

const success = (body, rows = [1]) => response({
  jsonrpc: '2.0', id: body.id,
  result: {
    _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'bitget-mcp-server', version: '4.0.5' } },
    structuredContent: { success: true, data: { provider: 'massive', results: rows } },
  },
})

describe('stateless Bitget MCP queries', () => {
  it('uses the supported protocol envelope and sends entries serially without sessions', async () => {
    const calls = []
    vi.stubGlobal('fetch', async (_url, init) => {
      const body = JSON.parse(init.body)
      calls.push({ method: init.method, headers: init.headers, body })
      return success(body)
    })
    const result = await mcpQueryMany([
      { id: 'quote', entryId: 'equity_price_quote', params: { symbol: 'NVDA' } },
      { id: 'calendar', entryId: 'equity_calendar', params: { symbol: 'NVDA' } },
    ])
    expect(MCP_PROTOCOL_VERSION).toBe('2026-07-28')
    expect(result.server).toEqual({ name: 'bitget-mcp-server', version: '4.0.5' })
    expect(result.entries.quote.ok).toBe(true)
    expect(result.entries.calendar.ok).toBe(true)
    expect(calls.map((call) => call.body.params.arguments.entry_id)).toEqual(['equity_price_quote', 'equity_calendar'])
    for (const call of calls) {
      expect(call.method).toBe('POST')
      expect(call.headers['MCP-Protocol-Version']).toBe('2026-07-28')
      expect(call.headers['Mcp-Method']).toBe('tools/call')
      expect(call.headers['Mcp-Name']).toBe('do_query')
      expect(call.headers['mcp-session-id']).toBeUndefined()
      expect(call.body.params._meta).toEqual({
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'bitget-market-integrity-desk', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      })
    }
  })

  it('continues after one transport failure', async () => {
    let count = 0
    vi.stubGlobal('fetch', async (_url, init) => {
      count += 1
      return count === 1 ? response({ error: { message: 'upstream unavailable' } }, 503) : success(JSON.parse(init.body))
    })
    const result = await mcpQueryMany([{ id: 'a', entryId: 'a' }, { id: 'b', entryId: 'b' }])
    expect(result.entries.a.error).toBe('HTTP 503: upstream unavailable')
    expect(result.entries.b.ok).toBe(true)
  })

  it('preserves the nested provider HTTP status, including a 503 HTML body', async () => {
    vi.stubGlobal('fetch', async (_url, init) => response({
      id: JSON.parse(init.body).id,
      result: { structuredContent: { success: false, status_code: 503, data: '<html>503</html>', error: null } },
    }))
    const result = await mcpQueryMany([{ id: 'a', entryId: 'a' }])
    expect(result.entries.a).toMatchObject({ ok: false, error: 'HTTP 503' })
  })

  it('preserves a provider error message', async () => {
    vi.stubGlobal('fetch', async (_url, init) => response({
      id: JSON.parse(init.body).id,
      result: { structuredContent: { success: false, error: 'unknown entry_id' } },
    }))
    const result = await mcpQueryMany([{ id: 'a', entryId: 'a' }])
    expect(result.entries.a.error).toBe('unknown entry_id')
  })

  it('skips calls after the shared budget and leaves empty lists untouched', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await mcpQueryMany([{ id: 'a', entryId: 'a' }], { budgetMs: 0 })).entries.a.skipped).toBe(true)
    expect(await mcpQueryMany([])).toEqual({ server: null, entries: {} })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
