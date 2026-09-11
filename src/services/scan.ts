import { snapshotFor } from '../data/snapshots'
import type { Passport } from '../types'

const TIMEOUT_MS = 5500
const INVESTIGATOR_TIMEOUT_MS = 28_000

async function enrichWithInvestigator(passport: Passport, researchQuestion: string): Promise<Passport> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), INVESTIGATOR_TIMEOUT_MS)
  try {
    const response = await fetch('/api/evidence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        researchQuestion,
        symbol: passport.instrument.symbol,
        state: passport.state,
        checks: passport.checks.map(({ id, title, state, result, detail }) => ({ id, title, state, result, detail })),
        evidence: passport.evidence.map(({ id, title, summary, source, retrievedAt }) => ({ id, title, summary, source, retrievedAt })),
      }),
      signal: controller.signal,
    })
    if (!response.ok) return { ...passport, researchQuestion, reasoningNote: `Qwen request failed (${response.status}) · deterministic fallback retained` }
    const data = (await response.json()) as { available?: boolean; brief?: string; evidenceIds?: string[]; model?: string; reason?: string }
    if (!data.available || !data.brief) return { ...passport, researchQuestion, reasoningNote: data.reason ?? 'Qwen unavailable · deterministic fallback retained' }
    return {
      ...passport,
      researchQuestion,
      brief: data.brief,
      briefEvidenceIds: data.evidenceIds ?? [],
      reasoningMode: 'qwen',
      reasoningNote: `${data.model ?? 'Qwen'} · evidence citations verified`,
    }
  } catch {
    return { ...passport, researchQuestion, reasoningNote: 'Qwen unreachable · deterministic fallback retained' }
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function runScan(symbol: string, researchQuestion = `Can I trust ${symbol} right now?`): Promise<Passport> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`/api/scan?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Scan API returned ${response.status}`)
    return await enrichWithInvestigator((await response.json()) as Passport, researchQuestion)
  } catch {
    await new Promise((resolve) => window.setTimeout(resolve, 480))
    return await enrichWithInvestigator(snapshotFor(symbol), researchQuestion)
  } finally {
    window.clearTimeout(timeout)
  }
}
