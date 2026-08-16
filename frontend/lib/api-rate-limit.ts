// In-memory sliding-window rate limiter for general API endpoints.
// Distinct from auth-specific rate limiting (lib/rate-limit.ts) which uses a
// persistent Supabase table. This is lighter-weight for high-frequency API routes
// and resets on server restart (acceptable for abuse mitigation at the edge).

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface ApiRateLimitConfig {
  windowMs: number
  maxRequests: number
}

// Per-route API rate limit configuration.
// Routes not listed fall back to DEFAULT_API_LIMIT.
const API_RATE_LIMITS: Record<string, ApiRateLimitConfig> = {
  // Mark-as-read / dismiss / seen endpoints (frequent client-side calls)
  '/api/orders': { windowMs: 60 * 1000, maxRequests: 30 },
  '/api/payment-approvals': { windowMs: 60 * 1000, maxRequests: 20 },
  '/api/auth/sessions': { windowMs: 60 * 1000, maxRequests: 20 },
  '/api/health': { windowMs: 60 * 1000, maxRequests: 60 },
  '/api/metrics': { windowMs: 60 * 1000, maxRequests: 60 },
}

const DEFAULT_API_LIMIT: ApiRateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 60,
}

// Global store (persists across requests within a server instance).
// Use globalThis to survive HMR in development.
const globalStore = globalThis as unknown as {
  __apiRateLimitStore?: Map<string, RateLimitEntry>
}

const store = globalStore.__apiRateLimitStore ?? new Map<string, RateLimitEntry>()
globalStore.__apiRateLimitStore = store

function getConfigForPath(pathname: string): ApiRateLimitConfig {
  // Find the most specific matching prefix
  const matchingPrefix = Object.keys(API_RATE_LIMITS)
    .filter((prefix) => pathname.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0]

  return matchingPrefix ? API_RATE_LIMITS[matchingPrefix] : DEFAULT_API_LIMIT
}

export interface ApiRateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

export function checkApiRateLimit(
  identifier: string,
  pathname: string,
  now: number = Date.now()
): ApiRateLimitResult {
  const config = getConfigForPath(pathname)
  const key = `${identifier}:${pathname}`

  const existing = store.get(key)
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs })
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    }
  }

  if (existing.count >= config.maxRequests) {
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      resetAt: existing.resetAt,
    }
  }

  existing.count += 1
  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - existing.count,
    resetAt: existing.resetAt,
  }
}

// Periodic cleanup to prevent memory leak (call from middleware occasionally)
export function cleanupApiRateLimitStore(now: number = Date.now()): void {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key)
    }
  }
}
