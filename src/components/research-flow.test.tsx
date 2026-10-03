import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { snapshotFor } from '../data/snapshots'
import type { MoveAnalysis, StudyResult } from '../types'
import { DecisionMemo } from './DecisionMemo'
import { StressTest } from './StressTest'
import { ThesisCheckpoint } from './ThesisCheckpoint'

const passport = { ...snapshotFor('rNVDAUSDT'), mode: 'live' as const, tokenQuoteAge: 1 }
const noop = () => {}

describe('rendered research flow contracts (not browser interaction QA)', () => {
  it('explains an empty historical comparison in a focused live memo instead of hiding it', () => {
    const study = { available: true, stats: { episodes: 0 }, target: { driftBps: 11, context: 'Token-side study target.' }, verdict: { headline: 'No material drift to stress test', detail: '11 bps is below the event threshold.' } } as unknown as StudyResult
    const html = renderToStaticMarkup(<DecisionMemo passport={passport} analysis={null} study={study} studyPending={false} intent="feed" onGate={noop} onStress={noop} />)
    expect(html).toContain('No base rate inferred')
    expect(html).toContain('11 bps is below the event threshold.')
    expect(html).toContain('can differ from the underlying-reference gap above')
    expect(html).not.toContain('See every matched window')
  })
  it('puts the observable-condition selector inside the first-save form', () => {
    const html = renderToStaticMarkup(<ThesisCheckpoint passport={passport} analysis={null} study={null} scanning={false} studyPending={false} intent="overnight" onRescan={noop} />)
    const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'))
    expect(form).toContain('id="checkpoint-rule"')
    expect(form).toContain('value="gap-within" selected=""')
    expect(form).toContain('id="checkpoint-threshold"')
    expect(html).not.toContain('Saved baseline')
  })
  it('shows bounded thesis assessment instead of silently rejecting a generic question', () => {
    const analysis = { symbol: passport.instrument.symbol, evidence: [], metrics: { move: { detected: false, candlesUsed: 40, reason: 'No material move.' } }, verdicts: { likelyCatalyst: { state: 'NO_MATERIAL_MOVE' }, whatWouldChange: [], headlines: [] } } as unknown as MoveAnalysis
    const focused = renderToStaticMarkup(<DecisionMemo passport={passport} analysis={analysis} study={null} studyPending={false} intent="news" onGate={noop} onStress={noop} />)
    const generic = renderToStaticMarkup(<DecisionMemo passport={passport} analysis={analysis} study={null} studyPending={false} onGate={noop} onStress={noop} />)
    expect(focused).toContain('The claimed material repricing is absent')
    expect(focused).toContain('CONTRADICTED')
    expect(generic).not.toContain('CONTRADICTED')
    expect(generic).not.toContain('Revisit this catalyst claim')
  })
  it('renders the preserved memo comparison immediately on entry to Stress', () => {
    const seed = {
      symbol: passport.instrument.symbol, generatedAt: '2026-10-02T08:00:00Z', available: true,
      target: { driftBps: 83, bandBps: 100, minWindowHours: 2, source: 'live closed-market drift', context: 'Pinned observation.', stageHours: 16, stageToleranceHours: 2 },
      verdict: { headline: 'Pinned historical comparison', detail: 'Not a forecast.', tone: 'mixed' },
      lookback: { candles: 500, from: '2026-09-10T00:00:00Z', to: '2026-10-02T00:00:00Z' },
      coverage: { episodes: 10, resolved: 9, withUnderlying: 8 }, distribution: { observations: 200 },
      stats: { episodes: 0 }, matched: [], episodes: [], sourceErrors: [],
    } as unknown as StudyResult
    const html = renderToStaticMarkup(<StressTest symbol={passport.instrument.symbol} seed={seed} onSymbol={noop} />)
    expect(html).toContain('Pinned historical comparison')
    expect(html).toContain('+83 bps')
    expect(html).toContain('stage 16h ±2h')
    expect(html).toContain(seed.generatedAt)
    expect(html).not.toContain('Retrieving closed-market history.')
  })
})
