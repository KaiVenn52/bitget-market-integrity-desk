import { buildChecks, derivePassportState, bpsBetween } from '../lib/integrity'
import type { MarketInstrument, Passport } from '../types'

export const instruments: MarketInstrument[] = [
  { symbol: 'rNVDAUSDT', underlyingSymbol: 'NVDA.US', company: 'NVIDIA', tokenPrice: 225.84, underlyingPrice: 225.92, change24h: 1.26 },
  { symbol: 'rAAPLUSDT', underlyingSymbol: 'AAPL.US', company: 'Apple', tokenPrice: 229.11, underlyingPrice: 229.03, change24h: 0.48 },
  { symbol: 'rTSLAUSDT', underlyingSymbol: 'TSLA.US', company: 'Tesla', tokenPrice: 262.39, underlyingPrice: 263.08, change24h: -1.12 },
  { symbol: 'rQQQUSDT', underlyingSymbol: 'QQQ.US', company: 'Invesco QQQ', tokenPrice: 489.32, underlyingPrice: 489.17, change24h: 0.35 },
]

export function snapshotFor(symbol: string): Passport {
  const instrument = instruments.find((item) => item.symbol === symbol) ?? instruments[0]
  if (instrument.underlyingPrice == null) throw new Error('Snapshot requires an underlying price')
  const fixtureTime = new Date('2026-09-09T15:45:14.000Z')
  const tokenAge = symbol === 'rTSLAUSDT' ? 68 : 18
  const underlyingAge = 12
  const checks = buildChecks(instrument, tokenAge, underlyingAge)
  const hhmm = (deltaMinutes = 0) => new Date(fixtureTime.getTime() + deltaMinutes * 60_000).toISOString().slice(11, 16)
  const scannedAt = fixtureTime.toISOString()
  const premiumBps = bpsBetween(instrument.tokenPrice, instrument.underlyingPrice)

  return {
    instrument,
    state: derivePassportState(checks),
    mode: 'snapshot',
    reasoningMode: 'rules',
    scannedAt,
    sessionState: 'Fixture',
    tokenQuoteAge: tokenAge,
    underlyingQuoteAge: underlyingAge,
    premiumBps,
    liquidity: 'NOT OBSERVABLE',
    corporateAction: 'Unverifiable',
    checks,
    evidence: [
      { id: 'price', title: 'Fixture price alignment', summary: `Frozen fixture premium is ${premiumBps > 0 ? '+' : ''}${premiumBps} bps.`, state: Math.abs(premiumBps) <= 20 ? 'pass' : 'caution', timestamp: hhmm(), source: 'Frozen demonstration fixture', endpoint: 'Not retrieved during this run', retrievedAt: scannedAt },
      { id: 'fresh', title: 'Fixture timestamps', summary: `Recorded fixture ages: token ${tokenAge}s · underlying ${underlyingAge}s.`, state: tokenAge <= 30 ? 'pass' : 'caution', timestamp: hhmm(), source: 'Frozen demonstration fixture', endpoint: 'Not retrieved during this run', retrievedAt: scannedAt },
      { id: 'corporate', title: 'Corporate-action context', summary: 'No machine-readable response available; absence is not inferred.', state: 'unknown', timestamp: hhmm(-1), source: 'Reality corporate actions', endpoint: '/api/v3/reality/market/dividends', retrievedAt: scannedAt },
      { id: 'liquidity', title: 'Liquidity depth', summary: 'Reality depth access is not configured.', state: 'unknown', timestamp: hhmm(-1), source: 'Reality order book', endpoint: '/api/v3/account/reality-orderbook', retrievedAt: scannedAt },
    ],
    timeline: [
      { id: 't1', time: hhmm(-12), title: 'Token repriced', detail: '+1.4% from local baseline', kind: 'token', offset: 8 },
      { id: 't2', time: hhmm(-7), title: 'Underlying update', detail: 'Reference quote published', kind: 'underlying', offset: 38 },
      { id: 't3', time: hhmm(-4), title: 'News published', detail: `${instrument.company} sector update`, kind: 'news', offset: 64 },
      { id: 't4', time: hhmm(), title: 'Current scan', detail: 'Evidence boundary', kind: 'underlying', offset: 94 },
    ],
    brief: `Demonstration fixture captured at 2026-09-09 15:45 UTC. At that frozen boundary, the token and underlying prices are ${Math.abs(premiumBps) <= 20 ? 'closely aligned' : 'divergent'} at ${Math.abs(premiumBps)} bps. This fixture demonstrates the audit workflow and is not current market evidence.`,
    briefEvidenceIds: [],
    researchAction: 'Run a live integrity scan before using any displayed market state in current research.',
    reasoningNote: 'Frozen demonstration fixture · deterministic rules only',
  }
}

export const replayCases = [
  { id: 'R-001', symbol: 'rNVDAUSDT', scenario: 'News published after initial price move', expected: 'CONTRADICTED', rules: 'MISS', llm: 'PASS', hybrid: 'PASS' },
  { id: 'R-002', symbol: 'rAAPLUSDT', scenario: 'Fresh quotes, normal premium', expected: 'SUPPORTED', rules: 'PASS', llm: 'PASS', hybrid: 'PASS' },
  { id: 'R-003', symbol: 'rTSLAUSDT', scenario: 'Underlying quote stale in open session', expected: 'CAUTION', rules: 'PASS', llm: 'MISS', hybrid: 'PASS' },
  { id: 'R-004', symbol: 'rQQQUSDT', scenario: 'Missing depth endpoint', expected: 'UNVERIFIABLE', rules: 'PASS', llm: 'MISS', hybrid: 'PASS' },
]
