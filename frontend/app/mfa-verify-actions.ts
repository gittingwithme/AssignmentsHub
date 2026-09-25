'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { logSecurityEvent } from '@/lib/audit-log'
import { AuditActions } from '@/lib/audit-actions'
import { verifyMfa, verifyBackupCode } from '@/app/mfa-actions'
import { getRedirectPathForUser } from '@/app/auth-actions'

/**
 * Completes the 2FA step of the login flow.
 *
 * The user has already authenticated with email + password (an aal1 session
 * exists from `login()`), then was redirected here with a pending TOTP
 * challenge. We verify the code against Supabase Auth (which upgrades the
 * session to aal2), or accept a one-time backup code. Either path only
 * finishes login after proof of the second factor.
 */
export async function verifyLoginMfa(formData: FormData) {
  const rateCheck = await checkRateLimit('mfa_verify')
  if (!rateCheck.allowed) {
    const waitMinutes = Math.ceil((rateCheck.resetAt.getTime() - Date.now()) / 60000)
    redirect(
      '/login/mfa?error=' +
        encodeURIComponent(`Too many attempts. Try again in ${waitMinutes} minutes.`)
    )
  }

  const factorId = String(formData.get('factorId') || '')
  const challengeId = String(formData.get('challengeId') || '')
  const code = String(formData.get('code') || '').trim()
  const useBackup = String(formData.get('useBackup') || '') === 'true'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  if (!factorId || !challengeId || !code) {
    redirect(
      '/login/mfa?error=' + encodeURIComponent('Missing MFA verification details. Please sign in again.')
    )
  }

  if (useBackup) {
    const backupResult = await verifyBackupCode(code)
    if (!backupResult.success) {
      redirect('/login/mfa?error=' + encodeURIComponent(backupResult.error || 'Invalid backup code'))
    }

    await logSecurityEvent({
      userId: user.id,
      action: AuditActions.MFA_VERIFIED,
      details: { method: 'backup_code', factorId },
    })

    redirect(await getRedirectPathForUser(user.id))
  }

  const result = await verifyMfa(factorId, code, challengeId)
  if (!result.success) {
    redirect('/login/mfa?error=' + encodeURIComponent(result.error || 'Invalid verification code'))
  }

  await logSecurityEvent({
    userId: user.id,
    action: AuditActions.MFA_VERIFIED,
    details: { method: 'totp', factorId },
  })

  redirect(await getRedirectPathForUser(user.id))
}
