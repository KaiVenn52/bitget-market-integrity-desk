// A per-client budget for the public research endpoint.
//
// Every call to /api/analyze spends a paid model request, so the endpoint cannot be an
// open tap. The counter lives in the instance's memory, which on a serverless platform
// means it is per warm instance and not a global quota. The honest description is
// therefore "raises the cost of abuse", not "enforces a hard limit" — a durable limit
// needs shared storage this desk does not have, and claiming otherwise would be the
// same kind of unearned assurance the desk exists to refuse.

export const RATE_LIMIT_WINDOW_MS = 60_000
export const RATE_LIMIT_MAX = 12
// Bounded so an attacker cannot grow the map without limit and exhaust the instance.
const MAX_TRACKED_CLIENTS = 5_000

const buckets = new Map()

/**
 * Count one request from `key` against a fixed window, returning whether it is allowed.
 *
 * Exported for its own tests and for reuse by any other endpoint that spends money.
 */
export function rateLimit(key, nowMs, options = {}) {
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS
  const max = options.max ?? RATE_LIMIT_MAX
  const store = options.store ?? buckets
  if (store.size > (options.maxKeys ?? MAX_TRACKED_CLIENTS)) store.clear()

  const bucket = store.get(key)
  if (!bucket || nowMs - bucket.startMs >= windowMs) {
    store.set(key, { startMs: nowMs, count: 1 })
    return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 }
  }
  bucket.count += 1
  if (bucket.count > max) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (nowMs - bucket.startMs)) / 1000)) }
  }
  return { allowed: true, remaining: max - bucket.count, retryAfterSeconds: 0 }
}

/** The best available client identity: the proxy's forwarded address, else the socket. */
export function clientKey(headers = {}, socket) {
  const forwarded = String(headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  if (forwarded) return forwarded
  const real = String(headers['x-real-ip'] ?? '').trim()
  if (real) return real
  return String(socket?.remoteAddress ?? '') || 'unknown'
}

/** Test seam: the production map is module-level and would otherwise leak between tests. */
export function resetRateLimitStore() {
  buckets.clear()
}
