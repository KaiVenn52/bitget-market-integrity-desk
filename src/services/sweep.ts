import type { SweepResult } from '../types'

const SWEEP_TIMEOUT_MS = 30_000

/**
 * Run the integrity sweep. The browser sends no evidence — it asks the desk to
 * gate its own watchlist and receives verdicts that already cite server-side
 * records. A failure returns null so the UI can say so instead of inventing a
 * clean desk.
 */
export async function runSweep(onProgress?: (note: string) => void): Promise<SweepResult | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SWEEP_TIMEOUT_MS)
  onProgress?.('Retrieving tickers, candles and session-aware references for four instruments.')
  try {
    const response = await fetch('/api/sweep', { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!response.ok) {
      onProgress?.(`Sweep endpoint returned HTTP ${response.status}.`)
      return null
    }
    const payload = (await response.json()) as SweepResult
    if (!payload?.entries?.length) {
      onProgress?.('Sweep returned no instrument entries.')
      return null
    }
    onProgress?.(`Swept ${payload.entries.length} instruments in the ${payload.sweepLabel}.`)
    return payload
  } catch (error) {
    onProgress?.(error instanceof Error && error.name === 'AbortError' ? 'Sweep timed out.' : 'Sweep could not reach the desk.')
    return null
  } finally {
    clearTimeout(timer)
  }
}
