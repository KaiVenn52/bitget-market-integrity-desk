export type CheckState = 'pass' | 'caution' | 'fail' | 'unknown'
export type PassportState = 'PASS' | 'CAUTION' | 'UNVERIFIABLE'
export type DataMode = 'live' | 'snapshot'
export type ReasoningMode = 'rules' | 'qwen'

export interface MarketInstrument {
  symbol: string
  underlyingSymbol: string
  company: string
  tokenPrice: number
  underlyingPrice: number | null
  change24h: number
}

export interface IntegrityCheck {
  id: string
  title: string
  summary: string
  state: CheckState
  result: string
  detail: string
  observations: { label: string; value: string; accent?: CheckState }[]
}

export interface EvidenceItem {
  id: string
  title: string
  summary: string
  state: CheckState
  timestamp: string
  source: string
  endpoint: string
  retrievedAt: string
}

export interface TimelineEvent {
  id: string
  time: string
  title: string
  detail: string
  kind: 'token' | 'underlying' | 'news'
  offset: number
}

export type CatalystState = 'NEWS_TIMED' | 'NO_STRONG_CATALYST' | 'NO_MATERIAL_MOVE'
export type HeadlineTiming = 'POSSIBLE' | 'POSSIBLE_CONTRIBUTING' | 'TIME_UNKNOWN' | 'DISTANT' | 'TIMING_INCONSISTENT' | 'NO_MOVE_BOUNDARY'

export interface HeadlineCandidate {
  id: string
  title: string
  publisher: string
  link: string
  publishedMs: number | null
  source: string
  timing: HeadlineTiming
  deltaMinutes: number | null
  reason: string
}

export interface ExplanationItem {
  id: string
  label: string
  detail: string
}

export interface MoveMetrics {
  detected: boolean
  reason: string
  direction?: 'up' | 'down'
  moveBps?: number
  windowMinutes?: number
  startMs?: number
  sustained?: boolean
  candlesUsed?: number
}

export interface MoveAnalysis {
  symbol: string
  question: string
  generatedAt: string
  session: string
  sessionLabel: string
  reference: {
    chosen: { price: number; ageSeconds: number; session: string; label?: string } | null
    stale: boolean
    underlyingTradable: boolean
    note: string
  }
  metrics: {
    move: MoveMetrics
    drift: { currentBps: number | null; priorBps: number | null; deltaBps: number | null; trend: string; lookbackMinutes: number }
    spread: { spreadBps: number | null; bid: number | null; ask: number | null; bidSize: number | null; askSize: number | null; state: CheckState; note: string }
    turnover: { ratio: number | null; state: CheckState; note: string }
  }
  verdicts: {
    likelyCatalyst: { state: CatalystState; title: string; detail: string; evidenceIds: string[] }
    supporting: ExplanationItem[]
    alternatives: ExplanationItem[]
    rejected: ExplanationItem[]
    confidence: { level: 'LOW' | 'MEDIUM' | 'HIGH'; rule: string }
    whatWouldChange: string[]
    candidateCount: number
    headlines: HeadlineCandidate[]
  }
  news: { status: 'available' | 'unavailable'; retrieved: number; note: string }
  evidence: EvidenceItem[]
  brief: string
  briefEvidenceIds: string[]
  reasoningMode: ReasoningMode
  reasoningNote: string
  token: { lastPrice: number; change24h: number; platformTurnover24h: number; turnover24h: number } | null
  sourceErrors: string[]
}

export interface Passport {
  researchQuestion?: string
  analysis?: MoveAnalysis
  instrument: MarketInstrument
  state: PassportState
  mode: DataMode
  reasoningMode: ReasoningMode
  scannedAt: string
  sessionState: string
  tokenQuoteAge: number
  underlyingQuoteAge: number | null
  premiumBps: number | null
  liquidity: 'OBSERVABLE' | 'NOT OBSERVABLE'
  corporateAction: string
  checks: IntegrityCheck[]
  evidence: EvidenceItem[]
  timeline: TimelineEvent[]
  brief: string
  briefEvidenceIds: string[]
  researchAction: string
  reasoningNote: string
}

// --- Pre-trade integrity gate -------------------------------------------------

export type GateDecision = 'CLEAR' | 'INVESTIGATE' | 'WAIT' | 'BLOCKED'

export interface GateVerdict {
  decision: GateDecision
  code: string
  headline: string
  reason: string
  meaning: string
  evidenceIds: string[]
  conditions: string[]
  nextStep: string
  /** What the basis was: an authenticated live quote, or the last official close. */
  referenceKind: 'live-quote' | 'official-close' | null
}

export interface SweepEntry {
  symbol: string
  company: string
  underlyingSymbol: string
  at: string
  session: string
  sessionLabel: string
  tokenPrice: number | null
  tokenQuoteAge: number | null
  premiumBps: number | null
  alignmentState: CheckState
  referencePrice: number | null
  referenceStale: boolean
  gate: GateVerdict
  unresolvedEvidenceIds: string[]
  metrics: {
    move: MoveMetrics
    drift: { currentBps: number | null; priorBps: number | null; deltaBps: number | null; trend: string; lookbackMinutes: number }
    spread: { spreadBps: number | null; bid: number | null; ask: number | null; bidSize: number | null; askSize: number | null; state: CheckState }
    turnover: { ratio: number | null; state: CheckState }
  } | null
  sourceErrors: string[]
  evidence: EvidenceItem[]
}

export interface SweepResult {
  ranAt: string
  mode: DataMode
  reasoningMode: ReasoningMode
  sweepLabel: string
  summary: {
    worst: GateDecision
    counts: Record<GateDecision, number>
    headline: string
    detail: string
    integrityWarning?: string
  }
  entries: SweepEntry[]
}

/** One line of the desk's own audit trail, kept in the browser only. */
export interface DeskLogEntry {
  ranAt: string
  sweepLabel: string
  worst: GateDecision
  headline: string
  detail: string
  verdicts: { symbol: string; decision: GateDecision; code: string; headline: string }[]
}

// --- Historical stress test ---------------------------------------------------

export interface StudyEpisode {
  anchorMs: number
  anchorPrice: number
  windowHours: number
  peakDriftBps: number
  resolutionBps: number | null
  directionMatch: boolean | null
  underlyingResolutionBps: number | null
  underlyingDirectionMatch: boolean | null
}

/** What the following session did, relative to the drift being tested. */
export type StudyOutcome = 'confirmed' | 'contradicted' | 'flat' | 'unknown'

export interface StudyMatched {
  anchorMs: number
  windowHours: number
  /**
   * The point-in-time basis for the match: the drift actually observed at this stage of
   * the window. This is what the row is selected on, and what the outcome is measured
   * against, because it is what a trader could have reacted to at the time.
   */
  matchedDriftBps: number
  /** How far into the closed window that observation fell. */
  matchedStageHours: number
  /** Descriptive only: the window's peak, which hindsight reveals and matching ignores. */
  peakDriftBps: number
  sessionCloseMs: number
  resolutionBps: number
  directionMatch: boolean
  errorBps: number
  maxFavourableBps: number | null
  maxAdverseBps: number | null
  underlyingResolutionBps: number | null
  underlyingDirectionMatch: boolean | null
  underlyingErrorBps: number | null
  /** Whether the session that followed materially moved the way the drift implied. */
  outcome: StudyOutcome
  usedResolutionBps: number
  usedSource: 'underlying' | 'token'
}

export interface StudyResult {
  symbol: string
  company?: string
  generatedAt: string
  available: boolean
  reason?: string
  mode: DataMode
  reasoningMode: ReasoningMode
  lookback: { candles: number; from: string; to: string }
  target: { driftBps: number | null; bandBps: number; minWindowHours: number; source: string; material: boolean; context: string }
  current: {
    lastCandleMs: number
    lastClose: number
    session: string
    sessionLabel: string
    underlyingTradable: boolean
    anchorMs: number | null
    anchorPrice: number | null
    driftBps: number | null
  } | null
  distribution: {
    observations: number
    medianAbsBps: number | null
    p75AbsBps: number | null
    p90AbsBps: number | null
    p95AbsBps: number | null
    maxAbsBps: number | null
    aboveThresholdPct: number | null
    above100Pct: number | null
    above200Pct: number | null
  }
  stats: {
    episodes: number
    confirmed: number
    contradicted: number
    /** Sessions that closed inside the alignment threshold: neither support nor refutation. */
    flat: number
    materialEpisodes: number
    confirmationRate: number | null
    flatRate: number | null
    medianErrorBps: number | null
    medianResolutionBps: number | null
    worstErrorBps: number | null
    direction: 'up' | 'down' | null
    source: 'underlying' | 'token' | 'mixed' | null
  }
  verdict: { headline: string; detail: string; tone?: string }
  matched: StudyMatched[]
  episodes: StudyEpisode[]
  coverage: { episodes: number; resolved: number; withUnderlying: number }
  evidence: EvidenceItem[]
  sourceErrors: string[]
}
