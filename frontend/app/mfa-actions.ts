'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

export async function enrollMfa(): Promise<{ qrCode?: string; secret?: string; uri?: string; factorId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  try {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator App',
    })

    if (error) {
      return { error: error.message }
    }

    return {
      qrCode: data.totp?.qr_code,
      secret: data.totp?.secret,
      uri: data.totp?.uri,
      factorId: data.id, // The factor ID is returned directly
    }
  } catch (error) {
    return { error: 'Failed to enroll MFA' }
  }
}

export async function verifyMfa(factorId: string, code: string, challengeId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  try {
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: 'Failed to verify MFA' }
  }
}

export async function challengeMfa(factorId: string): Promise<{ challengeId?: string; error?: string }> {
  const supabase = await createClient()
  
  try {
    const { data, error } = await supabase.auth.mfa.challenge({
      factorId,
    })

    if (error) {
      return { error: error.message }
    }

    return { challengeId: data.id }
  } catch (error) {
    return { error: 'Failed to create MFA challenge' }
  }
}

export async function unenrollMfa(factorId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  try {
    const { error } = await supabase.auth.mfa.unenroll({
      factorId,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: 'Failed to unenroll MFA' }
  }
}

export async function listMfaFactors(): Promise<{ factors?: any[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  try {
    const { data, error } = await supabase.auth.mfa.listFactors()

    if (error) {
      return { error: error.message }
    }

    return { factors: data.all }
  } catch (error) {
    return { error: 'Failed to list MFA factors' }
  }
}

export async function getBackupCodes(): Promise<{ codes?: string[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  try {
    const { data, error } = await supabase
      .from('mfa_backup_codes')
      .select('code_hash')
      .eq('user_id', user.id)
      .eq('used', false)

    if (error) {
      return { error: error.message }
    }

    // In production, we'd store hashed codes and verify against hashes
    // For now, return placeholder
    return { codes: data?.map((d) => d.code_hash) || [] }
  } catch (error) {
    return { error: 'Failed to get backup codes' }
  }
}

export async function generateBackupCodes(): Promise<{ codes?: string[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  try {
    // Generate 10 backup codes
    const codes = Array.from({ length: 10 }, () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    })

    // Hash codes for storage (using simple hash for demo - use bcrypt in production)
    const crypto = await import('crypto')
    const codeHashes = codes.map(code => crypto.createHash('sha256').update(code).digest('hex'))

    // Delete old unused codes
    await supabase
      .from('mfa_backup_codes')
      .delete()
      .eq('user_id', user.id)
      .eq('used', false)

    // Insert new codes
    const { error } = await supabase
      .from('mfa_backup_codes')
      .insert(
        codeHashes.map(hash => ({
          user_id: user.id,
          code_hash: hash,
          used: false,
        }))
      )

    if (error) {
      return { error: error.message }
    }

    return { codes }
  } catch (error) {
    return { error: 'Failed to generate backup codes' }
  }
}

export async function verifyBackupCode(code: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    const crypto = await import('crypto')
    const codeHash = crypto.createHash('sha256').update(code).digest('hex')

    const { data, error } = await supabase
      .from('mfa_backup_codes')
      .select('id')
      .eq('user_id', user.id)
      .eq('code_hash', codeHash)
      .eq('used', false)
      .maybeSingle()

    if (error) {
      return { success: false, error: error.message }
    }

    if (!data) {
      return { success: false, error: 'Invalid or already used backup code' }
    }

    // Mark code as used
    await supabase
      .from('mfa_backup_codes')
      .update({ used: true, used_at: new Date().toISOString() })
      .eq('id', data.id)

    return { success: true }
  } catch (error) {
    return { success: false, error: 'Failed to verify backup code' }
  }
}