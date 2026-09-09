const QWEN_URL = 'https://hackathon.bitgetops.com/v1/responses'
const MAX_BODY_BYTES = 24_000

const systemPrompt = `You are the bounded evidence investigator for Market Integrity Desk.
Summarize only the supplied deterministic checks and source records.
Never predict price direction, recommend a trade, invent a missing fact, or treat unavailable data as a negative finding.
Every material claim must cite one or more supplied evidence IDs in square brackets.
Return JSON only with this shape: {"brief":"one compact paragraph","evidenceIds":["id"]}.`

function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  const blocks = Array.isArray(payload?.output) ? payload.output : []
  return blocks.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((item) => item?.text || item?.value || '')
    .filter(Boolean)
    .join('')
}

function safeJson(text) {
  const candidate = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(candidate)
  if (typeof parsed.brief !== 'string' || !Array.isArray(parsed.evidenceIds)) throw new Error('Invalid investigator response')
  return parsed
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const apiKey = process.env.BITGET_QWEN_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Investigator is not configured' })

  const serialized = JSON.stringify(req.body || {})
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Evidence payload too large' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 7500)
  try {
    const response = await fetch(QWEN_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3.8-max',
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          { role: 'user', content: [{ type: 'input_text', text: serialized }] },
        ],
        temperature: 0.1,
        max_output_tokens: 350,
      }),
      signal: controller.signal,
    })
    if (!response.ok) return res.status(502).json({ error: 'Investigator request failed', upstreamStatus: response.status })
    const raw = await response.json()
    const result = safeJson(outputText(raw))
    const suppliedIds = new Set((req.body?.evidence || []).map((item) => item.id))
    const evidenceIds = result.evidenceIds.filter((id) => suppliedIds.has(id))
    if (!evidenceIds.length) throw new Error('Investigator returned no valid evidence IDs')
    return res.status(200).json({ brief: result.brief.slice(0, 1200), evidenceIds, model: 'qwen3.8-max' })
  } catch (error) {
    return res.status(502).json({ error: 'Investigator unavailable', detail: error instanceof Error ? error.message : 'Unknown error' })
  } finally {
    clearTimeout(timer)
  }
}
