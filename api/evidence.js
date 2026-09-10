const QWEN_URL = 'https://hackathon.bitgetops.com/v1/responses'
const MAX_BODY_BYTES = 24_000
const QWEN_TIMEOUT_MS = 25_000

export const config = { maxDuration: 30 }

const systemPrompt = `You are the bounded evidence investigator for Market Integrity Desk.
Summarize only the supplied deterministic checks and source records.
Never predict price direction, recommend a trade, invent a missing fact, or treat unavailable data as a negative finding.
Every material claim must cite one or more supplied evidence IDs in square brackets.
Return JSON only with this shape: {"brief":"one compact paragraph","evidenceIds":["id"]}.`

function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  const blocks = Array.isArray(payload?.output) ? payload.output : []
  const responseText = blocks.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((item) => typeof item === 'string' ? item : item?.text || item?.value || '')
    .filter(Boolean)
    .join('')
  if (responseText) return responseText
  const chatContent = payload?.choices?.[0]?.message?.content
  return typeof chatContent === 'string' ? chatContent : ''
}

function responseShape(payload) {
  const keys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 12) : []
  const output = Array.isArray(payload?.output) ? payload.output : []
  const outputTypes = output.map((item) => item?.type || typeof item).slice(0, 8)
  const contentKeys = output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((item) => item && typeof item === 'object' ? Object.keys(item).slice(0, 8) : [typeof item])
    .slice(0, 8)
  return { keys, outputTypes, contentKeys, errorType: payload?.error?.type || payload?.error?.code || null }
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
  if (!apiKey) return res.status(200).json({ available: false, reason: 'Qwen not configured · deterministic fallback retained' })

  const serialized = JSON.stringify(req.body || {})
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Evidence payload too large' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), QWEN_TIMEOUT_MS)
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
    if (!response.ok) return res.status(200).json({ available: false, reason: `Qwen unavailable (${response.status}) · deterministic fallback retained` })
    const raw = await response.json()
    const text = outputText(raw)
    if (!text) return res.status(200).json({ available: false, reason: 'Qwen returned no readable answer · deterministic fallback retained', diagnostic: responseShape(raw) })
    let result
    try {
      result = safeJson(text)
    } catch {
      return res.status(200).json({ available: false, reason: 'Qwen answer failed the evidence schema · deterministic fallback retained' })
    }
    const suppliedIds = new Set((req.body?.evidence || []).map((item) => item.id))
    const evidenceIds = result.evidenceIds.filter((id) => suppliedIds.has(id))
    if (!evidenceIds.length) return res.status(200).json({ available: false, reason: 'Qwen cited no supplied evidence · deterministic fallback retained' })
    const citedIds = [...result.brief.matchAll(/\[([A-Za-z0-9_-]+)\]/g)].map((match) => match[1])
    if (!citedIds.length || citedIds.some((id) => !suppliedIds.has(id))) return res.status(200).json({ available: false, reason: 'Qwen citations failed verification · deterministic fallback retained' })
    if (evidenceIds.some((id) => !citedIds.includes(id))) return res.status(200).json({ available: false, reason: 'Qwen citation list did not match its brief · deterministic fallback retained' })
    return res.status(200).json({ available: true, brief: result.brief.slice(0, 1200), evidenceIds, model: 'qwen3.8-max' })
  } catch (error) {
    const timedOut = error?.name === 'AbortError'
    return res.status(200).json({ available: false, reason: timedOut ? 'Qwen timed out · deterministic fallback retained' : 'Qwen request failed · deterministic fallback retained' })
  } finally {
    clearTimeout(timer)
  }
}
