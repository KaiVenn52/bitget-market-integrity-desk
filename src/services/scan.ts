import { snapshotFor } from '../data/snapshots'
import type { Passport } from '../types'

const TIMEOUT_MS = 5500

async function enrichWithInvestigator(passport: Passport): Promise<Passport> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch('/api/evidence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol: passport.instrument.symbol,
        state: passport.state,
        checks: passport.checks.map(({ id, title, state, result, detail }) => ({ id, title, state, result, detail })),
        evidence: passport.evidence.map(({ id, title, summary, source, retrievedAt }) => ({ id, title, summary, source, retrievedAt })),
      }),
      signal: controller.signal,
    })
    if (!response.ok) return passport
    const data = (await response.json()) as { brief?: string }
    if (!data.brief) return passport
    return { ...passport, brief: data.brief, reasoningMode: 'qwen' }
  } catch {
    return passport
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function runScan(symbol: string): Promise<Passport> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`/api/scan?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Scan API returned ${response.status}`)
    return await enrichWithInvestigator((await response.json()) as Passport)
  } catch {
    await new Promise((resolve) => window.setTimeout(resolve, 480))
    return await enrichWithInvestigator(snapshotFor(symbol))
  } finally {
    window.clearTimeout(timeout)
  }
}
