import type { StudyResult } from '../types'

const STUDY_TIMEOUT_MS = 30_000

/**
 * Run the historical stress test for one instrument. Passing `driftBps` tests a
 * specific drift (for example the one the gate just flagged); leaving it out lets
 * the endpoint choose, and it says which choice it made.
 */
export async function runStudy(symbol: string, driftBps?: number, onProgress?: (note: string) => void): Promise<StudyResult | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STUDY_TIMEOUT_MS)
  onProgress?.(`Retrieving closed hourly candles for ${symbol}.`)
  try {
    const query = new URLSearchParams({ symbol })
    if (Number.isFinite(driftBps)) query.set('driftBps', String(Math.round(driftBps as number)))
    const response = await fetch(`/api/study?${query.toString()}`, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!response.ok) {
      onProgress?.(`Stress test endpoint returned HTTP ${response.status}.`)
      return null
    }
    const payload = (await response.json()) as StudyResult
    if (!payload?.available) {
      onProgress?.(payload?.reason ?? 'Stress test unavailable for this instrument.')
      return null
    }
    onProgress?.(`Built ${payload.coverage.episodes} closed-market episodes from ${payload.lookback.candles} hourly candles.`)
    return payload
  } catch (error) {
    onProgress?.(error instanceof Error && error.name === 'AbortError' ? 'Stress test timed out.' : 'Stress test could not reach the desk.')
    return null
  } finally {
    clearTimeout(timer)
  }
}
