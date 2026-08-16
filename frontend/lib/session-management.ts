import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

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

export async function getSessionMetadata(): Promise<SessionMetadata | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_CONFIG.SESSION_COOKIE_NAME)
  
  if (!cookie?.value) return null
  
  try {
    return JSON.parse(cookie.value) as SessionMetadata
  } catch {
    return null
  }
}

export async function updateSessionActivity(userId: string): Promise<void> {
  const cookieStore = await cookies()
  const metadata: SessionMetadata = {
    createdAt: Date.now(),
    lastActivity: Date.now(),
    userId,
  }
  
  cookieStore.set(SESSION_CONFIG.SESSION_COOKIE_NAME, JSON.stringify(metadata), {
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
    cookieStore.set(SESSION_CONFIG.SESSION_COOKIE_NAME, JSON.stringify(metadata), {
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
  const supabase = await createClient()
  
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    await supabase.auth.signOut()
  }
  
  await clearSession()
}

// Middleware helper to validate session
export async function validateSessionInMiddleware(
  supabase: ReturnType<typeof createServerClient>
): Promise<{ valid: boolean; userId?: string; reason?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { valid: false, reason: 'No authenticated user' }
  }
  
  const timeoutCheck = await checkSessionTimeout()
  if (!timeoutCheck.valid) {
    return { valid: false, reason: timeoutCheck.reason, userId: user.id }
  }
  
  await refreshSessionActivity()
  return { valid: true, userId: user.id }
}

// Get recommended Supabase JWT settings (for documentation)
export const RECOMMENDED_JWT_SETTINGS = {
  // Set in Supabase Dashboard > Authentication > Settings
  // JWT expiry: 1 hour (3600 seconds)
  // Refresh token rotation: enabled
  // Refresh token reuse interval: 10 seconds
} as const