import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateSessionActivity } from '@/lib/session-management'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const fullName =
        data.user.user_metadata?.full_name ||
        data.user.user_metadata?.name ||
        data.user.email?.split('@')[0] ||
        'User'

      await supabase.from('users').upsert(
        {
          id: data.user.id,
          full_name: fullName,
          role: 'customer',
          email: data.user.email || null,
        },
        { onConflict: 'id' }
      )

      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle()

      const role = profile?.role || 'customer'
      const destination =
        role === 'super_admin'
          ? '/super-dashboard'
          : role === 'admin'
            ? '/admin-dashboard'
            : next

      await updateSessionActivity(data.user.id)

      return NextResponse.redirect(`${origin}${destination}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Authentication failed. Please try again.')}`)
}
