import type { MoveAnalysis } from '../types'

const ANALYSIS_TIMEOUT_MS = 45_000
export type AnalysisProgress = (message: string) => void

/**
 * Ask the server to explain a repricing. The browser sends only a symbol and the
 * trader's question: every record the answer rests on is retrieved, timestamped
 * and ranked server-side, so the client cannot supply its own evidence.
 */
export async function runAnalysis(symbol: string, question: string, onProgress?: AnalysisProgress): Promise<MoveAnalysis | null> {
  onProgress?.('Retrieving Bitget records and timestamped headlines.')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS)
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol, question }),
      signal: controller.signal,
    })
    if (!response.ok) {
      onProgress?.(`Analysis endpoint returned ${response.status} · deterministic passport retained.`)
      return null
    }
    onProgress?.('Measuring the repricing, then ranking explanations against publication times.')
    const data = (await response.json()) as MoveAnalysis
    if (!data?.verdicts?.likelyCatalyst) {
      onProgress?.('Analysis response was incomplete · deterministic passport retained.')
      return null
    }
    onProgress?.(data.reasoningNote)
    return data
  } catch {
    onProgress?.('Analysis sources unreachable · deterministic passport retained.')
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}
