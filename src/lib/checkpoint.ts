import type { DecisionMemoData, DeskDisposition } from './decision'
import type { CheckState, EvidenceItem, MoveAnalysis, Passport } from '../types'

const STORAGE_PREFIX = 'mid.thesis-checkpoint.v1.'
const SUPPORTED_SYMBOLS = new Set(['rNVDAUSDT', 'rAAPLUSDT', 'rTSLAUSDT', 'rQQQUSDT'])

export interface ThesisCheckpoint {
  symbol: string
  savedAt: string
  scannedAt: string
  thesis: string
  changeCondition: string
  disposition: DeskDisposition
  referenceBasis: string | null
  premiumBps: number | null
  checks: { id: string; title: string; state: CheckState; result: string }[]
  evidence: Pick<EvidenceItem, 'id' | 'title' | 'state' | 'summary' | 'source' | 'retrievedAt'>[]
}

export interface CheckpointReview {
  ready: boolean
  decisionChanged: boolean
  referenceChanged: boolean
  premiumDeltaBps: number | null
  checkChanges: { id: string; title: string; before: string; after: string }[]
  evidenceChanges: { id: string; title: string; before: string; after: string }[]
}

const storage = (): Storage | null => {
  try { return window.localStorage } catch { return null }
}

const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const validState = (value: unknown): value is CheckState => ['pass', 'caution', 'fail', 'unknown'].includes(String(value))

export function makeCheckpoint(passport: Passport, analysis: MoveAnalysis | null, memo: DecisionMemoData, thesis: string, changeCondition: string, savedAt = new Date().toISOString()): ThesisCheckpoint | null {
  if (passport.mode !== 'live' || !SUPPORTED_SYMBOLS.has(passport.instrument.symbol) || !validDate(passport.scannedAt)) return null
  const cleanThesis = thesis.trim().slice(0, 500)
  const cleanCondition = changeCondition.trim().slice(0, 300)
  if (!cleanThesis || !cleanCondition) return null
  const evidence = new Map<string, ThesisCheckpoint['evidence'][number]>()
  for (const item of [...passport.evidence, ...(analysis?.symbol === passport.instrument.symbol ? analysis.evidence : [])]) {
    if (evidence.size >= 40 && !evidence.has(item.id)) break
    evidence.set(item.id, { id: item.id, title: item.title, state: item.state, summary: item.summary, source: item.source, retrievedAt: item.retrievedAt })
  }
  return {
    symbol: passport.instrument.symbol,
    savedAt,
    scannedAt: passport.scannedAt,
    thesis: cleanThesis,
    changeCondition: cleanCondition,
    disposition: memo.disposition,
    referenceBasis: memo.referenceBasis,
    premiumBps: passport.premiumBps,
    checks: passport.checks.map(({ id, title, state, result }) => ({ id, title, state, result })),
    evidence: [...evidence.values()],
  }
}

function isCheckpoint(value: unknown, symbol: string): value is ThesisCheckpoint {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ThesisCheckpoint>
  return item.symbol === symbol && SUPPORTED_SYMBOLS.has(symbol)
    && validDate(item.savedAt) && validDate(item.scannedAt)
    && typeof item.thesis === 'string' && item.thesis.length <= 500
    && typeof item.changeCondition === 'string' && item.changeCondition.length <= 300
    && ['READY', 'INVESTIGATE', 'WAIT', 'REJECT_THESIS'].includes(String(item.disposition))
    && (item.referenceBasis === null || typeof item.referenceBasis === 'string')
    && (item.premiumBps === null || (typeof item.premiumBps === 'number' && Number.isFinite(item.premiumBps)))
    && Array.isArray(item.checks) && item.checks.length <= 40
    && Array.isArray(item.evidence) && item.evidence.length <= 40
    && item.checks.every((check) => typeof check.id === 'string' && typeof check.title === 'string' && validState(check.state) && typeof check.result === 'string')
    && item.evidence.every((record) => typeof record.id === 'string' && typeof record.title === 'string' && validState(record.state) && typeof record.summary === 'string' && typeof record.source === 'string' && validDate(record.retrievedAt))
}

export function readCheckpoint(symbol: string): ThesisCheckpoint | null {
  if (!SUPPORTED_SYMBOLS.has(symbol)) return null
  try {
    const raw = storage()?.getItem(`${STORAGE_PREFIX}${symbol}`)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return isCheckpoint(parsed, symbol) ? parsed : null
  } catch { return null }
}

export function saveCheckpoint(checkpoint: ThesisCheckpoint): boolean {
  if (!isCheckpoint(checkpoint, checkpoint.symbol)) return false
  try {
    const store = storage()
    if (!store) return false
    store.setItem(`${STORAGE_PREFIX}${checkpoint.symbol}`, JSON.stringify(checkpoint))
    return true
  } catch { return false }
}

export function removeCheckpoint(symbol: string): boolean {
  if (!SUPPORTED_SYMBOLS.has(symbol)) return false
  try {
    const store = storage()
    if (!store) return false
    store.removeItem(`${STORAGE_PREFIX}${symbol}`)
    return true
  } catch { return false }
}

export function compareCheckpoint(saved: ThesisCheckpoint, passport: Passport, memo: DecisionMemoData, analysis: MoveAnalysis | null): CheckpointReview {
  const empty: CheckpointReview = { ready: false, decisionChanged: false, referenceChanged: false, premiumDeltaBps: null, checkChanges: [], evidenceChanges: [] }
  if (saved.symbol !== passport.instrument.symbol || passport.mode !== 'live' || !validDate(passport.scannedAt) || Date.parse(passport.scannedAt) <= Date.parse(saved.scannedAt)) return empty

  const oldChecks = new Map(saved.checks.map((check) => [check.id, check]))
  const checkChanges = passport.checks.flatMap((check) => {
    const before = oldChecks.get(check.id)
    if (before?.state === check.state && before.result === check.result) return []
    return [{ id: check.id, title: check.title, before: before ? `${before.state} · ${before.result}` : 'not recorded', after: `${check.state} · ${check.result}` }]
  })
  for (const before of saved.checks) if (!passport.checks.some((check) => check.id === before.id)) checkChanges.push({ id: before.id, title: before.title, before: `${before.state} · ${before.result}`, after: 'no longer reported' })

  const currentEvidence = new Map<string, ThesisCheckpoint['evidence'][number]>()
  for (const item of [...passport.evidence, ...(analysis?.symbol === saved.symbol ? analysis.evidence : [])]) currentEvidence.set(item.id, item)
  const oldEvidence = new Map(saved.evidence.map((item) => [item.id, item]))
  const evidenceChanges: CheckpointReview['evidenceChanges'] = []
  for (const [id, item] of currentEvidence) {
    const before = oldEvidence.get(id)
    if (before?.state === item.state && before.summary === item.summary && before.source === item.source) continue
    evidenceChanges.push({ id, title: item.title, before: before ? `${before.state} · ${before.summary}` : 'not recorded', after: `${item.state} · ${item.summary}` })
  }
  for (const before of saved.evidence) if (!currentEvidence.has(before.id)) evidenceChanges.push({ id: before.id, title: before.title, before: `${before.state} · ${before.summary}`, after: 'not returned in this scan' })

  return {
    ready: true,
    decisionChanged: saved.disposition !== memo.disposition,
    referenceChanged: saved.referenceBasis !== memo.referenceBasis,
    premiumDeltaBps: saved.premiumBps === null || passport.premiumBps === null ? null : passport.premiumBps - saved.premiumBps,
    checkChanges,
    evidenceChanges,
  }
}
