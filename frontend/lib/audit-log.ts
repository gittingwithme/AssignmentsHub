

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { headers } from 'next/headers'
import { AuditActions, type AuditAction } from './audit-actions'

interface AuditLogEntry {
  userId: string | null
  action: string
  details?: Record<string, any>
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

async function getClientInfo() {
  const h = await headers()
  return {
    ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null,
    userAgent: h.get('user-agent') || null,
  }
}

export async function logSecurityEvent(entry: AuditLogEntry): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getServiceClient()
    const { ipAddress, userAgent } = await getClientInfo()

    const { error } = await supabase.from('security_audit_log').insert({
      user_id: entry.userId,
      action: entry.action,
      details: entry.details || {},
      ip_address: ipAddress,
      user_agent: userAgent,
    })

    if (error) {
      console.error('Failed to log security event:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to log security event:', error)
    return { success: false, error: 'Failed to log security event' }
  }
}

export async function logAuthEvent(
  action: 'login_success' | 'login_failed' | 'signup_success' | 'signup_failed' | 'logout' | 'password_reset_requested' | 'password_reset_completed',
  userId: string | null,
  details?: Record<string, any>
): Promise<void> {
  await logSecurityEvent({ userId, action, details })
}

export async function logAdminEvent(
  action: 'admin_action' | 'order_status_changed' | 'order_file_uploaded' | 'payment_approved' | 'payment_rejected' | 'settings_changed' | 'user_role_changed',
  userId: string,
  details: Record<string, any>
): Promise<void> {
  await logSecurityEvent({ userId, action, details })
}

export async function logMfaEvent(
  action: 'mfa_enrolled' | 'mfa_verified' | 'mfa_unenrolled' | 'mfa_challenged',
  userId: string,
  details?: Record<string, any>
): Promise<void> {
  await logSecurityEvent({ userId, action, details })
}