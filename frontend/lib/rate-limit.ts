

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const RATE_LIMITS = {
  login: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
  signup: { maxAttempts: 3, windowMs: 60 * 60 * 1000 },
  password_reset: { maxAttempts: 3, windowMs: 60 * 60 * 1000 },
  mfa_verify: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
} as const

type RateLimitType = keyof typeof RATE_LIMITS

async function getClientIdentifier(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

async function getServiceClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {}
        },
      },
    }
  )
}

export async function checkRateLimit(type: RateLimitType): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const supabase = await getServiceClient()
  const clientId = await getClientIdentifier()
  const config = RATE_LIMITS[type]

  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  const identifier = user?.id || clientId

  const key = `rate_limit_${type}_${identifier}`
  const now = new Date()
  const windowStart = new Date(now.getTime() - config.windowMs)

  const { data: existing } = await supabase
    .from('rate_limits')
    .select('attempts, first_attempt_at')
    .eq('key', key)
    .maybeSingle()

  if (existing) {
    const firstAttemptAt = new Date(existing.first_attempt_at)
    
    if (firstAttemptAt < windowStart) {
      await supabase
        .from('rate_limits')
        .upsert({ key, attempts: 1, first_attempt_at: now.toISOString() })
      return { allowed: true, remaining: config.maxAttempts - 1, resetAt: new Date(now.getTime() + config.windowMs) }
    }

    if (existing.attempts >= config.maxAttempts) {
      const resetAt = new Date(firstAttemptAt.getTime() + config.windowMs)
      return { allowed: false, remaining: 0, resetAt }
    }

    await supabase
      .from('rate_limits')
      .update({ attempts: existing.attempts + 1 })
      .eq('key', key)

    return { allowed: true, remaining: config.maxAttempts - existing.attempts - 1, resetAt: new Date(firstAttemptAt.getTime() + config.windowMs) }
  }

  await supabase
    .from('rate_limits')
    .insert({ key, attempts: 1, first_attempt_at: now.toISOString() })

  return { allowed: true, remaining: config.maxAttempts - 1, resetAt: new Date(now.getTime() + config.windowMs) }
}

export async function clearRateLimitOnSuccess(type: RateLimitType): Promise<void> {
  const supabase = await getServiceClient()
  const clientId = await getClientIdentifier()
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  const identifier = user?.id || clientId
  const key = `rate_limit_${type}_${identifier}`

  await supabase.from('rate_limits').delete().eq('key', key)
}
