import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const start = Date.now()
  const checks: Record<string, { status: 'ok' | 'degraded' | 'down'; latency?: number; error?: string }> = {
    database: { status: 'down' },
    auth: { status: 'down' },
    storage: { status: 'down' },
  }

  try {
    const supabase = await createClient()
    
    // Database connectivity
    const dbStart = Date.now()
    const { error: dbError } = await supabase.from('users').select('count').limit(1).maybeSingle()
    checks.database = {
      status: dbError ? 'degraded' : 'ok',
      latency: Date.now() - dbStart,
      error: dbError?.message,
    }

    // Auth connectivity
    const authStart = Date.now()
    const { error: authError } = await supabase.auth.getSession()
    checks.auth = {
      status: authError ? 'degraded' : 'ok',
      latency: Date.now() - authStart,
      error: authError?.message,
    }

    // Storage connectivity
    const storageStart = Date.now()
    const { error: storageError } = await supabase.storage.listBuckets()
    checks.storage = {
      status: storageError ? 'degraded' : 'ok',
      latency: Date.now() - storageStart,
      error: storageError?.message,
    }

    const allHealthy = Object.values(checks).every(c => c.status === 'ok')
    const anyDown = Object.values(checks).some(c => c.status === 'down')

    return NextResponse.json(
      {
        status: allHealthy ? 'healthy' : anyDown ? 'down' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks,
      },
      { status: allHealthy ? 200 : anyDown ? 503 : 200 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        status: 'down',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    )
  }
}