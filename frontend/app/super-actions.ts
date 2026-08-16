'use server'

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getAdminClient() {
  return createServerClient(
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
}

async function requireSuperAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'super_admin') {
    throw new Error('Forbidden')
  }

  return user
}

export async function updateUserRole(formData: FormData) {
  await requireSuperAdmin()
  const adminSupabase = await getAdminClient()

  const userId = String(formData.get('user_id') || '')
  const newRole = String(formData.get('role') || '')

  if (!userId || !['customer', 'admin', 'super_admin'].includes(newRole)) {
    throw new Error('Invalid role update request.')
  }

  const { error } = await adminSupabase
    .from('users')
    .update({ role: newRole })
    .eq('id', userId)

  if (error) {
    console.error('Failed to update role:', error)
    throw new Error(error.message)
  }

  revalidatePath('/super-dashboard')
  revalidatePath('/admin-dashboard')
}

export async function searchUsers(query: string) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const trimmed = query.trim()

  let builder = supabase
    .from('users')
    .select('id, full_name, role')
    .order('full_name', { ascending: true })
    .limit(50)

  if (trimmed) {
    builder = builder.or(`full_name.ilike.%${trimmed}%,id.ilike.%${trimmed}%`)
  }

  const { data, error } = await builder

  if (error) {
    console.error('Failed to search users:', error)
    return []
  }

  return data ?? []
}

export async function updatePlanPrice(formData: FormData) {
  await requireSuperAdmin()
  const adminSupabase = await getAdminClient()

  const planId = String(formData.get('plan_id') || '')
  const price = Number(formData.get('price') || 0)

  if (!planId || Number.isNaN(price) || price < 0) {
    throw new Error('Invalid plan price payload.')
  }

  const { error } = await adminSupabase
    .from('pricing_plans')
    .update({ price })
    .eq('id', planId)

  if (error) {
    console.error('Failed to update pricing plan:', error)
    throw new Error(error.message)
  }

  revalidatePath('/super-dashboard')
}

export async function updatePayoutSettings(formData: FormData) {
  const actingUser = await requireSuperAdmin()
  const adminSupabase = await getAdminClient()

  const accountHolderName = String(formData.get('account_holder_name') || '').trim()
  const iban = String(formData.get('iban') || '').trim()
  const bicSwift = String(formData.get('bic_swift') || '').trim()
  const bankName = String(formData.get('bank_name') || '').trim()
  const paymentReferenceInstructions = String(
    formData.get('payment_reference_instructions') || ''
  ).trim()
  const billingSupportNote = String(formData.get('billing_support_note') || '').trim()

  if (!accountHolderName || !iban || !bankName) {
    throw new Error('Account holder name, IBAN, and bank name are required.')
  }

  const { data: existing } = await adminSupabase
    .from('payout_settings')
    .select('id')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await adminSupabase
      .from('payout_settings')
      .update({
        account_holder_name: accountHolderName,
        iban,
        bic_swift: bicSwift || null,
        bank_name: bankName,
        payment_reference_instructions: paymentReferenceInstructions || null,
        billing_support_note: billingSupportNote || null,
        updated_at: new Date().toISOString(),
        updated_by: actingUser.id,
      })
      .eq('id', existing.id)

    if (error) throw new Error(error.message)
  } else {
    const { error } = await adminSupabase.from('payout_settings').insert({
      account_holder_name: accountHolderName,
      iban,
      bic_swift: bicSwift || null,
      bank_name: bankName,
      payment_reference_instructions: paymentReferenceInstructions || null,
      billing_support_note: billingSupportNote || null,
      updated_by: actingUser.id,
      is_active: true,
    })

    if (error) throw new Error(error.message)
  }

  revalidatePath('/dashboard')
  revalidatePath('/super-dashboard')
}

export async function updateMaintenanceSettings(formData: FormData) {
  const actingUser = await requireSuperAdmin()
  const adminSupabase = await getAdminClient()

  const maintenanceEnabled = formData.get('maintenance_enabled') === 'on'
  const maintenanceTitle = String(formData.get('maintenance_title') || '').trim()
  const maintenanceDescription = String(formData.get('maintenance_description') || '').trim()

  if (!maintenanceTitle || !maintenanceDescription) {
    throw new Error('Maintenance title and description are required.')
  }

  const { error } = await adminSupabase
    .from('platform_settings')
    .upsert(
      {
        id: 'global',
        maintenance_enabled: maintenanceEnabled,
        maintenance_title: maintenanceTitle,
        maintenance_description: maintenanceDescription,
        updated_at: new Date().toISOString(),
        updated_by: actingUser.id,
      },
      { onConflict: 'id' }
    )

  if (error) throw new Error(error.message)

  revalidatePath('/super-dashboard')
  revalidatePath('/maintenance')
  revalidatePath('/', 'layout')
}