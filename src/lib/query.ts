const aliases: Record<string, string[]> = {
  rNVDAUSDT: ['rnvdausdt', 'nvda', 'nvidia'],
  rAAPLUSDT: ['raaplusdt', 'aapl', 'apple'],
  rTSLAUSDT: ['rtslausdt', 'tsla', 'tesla'],
  rQQQUSDT: ['rqqqusdt', 'qqq', 'invesco'],
}

export function resolveInstrument(query: string): string | null {
  const tokens = query.toLowerCase().match(/[a-z0-9]+/g) ?? []
  return Object.entries(aliases).find(([, terms]) => terms.some((term) => tokens.some((token) => token === term)))?.[0] ?? null
}
