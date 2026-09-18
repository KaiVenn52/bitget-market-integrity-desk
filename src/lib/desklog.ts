import type { DeskLogEntry, GateDecision, SweepResult } from '../types'

// The desk log lives in this browser only. It is an audit trail of the desk's own
// judgements, not a record of positions, orders or performance — the desk holds
// no positions and places no orders.

const KEY = 'mid.desklog.v1'
const MAX_RUNS = 40

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readDeskLog(): DeskLogEntry[] {
  const store = storage()
  if (!store) return []
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as DeskLogEntry[]) : []
  } catch {
    return []
  }
}

export function toLogEntry(result: SweepResult): DeskLogEntry {
  return {
    ranAt: result.ranAt,
    sweepLabel: result.sweepLabel,
    worst: result.summary.worst,
    headline: result.summary.headline,
    detail: result.summary.detail,
    verdicts: result.entries.map((entry) => ({
      symbol: entry.symbol,
      decision: entry.gate.decision,
      code: entry.gate.code,
      headline: entry.gate.headline,
    })),
  }
}

export function appendDeskLog(entry: DeskLogEntry): DeskLogEntry[] {
  const next = [entry, ...readDeskLog()].slice(0, MAX_RUNS)
  const store = storage()
  try {
    store?.setItem(KEY, JSON.stringify(next))
  } catch {
    // A full or unavailable store must not break the desk.
  }
  return next
}

export function clearDeskLog(): DeskLogEntry[] {
  try {
    storage()?.removeItem(KEY)
  } catch {
    // ignore
  }
  return []
}

/**
 * Refusals are the point of the gate, so they are counted first and named as
 * refusals rather than buried in a pass rate.
 */
export function logStats(entries: DeskLogEntry[]) {
  const counts: Record<GateDecision, number> = { CLEAR: 0, INVESTIGATE: 0, WAIT: 0, BLOCKED: 0 }
  for (const run of entries) for (const verdict of run.verdicts) counts[verdict.decision] += 1
  const total = counts.CLEAR + counts.INVESTIGATE + counts.WAIT + counts.BLOCKED
  return {
    runs: entries.length,
    counts,
    total,
    refusals: counts.BLOCKED + counts.WAIT,
    refusalRate: total ? Math.round(((counts.BLOCKED + counts.WAIT) / total) * 100) : 0,
  }
}
