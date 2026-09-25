'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, clearRateLimitOnSuccess } from '@/lib/rate-limit'
import { verifyTurnstileToken } from '@/lib/turnstile-server'
import { validatePassword } from '@/lib/password-validation'
import { validatePasswordNotPwned } from '@/lib/pwned-passwords'
import { logAuthEvent, logSecurityEvent } from '@/lib/audit-log'
import { AuditActions } from '@/lib/audit-actions'
import { detectCredentialStuffing } from '@/lib/credential-stuffing-monitor'
import { updateSessionActivity } from '@/lib/session-management'
import { sanitizeUserInput, sanitizeRichText } from '@/lib/sanitize'
import { challengeMfa } from '@/app/mfa-actions'

export async function getRedirectPathForUser(userId: string) {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  const role = profile?.role || 'customer'

  if (role === 'super_admin') return '/super-dashboard'
  if (role === 'admin') return '/admin-dashboard'
  return '/dashboard'
}

async function getClientIpForAuth(): Promise<string | null> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
}

async function hasVerifiedMfaFactor(userId: string): Promise<{ factorId?: string; hasMfa: boolean }> {
  const supabase = await createClient()
  const { data: factors } = await supabase
    .from('auth.mfa_factors')
    .select('id, factor_type, status')
    .eq('user_id', userId)
    .eq('factor_type', 'totp')
    .eq('status', 'verified')

  if (factors && factors.length > 0) {
    return { factorId: factors[0].id, hasMfa: true }
  }
  return { hasMfa: false }
}

async function getSiteOrigin() {
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') || headerStore.get('host')
  const protocol = headerStore.get('x-forwarded-proto') || 'http'
  if (host) return `${protocol}://${host}`
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
}

export async function login(formData: FormData) {
  const rateCheck = await checkRateLimit('login')
  if (!rateCheck.allowed) {
    const waitMinutes = Math.ceil((rateCheck.resetAt.getTime() - Date.now()) / 60000)
    redirect('/login?error=' + encodeURIComponent(`Too many attempts. Try again in ${waitMinutes} minutes.`))
  }

  const turnstileToken = String(formData.get('cf-turnstile-response') || '')
  const turnstileResult = await verifyTurnstileToken(turnstileToken)
  if (!turnstileResult.success) {
    redirect('/login?error=' + encodeURIComponent(turnstileResult.error || 'Captcha verification failed'))
  }

  const supabase = await createClient()
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    await logAuthEvent(AuditActions.LOGIN_FAILED, null, { email, error: error.message })
    // Credential-stuffing detection: run before redirect() (which throws) so the
    // inline check always completes. Best-effort — must never block login flow.
    try {
      const ip = await getClientIpForAuth()
      if (ip) await detectCredentialStuffing(ip)
    } catch (e) {
      console.error('[auth] credential stuffing detection failed:', e)
    }
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  await logAuthEvent(AuditActions.LOGIN_SUCCESS, data.user.id, { email })

  // Check if user has MFA enabled — if so, require TOTP challenge before session is usable
  const mfaCheck = await hasVerifiedMfaFactor(data.user.id)
  if (mfaCheck.hasMfa && mfaCheck.factorId) {
    const challenge = await challengeMfa(mfaCheck.factorId)
    if (challenge.challengeId) {
      // Store the challenge so the verify step can complete it
      await logSecurityEvent({
        userId: data.user.id,
        action: AuditActions.MFA_CHALLENGE_CREATED,
        details: { factorId: mfaCheck.factorId },
      })
      await clearRateLimitOnSuccess('login')
      revalidatePath('/', 'layout')
      redirect(
        `/login/mfa?factorId=${encodeURIComponent(mfaCheck.factorId)}&challengeId=${encodeURIComponent(challenge.challengeId)}`
      )
    }
  }

  await clearRateLimitOnSuccess('login')
  await updateSessionActivity(data.user.id)
  revalidatePath('/', 'layout')
  redirect(await getRedirectPathForUser(data.user.id))
}

export async function signup(formData: FormData) {
  const rateCheck = await checkRateLimit('signup')
  if (!rateCheck.allowed) {
    const waitMinutes = Math.ceil((rateCheck.resetAt.getTime() - Date.now()) / 60000)
    redirect('/sign-up?error=' + encodeURIComponent(`Too many attempts. Try again in ${waitMinutes} minutes.`))
  }

  const turnstileToken = String(formData.get('cf-turnstile-response') || '')
  const turnstileResult = await verifyTurnstileToken(turnstileToken)
  if (!turnstileResult.success) {
    redirect('/sign-up?error=' + encodeURIComponent(turnstileResult.error || 'Captcha verification failed'))
  }

  const supabase = await createClient()
  const fullName = sanitizeUserInput(String(formData.get('full_name') || ''))
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')

  if (!fullName) {
    redirect('/sign-up?error=' + encodeURIComponent('Full name is required.'))
  }

  const passwordValidation = validatePassword(password, email, fullName)
  if (!passwordValidation.valid) {
    redirect('/sign-up?error=' + encodeURIComponent(passwordValidation.errors[0]))
  }

  const pwnedCheck = await validatePasswordNotPwned(password)
  if (!pwnedCheck.valid) {
    redirect('/sign-up?error=' + encodeURIComponent(pwnedCheck.error || 'Password has been compromised'))
  }

  const origin = await getSiteOrigin()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { full_name: fullName },
    },
  })

  if (error) {
    await logAuthEvent(AuditActions.SIGNUP_FAILED, null, { email, error: error.message })
    redirect('/sign-up?error=' + encodeURIComponent(error.message))
  }

  if (data.user) {
    const { error: upsertError } = await supabase.from('users').upsert(
      {
        id: data.user.id,
        full_name: fullName,
        role: 'customer',
        email: data.user.email || null,
      },
      { onConflict: 'id' }
    )

    if (upsertError) {
      redirect('/sign-up?error=' + encodeURIComponent(upsertError.message))
    }

    await logAuthEvent(AuditActions.SIGNUP_SUCCESS, data.user.id, { email, fullName })
  }

  await clearRateLimitOnSuccess('signup')
  if (data.session?.user?.id) {
    await updateSessionActivity(data.session.user.id)
  }
  revalidatePath('/', 'layout')

  if (data.session?.user?.id) {
    redirect('/dashboard')
  }

  redirect('/login?message=' + encodeURIComponent('Check your email to confirm your account before signing in.'))
}

export async function signInWithGoogle() {
  const supabase = await createClient()
  const origin = await getSiteOrigin()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  if (data.url) {
    redirect(data.url)
  }

  redirect('/login?error=' + encodeURIComponent('Could not start Google sign-in.'))
}

export async function requestPasswordReset(formData: FormData) {
  const rateCheck = await checkRateLimit('password_reset')
  if (!rateCheck.allowed) {
    const waitMinutes = Math.ceil((rateCheck.resetAt.getTime() - Date.now()) / 60000)
    redirect('/forgot-password?error=' + encodeURIComponent(`Too many requests. Try again in ${waitMinutes} minutes.`))
  }

  const turnstileToken = String(formData.get('cf-turnstile-response') || '')
  const turnstileResult = await verifyTurnstileToken(turnstileToken)
  if (!turnstileResult.success) {
    redirect('/forgot-password?error=' + encodeURIComponent(turnstileResult.error || 'Captcha verification failed'))
  }

  const supabase = await createClient()
  const email = String(formData.get('email') || '').trim().toLowerCase()

  if (!email) {
    redirect('/forgot-password?error=' + encodeURIComponent('Email is required.'))
  }

  const origin = await getSiteOrigin()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  })

  if (error) {
    await logAuthEvent(AuditActions.PASSWORD_RESET_REQUESTED, null, { email, error: error.message, success: false })
    redirect('/forgot-password?error=' + encodeURIComponent(error.message))
  }

  // Always return success message (don't reveal if email exists)
  await logAuthEvent(AuditActions.PASSWORD_RESET_REQUESTED, null, { email, success: true })
  await clearRateLimitOnSuccess('password_reset')
  redirect('/forgot-password?message=' + encodeURIComponent('If an account exists for this email, a reset link has been sent.'))
}

export async function confirmPasswordReset(formData: FormData) {
  const supabase = await createClient()

  const password = String(formData.get('password') || '')
  const confirmPassword = String(formData.get('confirm_password') || '')

  if (password !== confirmPassword) {
    redirect(`/reset-password?error=${encodeURIComponent('Passwords do not match.')}`)
  }

  const passwordValidation = validatePassword(password, '', '')
  if (!passwordValidation.valid) {
    redirect(`/reset-password?error=${encodeURIComponent(passwordValidation.errors[0])}`)
  }

  const pwnedCheck = await validatePasswordNotPwned(password)
  if (!pwnedCheck.valid) {
    redirect(`/reset-password?error=${encodeURIComponent(pwnedCheck.error || 'Password has been compromised. Please choose a different password.')}`)
  }

  const { data: { user }, error } = await supabase.auth.updateUser({ password })

  if (error) {
    await logAuthEvent(AuditActions.PASSWORD_RESET_COMPLETED, user?.id || null, { error: error.message, success: false })
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`)
  }

  if (user) {
    await logAuthEvent(AuditActions.PASSWORD_RESET_COMPLETED, user.id, { success: true })
  }

  revalidatePath('/', 'layout')
  redirect('/login?message=' + encodeURIComponent('Password updated successfully. Please sign in with your new password.'))
}
