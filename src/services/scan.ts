import { snapshotFor } from '../data/snapshots'
import type { Passport } from '../types'

// The server's own source budget is 5.5s. Leave room for a cold start,
// serialization and network transit so a successful live response is not
// discarded in favour of a fixture just before it reaches the browser.
const TIMEOUT_MS = 8000
export type ScanProgress = (message: string) => void

/**
 * Retrieve the integrity passport. This path is deterministic and calls no model.
 * Move explanation is a separate server-built request (see services/analyze.ts):
 * the browser sends only a symbol and a question, so a client can never supply
 * the evidence an answer rests on.
 */
export async function runScan(symbol: string, researchQuestion = `Can I trust ${symbol} right now?`, onProgress?: ScanProgress): Promise<Passport> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    onProgress?.('Retrieving live Bitget rToken and Stock+ records.')
    const response = await fetch(`/api/scan?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Scan API returned ${response.status}`)
    return { ...(await response.json()) as Passport, researchQuestion }
  } catch {
    onProgress?.('Live route unavailable. Loading a timestamped fixture instead of presenting stale data as live.')
    await new Promise((resolve) => window.setTimeout(resolve, 480))
    return { ...snapshotFor(symbol), researchQuestion }
  } finally {
    window.clearTimeout(timeout)
  }
}
