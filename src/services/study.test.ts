import { afterEach, describe, expect, it, vi } from 'vitest'
import { runStudy } from './study'

afterEach(() => vi.unstubAllGlobals())
describe('historical study rerun contract', () => {
  it('preserves the saved example exclusion along with drift and observation stage', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: true, coverage: { episodes: 10 }, lookback: { candles: 500 } }) })
    vi.stubGlobal('fetch', fetcher)
    await runStudy('rNVDAUSDT', 184, undefined, { stageHours: 18, excludedAnchorMs: 1790708400000 })
    const query = new URL(String(fetcher.mock.calls[0][0]), 'https://example.test').searchParams
    expect(query.get('driftBps')).toBe('184')
    expect(query.get('stageHours')).toBe('18')
    expect(query.get('excludedAnchorMs')).toBe('1790708400000')
  })
  it('does not serialize null or non-finite exclusion metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: false }) })
    vi.stubGlobal('fetch', fetcher)
    await runStudy('rNVDAUSDT', undefined, undefined, { excludedAnchorMs: Infinity })
    expect(String(fetcher.mock.calls[0][0])).not.toContain('excludedAnchorMs')
  })
})
