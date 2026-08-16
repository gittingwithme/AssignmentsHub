import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServiceClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Query the auth.sessions table directly (admin API lacks listUserSessions)
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const currentSession = await supabase.auth.getSession()
    const accessToken = currentSession.data.session?.access_token
    let currentSessionId: string | undefined = undefined
    if (accessToken) {
      try {
        const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString())
        currentSessionId = payload.session_id
      } catch {}
    }

    const formattedSessions = (sessions || []).map((session: { id: string; user_agent?: string; ip?: string | null; refreshed_at?: string | null; created_at: string }) => {
      const ua = parseUserAgent(session.user_agent)
      return {
        id: session.id,
        device: ua.device,
        browser: ua.browser,
        ip: session.ip || 'Unknown IP',
        lastActive: session.refreshed_at || session.created_at,
        isCurrent: session.id === currentSessionId,
      }
    })

    return NextResponse.json({ sessions: formattedSessions })
  } catch (error) {
    console.error('Failed to fetch sessions:', error)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Ensure the session belongs to the current user
    const { data: target, error: lookupError } = await supabase
      .from('sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .maybeSingle()

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 400 })
    }

    if (!target || target.user_id !== user.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Delete the session directly from auth.sessions
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to revoke session:', error)
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 })
  }
}

// Lightweight user-agent parser for display purposes
function parseUserAgent(ua?: string): { device: string; browser: string } {
  if (!ua) return { device: 'Unknown Device', browser: 'Unknown Browser' }

  let browser = 'Unknown Browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  let device = 'Desktop'
  if (/iPhone/.test(ua)) device = 'iPhone'
  else if (/iPad/.test(ua)) device = 'iPad'
  else if (/Android/.test(ua)) device = 'Android'
  else if (/Windows/.test(ua)) device = 'Windows'
  else if (/Mac OS/.test(ua)) device = 'Mac'
  else if (/Linux/.test(ua)) device = 'Linux'

  return { device, browser }
}
