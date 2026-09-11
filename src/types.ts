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

export interface Passport {
  researchQuestion?: string
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
