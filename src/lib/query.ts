const aliases: Record<string, string[]> = {
  rNVDAUSDT: ['rnvdausdt', 'nvda', 'nvidia'],
  rAAPLUSDT: ['raaplusdt', 'aapl', 'apple'],
  rTSLAUSDT: ['rtslausdt', 'tsla', 'tesla'],
  rQQQUSDT: ['rqqqusdt', 'qqq', 'invesco'],
}

export function resolveInstrument(query: string): string | null {
  const normalized = query.toLowerCase()
  return Object.entries(aliases).find(([, terms]) => terms.some((term) => normalized.includes(term)))?.[0] ?? null
}

