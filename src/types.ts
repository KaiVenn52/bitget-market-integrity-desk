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
