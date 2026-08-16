import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { challengeMfa } from '@/app/mfa-actions'

export async function POST(request: Request) {
  try {
    const { factorId } = await request.json()

    if (!factorId) {
      return NextResponse.json({ error: 'Factor ID required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the factor belongs to the user
    const { data: factor } = await supabase
      .from('auth.mfa_factors')
      .select('id')
      .eq('id', factorId)
      .eq('user_id', user.id)
      .eq('factor_type', 'totp')
      .eq('status', 'verified')
      .maybeSingle()

    if (!factor) {
      return NextResponse.json({ error: 'Factor not found' }, { status: 404 })
    }

    const result = await challengeMfa(factorId)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ challengeId: result.challengeId })
  } catch (error) {
    console.error('MFA challenge error:', error)
    return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 })
  }
}