import { cookies } from 'next/headers'

// Session configuration constants
export const SESSION_CONFIG = {
  // Idle timeout: 30 minutes
  IDLE_TIMEOUT_MS: 30 * 60 * 1000,
  // Absolute timeout: 24 hours
  ABSOLUTE_TIMEOUT_MS: 24 * 60 * 60 * 1000,
  // Cookie name for session tracking
  SESSION_COOKIE_NAME: 'ah_session_meta',
} as const

interface SessionMetadata {
  createdAt: number
  lastActivity: number
  userId: string
}

// The metadata cookie is HMAC-signed so clients can't forge createdAt /
// lastActivity to defeat the idle/absolute session timeouts. Uses Web Crypto
// so it works in both the Node runtime and the middleware edge runtime.
const SESSION_SECRET = process.env.SESSION_SECRET || ''

if (process.env.NODE_ENV === 'production' && !SESSION_SECRET) {
  console.error(
    '[session] SESSION_SECRET is not configured - session timeout cookies are not authenticated'
  )
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacSign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return bytesToBase64Url(new Uint8Array(sig))
}

async function hmacVerify(value: string, sig: string): Promise<boolean> {
  if (!SESSION_SECRET) return false
  const expected = await hmacSign(value)
  const a = new TextEncoder().encode(sig)
  const b = new TextEncoder().encode(expected)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function encodeMetadata(meta: SessionMetadata): Promise<string> {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(meta)))
  const sig = await hmacSign(payload)
  return `${payload}.${sig}`
}

async function decodeMetadata(raw: string): Promise<SessionMetadata | null> {
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  if (!(await hmacVerify(payload, sig))) return null
  try {
    return JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    )) as SessionMetadata
  } catch {
    return null
  }
}

export async function getSessionMetadata(): Promise<SessionMetadata | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_CONFIG.SESSION_COOKIE_NAME)

  if (!cookie?.value) return null

  return decodeMetadata(cookie.value)
}

export async function updateSessionActivity(userId: string): Promise<void> {
  const cookieStore = await cookies()
  const metadata: SessionMetadata = {
    createdAt: Date.now(),
    lastActivity: Date.now(),
    userId,
  }

  cookieStore.set(SESSION_CONFIG.SESSION_COOKIE_NAME, await encodeMetadata(metadata), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: Math.floor(SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS / 1000),
    path: '/',
  })
}

export async function checkSessionTimeout(): Promise<{ valid: boolean; reason?: string }> {
  const metadata = await getSessionMetadata()
  
  if (!metadata) {
    return { valid: true } // No metadata = first request or new session
  }
  
  const now = Date.now()
  
  // Check absolute timeout
  if (now - metadata.createdAt > SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS) {
    return { valid: false, reason: 'Session expired (absolute timeout)' }
  }
  
  // Check idle timeout
  if (now - metadata.lastActivity > SESSION_CONFIG.IDLE_TIMEOUT_MS) {
    return { valid: false, reason: 'Session expired (idle timeout)' }
  }
  
  return { valid: true }
}

export async function refreshSessionActivity(): Promise<void> {
  const metadata = await getSessionMetadata()
  if (metadata) {
    metadata.lastActivity = Date.now()
    const cookieStore = await cookies()
    cookieStore.set(SESSION_CONFIG.SESSION_COOKIE_NAME, await encodeMetadata(metadata), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS / 1000),
      path: '/',
    })
  }
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_CONFIG.SESSION_COOKIE_NAME)
}

export async function secureSignOut(): Promise<void> {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch (err) {
    console.warn('[auth] secureSignOut error:', err)
  }
  
  await clearSession()
}

// Proxy helper to validate session without calling next/headers cookies()
export async function validateSessionInProxy(
  request: import('next/server').NextRequest
): Promise<{ valid: boolean; reason?: string }> {
  const cookie = request.cookies.get(SESSION_CONFIG.SESSION_COOKIE_NAME)
  if (!cookie?.value) {
    return { valid: true } // No metadata = first request or standard session
  }

  const metadata = await decodeMetadata(cookie.value)
  if (!metadata) {
    return { valid: true }
  }

  const now = Date.now()
  if (now - metadata.createdAt > SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS) {
    return { valid: false, reason: 'Session expired (absolute timeout)' }
  }
  if (now - metadata.lastActivity > SESSION_CONFIG.IDLE_TIMEOUT_MS) {
    return { valid: false, reason: 'Session expired (idle timeout)' }
  }

  return { valid: true }
}

// Get recommended Supabase JWT settings (for documentation)
export const RECOMMENDED_JWT_SETTINGS = {
  // Set in Supabase Dashboard > Authentication > Settings
  // JWT expiry: 1 hour (3600 seconds)
  // Refresh token rotation: enabled
  // Refresh token reuse interval: 10 seconds
} as const