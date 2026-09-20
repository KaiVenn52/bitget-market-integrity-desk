import { describe, expect, it } from 'vitest'
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, clientKey, rateLimit } from './ratelimit.js'

// Each test gets its own store, because the production one is module-level.
const fresh = () => new Map()
const at = (seconds) => 1_700_000_000_000 + seconds * 1000

describe('public endpoint budget', () => {
  it('allows a burst up to the limit and refuses the next request', () => {
    const store = fresh()
    for (let index = 0; index < RATE_LIMIT_MAX; index += 1) {
      expect(rateLimit('1.2.3.4', at(0), { store }).allowed).toBe(true)
    }
    const refused = rateLimit('1.2.3.4', at(0), { store })
    expect(refused.allowed).toBe(false)
    expect(refused.remaining).toBe(0)
    expect(refused.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('counts each client separately so one caller cannot exhaust the desk', () => {
    const store = fresh()
    for (let index = 0; index < RATE_LIMIT_MAX + 3; index += 1) rateLimit('noisy', at(0), { store })
    expect(rateLimit('noisy', at(0), { store }).allowed).toBe(false)
    expect(rateLimit('quiet', at(0), { store }).allowed).toBe(true)
  })

  it('forgets the window so a client recovers instead of being banned forever', () => {
    const store = fresh()
    for (let index = 0; index < RATE_LIMIT_MAX + 1; index += 1) rateLimit('1.2.3.4', at(0), { store })
    expect(rateLimit('1.2.3.4', at(0), { store }).allowed).toBe(false)
    expect(rateLimit('1.2.3.4', at(RATE_LIMIT_WINDOW_MS / 1000), { store }).allowed).toBe(true)
  })

  it('reports how long to wait rather than just refusing', () => {
    const store = fresh()
    for (let index = 0; index < RATE_LIMIT_MAX; index += 1) rateLimit('1.2.3.4', at(0), { store })
    const refused = rateLimit('1.2.3.4', at(30), { store })
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSeconds).toBe(30)
  })

  it('bounds the store so an attacker cannot grow it without limit', () => {
    const store = fresh()
    for (let index = 0; index < 50; index += 1) rateLimit(`client-${index}`, at(0), { store, maxKeys: 10 })
    expect(store.size).toBeLessThanOrEqual(11)
  })

  it('identifies a client by the forwarded address, then the socket', () => {
    expect(clientKey({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' })).toBe('9.9.9.9')
    expect(clientKey({ 'x-real-ip': '8.8.8.8' })).toBe('8.8.8.8')
    expect(clientKey({}, { remoteAddress: '7.7.7.7' })).toBe('7.7.7.7')
    expect(clientKey({})).toBe('unknown')
  })
})
