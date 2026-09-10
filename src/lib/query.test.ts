import { describe, expect, it } from 'vitest'
import { resolveInstrument } from './query'

describe('natural-language instrument resolution', () => {
  it('resolves an exact rToken symbol', () => expect(resolveInstrument('Can I trust rTSLAUSDT right now?')).toBe('rTSLAUSDT'))
  it('resolves a company name', () => expect(resolveInstrument('Check NVIDIA market integrity')).toBe('rNVDAUSDT'))
  it('is case insensitive', () => expect(resolveInstrument('review AAPL evidence')).toBe('rAAPLUSDT'))

  it('does not match aliases embedded inside unrelated words', () => {
    expect(resolveInstrument('review the pineapple market')).toBeNull()
  })
  it('abstains on unsupported instruments', () => expect(resolveInstrument('analyze MSFT')).toBeNull())
})
