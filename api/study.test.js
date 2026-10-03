import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./_lib/sources.js', async (original) => {
  const actual = await original()
  return { ...actual, fetchCandles: vi.fn(), fetchDailyCloses: vi.fn() }
})
import { fetchCandles, fetchDailyCloses } from './_lib/sources.js'
import handler from './study.js'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-17T15:00:00Z'))
  // Controlled contract fixture, not historical market evidence.
  const start = Date.parse('2026-09-14T00:00:00Z')
  fetchCandles.mockResolvedValue({ data: Array.from({ length: 88 }, (_, index) => {
    const timestamp = start + index * 3_600_000
    const hour = new Date(timestamp).getUTCHours()
    const price = hour >= 20 || hour < 14 ? 101 : 100
    return [timestamp, price, price, price, price, 1000, 100000]
  }) })
  fetchDailyCloses.mockResolvedValue({ closes: [], note: 'Controlled fixture has no underlying data.' })
})
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
async function query(parameters = {}) {
  const response = { code: 200, status(code) { this.code = code; return this }, json(body) { this.body = body; return body } }
  await handler({ method: 'GET', query: { symbol: 'rNVDAUSDT', ...parameters } }, response)
  return response
}
describe('study endpoint saved-example exclusion', () => {
  it('keeps the example out of its own sample after a same-target rerun', async () => {
    const initial = (await query()).body
    expect(initial.target.source).toBe('most recent closed-market episode')
    expect(initial.target.excludedAnchorMs).toBeTypeOf('number')
    const rerun = (await query({ driftBps: String(initial.target.driftBps), stageHours: String(initial.target.stageHours), excludedAnchorMs: String(initial.target.excludedAnchorMs) })).body
    expect(rerun.target.excludedAnchorMs).toBe(initial.target.excludedAnchorMs)
    expect(rerun.matched.map(row => row.anchorMs)).not.toContain(initial.target.excludedAnchorMs)
    expect(rerun.matched.length).toBe(initial.matched.length)
    expect(rerun.target.context).toContain('still excluded')
  })
  it('refuses an expired or fabricated exclusion instead of silently changing the sample', async () => {
    const result = await query({ driftBps: '100', excludedAnchorMs: '123' })
    expect(result.code).toBe(400)
    expect(result.body.error).toContain('no longer in the retrieved resolved history')
  })
})
