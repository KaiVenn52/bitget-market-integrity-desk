const aliases: Record<string, string[]> = {
  rNVDAUSDT: ['rnvdausdt', 'nvda', 'nvidia'],
  rAAPLUSDT: ['raaplusdt', 'aapl', 'apple'],
  rTSLAUSDT: ['rtslausdt', 'tsla', 'tesla'],
  rQQQUSDT: ['rqqqusdt', 'qqq', 'invesco'],
}

export function resolveInstrument(query: string): string | null {
  const tokens: string[] = query.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const matches = Object.entries(aliases).filter(([, terms]) => terms.some((term) => tokens.includes(term)))
  return matches.length === 1 ? matches[0][0] : null
}
