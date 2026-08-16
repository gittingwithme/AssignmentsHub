

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { AuditActions } from './audit-actions'
import { logSecurityEvent } from './audit-log'
import { sendCustomerEmail } from './email'

/**
 * Credential stuffing detection.
 *
 * Credential stuffing is the automated submission of username/password pairs
 * (typically leaked from other breaches) at scale. Unlike a single-account
 * brute-force attack, it is characterised by:
 *   - Many FAILED logins from ONE IP across MANY DISTINCT user accounts.
 *
 * We detect it on top of the existing `security_audit_log` table, where every
 * `login_failed` event is already recorded with the IP address and the
 * attempted email (in the `details` JSONB).
 *
 * Detection runs inline after each failed login (cheap query: limited + indexed
 * on (action, ip_address, created_at)) and logs a
 * `credential_stuffing_detected` event so it shows up in dashboards/runbooks,
 * and emails the admin a security alert.
 */

// Thresholds — tuned for a single-office SaaS. Cloudflare WAF rate-limiting
// (10 auth req/min/IP) and the DB-backed per-user rate limiter (5/15min) run
// in front of this, so reaching these thresholds implies the attacker is
// rotating identifiers or distributed across allowed IPs.
const STUFFING_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const STUFFING_MAX_FAILED_FROM_IP = 10 // >10 fails/IP in window
const STUFFING_MAX_DISTINCT_ACCOUNTS = 5 // across >5 distinct emails

// Avoid alerting on the same IP repeatedly within a cooldown.
const ALERT_COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes

interface StuffingResult {
  detected: boolean
  reason?: string
  failedFromIp: number
  distinctAccounts: number
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

/**
 * Inspect recent failed logins for the supplied IP and flag a credential
 * stuffing pattern. Safe to call on every failed login — the query is indexed
 * and bounded, and we only emit an alert once per cooldown window per IP.
 */
export async function detectCredentialStuffing(ip: string): Promise<StuffingResult> {
  if (!ip || ip === 'unknown') {
    return { detected: false, failedFromIp: 0, distinctAccounts: 0 }
  }

  const supabase = await getServiceClient()
  const since = new Date(Date.now() - STUFFING_WINDOW_MS).toISOString()

  // Recent failed logins from this IP. Supabase stores the inet column as
  // text, so .eq('ip_address', ip) filters server-side; combined with the
  // (action, created_at) index this is a cheap bounded query on every failed
  // login. Group distinct attempted emails to distinguish brute-force (one
  // account, caught by the per-user limiter) from stuffing (many accounts).
  const { data: ipFailures, error } = await supabase
    .from('security_audit_log')
    .select('details')
    .eq('action', AuditActions.LOGIN_FAILED)
    .eq('ip_address', ip)
    .gte('created_at', since)
    .limit(100)

  if (error) {
    console.error('[credential-stuffing] audit query failed:', error)
    return { detected: false, failedFromIp: 0, distinctAccounts: 0 }
  }

  const emailsFromIp = new Set<string>()
  for (const row of ipFailures ?? []) {
    const email = (row as any).details?.email
    if (typeof email === 'string' && email) emailsFromIp.add(email)
  }
  const failedFromIp = (ipFailures ?? []).length
  const distinctAccounts = emailsFromIp.size

  const tooManyFromIp = failedFromIp > STUFFING_MAX_FAILED_FROM_IP
  const manyAccounts = distinctAccounts > STUFFING_MAX_DISTINCT_ACCOUNTS

  // Stuffing signature: high volume + account rotation.
  // Pure volume (brute force on one account) is caught by the per-user rate
  // limiter; here we additionally require distinct-account spread.
  const detected = manyAccounts && tooManyFromIp

  if (detected) {
    // Cooldown: skip if we already flagged this IP very recently.
    const cooldownSince = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString()
    const { data: recentAlert } = await supabase
      .from('security_audit_log')
      .select('id')
      .eq('action', AuditActions.CREDENTIAL_STUFFING_DETECTED)
      .eq('ip_address', ip)
      .gte('created_at', cooldownSince)
      .limit(1)

    if (recentAlert && recentAlert.length > 0) {
      // Already alerted within cooldown — don't spam.
      return { detected: true, reason: 'cooldown', failedFromIp, distinctAccounts }
    }

    await logSecurityEvent({
      userId: null,
      action: AuditActions.CREDENTIAL_STUFFING_DETECTED,
      details: {
        ip,
        failed_attempts: failedFromIp,
        distinct_accounts: distinctAccounts,
        window_minutes: STUFFING_WINDOW_MS / 60000,
      },
    })

    // Best-effort admin email alert.
    await notifyAdminOfStuffing(ip, failedFromIp, distinctAccounts)
  }

  return {
    detected,
    reason: detected ? 'many_failed_distinct_accounts' : undefined,
    failedFromIp,
    distinctAccounts,
  }
}

async function notifyAdminOfStuffing(ip: string, failedAttempts: number, distinctAccounts: number) {
  const adminEmail =
    process.env.ADMIN_EMAIL || process.env.PAYMENT_APPROVAL_EMAIL || null
  if (!adminEmail) return

  await sendCustomerEmail({
    to: adminEmail,
    subject: `[Security Alert] Credential stuffing detected from ${ip}`,
    heading: 'Credential stuffing attack detected',
    message:
      'A credential stuffing pattern was detected on the login endpoint. ' +
      'Many failed login attempts originating from a single IP address were ' +
      'spread across multiple distinct user accounts — the signature of an ' +
      'automated breach-credential spray, not a single forgotten password.',
    details: [
      { label: 'Source IP', value: ip },
      { label: 'Failed attempts (15 min)', value: String(failedAttempts) },
      { label: 'Distinct accounts targeted', value: String(distinctAccounts) },
      { label: 'Time (UTC)', value: new Date().toISOString() },
    ],
    cta: { label: 'Review security audit log', href: '/admin-dashboard/security' },
  })
}