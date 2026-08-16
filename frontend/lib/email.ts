import { Resend } from 'resend'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'AssignmentsHub <onboarding@resend.dev>'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export type CustomerEmailDetail = { label: string; value: string }

export type CustomerEmailPayload = {
  to: string
  subject: string
  heading: string
  message?: string
  details?: CustomerEmailDetail[]
  cta?: { label: string; href: string }
}

export function customerOrderUrl(orderId: string) {
  return `${SITE_URL}/dashboard/orders/${orderId}`
}

export function customerSubscriptionUrl() {
  return `${SITE_URL}/dashboard/subscription`
}

/**
 * Resolve a user's email for notifications. Prefers the denormalized
 * `users.email` column (populated at signup + OAuth callback), then falls
 * back to `auth.users` via the service-role client so pre-migration users
 * still get mail once the real service key is configured.
 */
export async function getCustomerEmail(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle()
    if (data?.email) return data.email
  } catch (error) {
    console.error('[email] users.email lookup failed:', error)
  }

  try {
    const service = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() {
            return []
          },
          setAll() {},
        },
      }
    )
    const { data: authUser } = await service.auth.admin.getUserById(userId)
    if (authUser?.user?.email) return authUser.user.email
  } catch (error) {
    console.error('[email] auth.users fallback failed:', error)
  }

  return null
}

function esc(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function wrapEmailHtml({ heading, message, details, cta }: CustomerEmailPayload) {
  const detailRows = (details ?? [])
    .map(
      (d) => `
        <tr>
          <td style="padding:6px 12px 6px 0;font-size:13px;color:#73807a;white-space:nowrap">${esc(d.label)}</td>
          <td style="padding:6px 0;font-size:13px;color:#16211d;font-weight:600">${esc(d.value)}</td>
        </tr>`
    )
    .join('')

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px">
      <div style="background:#ffffff;border:1px solid #e2e8e5;border-radius:16px;overflow:hidden">
        <div style="background:#0E765E;padding:18px 28px">
          <span style="color:#ffffff;font-weight:700;font-size:16px;letter-spacing:0.01em">AssignmentsHub</span>
        </div>
        <div style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f1714">${esc(heading)}</h1>
          ${message ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#3f4a45">${esc(message)}</p>` : ''}
          ${details && details.length > 0 ? `<table style="border-collapse:collapse;margin:4px 0 8px">${detailRows}</table>` : ''}
          ${cta ? `<a href="${esc(cta.href)}" style="display:inline-block;margin-top:16px;background:#19B98A;color:#04140E;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;font-size:14px">${esc(cta.label)}</a>` : ''}
        </div>
        <div style="padding:16px 28px;border-top:1px solid #e2e8e5;font-size:12px;color:#8a958f;line-height:1.6">
          Academic support, delivered with integrity.<br />If you did not expect this email, you can safely ignore it.
        </div>
      </div>
    </div>
  </body>
</html>`
}

/** Best-effort send — never throws, logs instead. */
export async function sendCustomerEmail(
  payload: CustomerEmailPayload
): Promise<boolean> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY missing — skipping customer email:', payload.subject)
    return false
  }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: payload.to,
      subject: payload.subject,
      html: wrapEmailHtml(payload),
    })
    return true
  } catch (error) {
    console.error('[email] Failed to send customer email:', error)
    return false
  }
}

/** Resolve the user's address and send; returns false if no address. */
export async function notifyCustomer(
  userId: string,
  payload: Omit<CustomerEmailPayload, 'to'>
): Promise<boolean> {
  const to = await getCustomerEmail(userId)
  if (!to) {
    console.warn('[email] No email address for user', userId, '— skipping', payload.subject)
    return false
  }
  return sendCustomerEmail({ ...payload, to })
}
