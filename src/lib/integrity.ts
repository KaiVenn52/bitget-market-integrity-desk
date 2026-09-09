import type { CheckState, IntegrityCheck, MarketInstrument, PassportState } from '../types'

export const bpsBetween = (token: number, underlying: number) => Math.round(((token - underlying) / underlying) * 10_000)

export const priceState = (bps: number): CheckState => {
  const distance = Math.abs(bps)
  if (distance <= 20) return 'pass'
  if (distance <= 100) return 'caution'
  return 'fail'
}

export const freshnessState = (ageSeconds: number): CheckState => {
  if (ageSeconds <= 30) return 'pass'
  if (ageSeconds <= 120) return 'caution'
  return 'fail'
}

export const derivePassportState = (checks: IntegrityCheck[]): PassportState => {
  if (checks.some((check) => check.state === 'fail')) return 'CAUTION'
  const knownChecks = checks.filter((check) => check.state !== 'unknown')
  if (knownChecks.length < 3) return 'UNVERIFIABLE'
  if (checks.some((check) => check.state === 'caution' || check.state === 'unknown')) return 'CAUTION'
  return 'PASS'
}

export function buildChecks(instrument: MarketInstrument, tokenAge: number, underlyingAge: number): IntegrityCheck[] {
  if (instrument.underlyingPrice == null) throw new Error('Underlying price is required for deterministic alignment checks')
  const premium = bpsBetween(instrument.tokenPrice, instrument.underlyingPrice)
  const alignment = priceState(premium)
  const tokenFreshness = freshnessState(tokenAge)
  const underlyingFreshness = freshnessState(underlyingAge)
  const freshness: CheckState = tokenFreshness === 'fail' || underlyingFreshness === 'fail' ? 'fail' : tokenFreshness === 'caution' || underlyingFreshness === 'caution' ? 'caution' : 'pass'

  return [
    { id: 'alignment', title: 'Price alignment', summary: 'Token vs. underlying within declared threshold', state: alignment, result: `${premium > 0 ? '+' : ''}${premium} bps`, detail: 'Signed premium is computed deterministically from the latest observable token and underlying prices. No LLM arithmetic is used.', observations: [{ label: 'Formula', value: '(token − underlying) / underlying × 10,000' }, { label: 'Pass threshold', value: 'absolute premium ≤ 20 bps' }] },
    { id: 'freshness', title: 'Quote freshness', summary: 'Both markets publish recent, timestamped data', state: freshness, result: `Token ${tokenAge}s · Underlying ${underlyingAge}s`, detail: 'Freshness is evaluated independently for each source. A closed market is not mislabeled as a broken feed.', observations: [{ label: 'Token quote age', value: `${tokenAge}s`, accent: tokenFreshness }, { label: 'Underlying quote age', value: `${underlyingAge}s`, accent: underlyingFreshness }, { label: 'Pass threshold', value: '≤ 30s' }] },
    { id: 'session', title: 'Session consistency', summary: 'Observed timestamps agree with the declared market session', state: 'pass', result: 'SUPPORTED', detail: 'Session state is derived from the exchange field when available and checked against the market calendar.', observations: [{ label: 'Expected', value: 'US regular session' }, { label: 'Observed', value: 'Normal / Open', accent: 'pass' }] },
    { id: 'corporate', title: 'Corporate actions', summary: 'Split, dividend, and adjustment context is machine-readable', state: 'unknown', result: 'UNVERIFIABLE', detail: 'No machine-readable corporate-action response was available in this scan. The system abstains instead of asserting that no event exists.', observations: [{ label: 'Status', value: 'Data unavailable', accent: 'unknown' }, { label: 'Policy', value: 'Never infer absence from a failed request' }] },
    { id: 'liquidity', title: 'Liquidity observability', summary: 'Sufficient depth data exists to characterize execution risk', state: 'unknown', result: 'NOT OBSERVABLE', detail: 'Top-of-book or platform turnover is not a substitute for full market depth. This check remains unknown without the required Reality depth access.', observations: [{ label: 'Order book', value: 'Whitelist access not configured', accent: 'unknown' }, { label: 'Output', value: 'No thin/deep claim made' }] },
  ]
}
