import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { validateSessionInProxy, SESSION_CONFIG } from '@/lib/session-management'
import { checkApiRateLimit, cleanupApiRateLimitStore } from '@/lib/api-rate-limit'

// Simple request metrics (in production, use a proper metrics collector)
const metrics = {
  requests: 0,
  errors: 0,
  latencies: [] as number[],
}

function recordMetric(latency: number, isError: boolean = false) {
  metrics.requests++
  if (isError) metrics.errors++
  metrics.latencies.push(latency)
  if (metrics.latencies.length > 1000) metrics.latencies.shift()
}

const DEFAULT_MAINTENANCE = {
  maintenance_enabled: false,
  maintenance_title: 'Under Maintenance',
  maintenance_description:
    'AssignmentsHub is temporarily unavailable while we perform upgrades. Please check back soon.',
}

async function fetchMaintenanceSettings(
  supabase: ReturnType<typeof createServerClient>
) {
  try {
    const { data } = await supabase
      .from('platform_settings')
      .select('maintenance_enabled, maintenance_title, maintenance_description')
      .eq('id', 'global')
      .maybeSingle()

    if (!data) return DEFAULT_MAINTENANCE

    return {
      maintenance_enabled: !!data.maintenance_enabled,
      maintenance_title: data.maintenance_title || DEFAULT_MAINTENANCE.maintenance_title,
      maintenance_description:
        data.maintenance_description || DEFAULT_MAINTENANCE.maintenance_description,
    }
  } catch {
    return DEFAULT_MAINTENANCE
  }
}

export async function proxy(request: NextRequest) {
  const startTime = Date.now()
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          const isProduction = process.env.NODE_ENV === 'production'
          const secureOptions: CookieOptions = {
            ...options,
            httpOnly: true,
            secure: isProduction,
            sameSite: options.sameSite || 'lax',
            path: options.path || '/',
          }
          request.cookies.set({ name, value, ...secureOptions })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...secureOptions })
        },
        remove(name: string, options: CookieOptions) {
          const isProduction = process.env.NODE_ENV === 'production'
          const secureOptions: CookieOptions = {
            ...options,
            httpOnly: true,
            secure: isProduction,
            sameSite: options.sameSite || 'lax',
            path: options.path || '/',
          }
          request.cookies.set({ name, value: '', ...secureOptions })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...secureOptions })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const url = request.nextUrl.clone()
  const path = url.pathname

  // ── General API rate limiting (beyond auth-specific limits) ──
  if (path.startsWith('/api/')) {
    const clientId =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'
    const rateResult = checkApiRateLimit(clientId, path)

    // Periodic cleanup (every ~1000 requests)
    if (metrics.requests % 1000 === 0) {
      cleanupApiRateLimitStore()
    }

    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateResult.resetAt - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': rateResult.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateResult.resetAt.toString(),
          },
        }
      )
    }
  }

  // Session timeout validation
  if (user) {
    const sessionCheck = await validateSessionInProxy(supabase)
    if (!sessionCheck.valid) {
      // Session expired - redirect to login
      await supabase.auth.signOut()
      url.pathname = '/login'
      const errorMsg = sessionCheck.reason || 'Session expired'
      url.searchParams.set('error', encodeURIComponent(errorMsg))
      return NextResponse.redirect(url)
    }
  }

  const isPublicRoute =
    path === '/' ||
    path.startsWith('/login') ||
    path.startsWith('/sign-up') ||
    path.startsWith('/services') ||
    path.startsWith('/plans') ||
    path.startsWith('/one-time-work') ||
    path.startsWith('/how-it-works') ||
    path.startsWith('/faq') ||
    path.startsWith('/contact') ||
    path.startsWith('/terms') ||
    path.startsWith('/privacy') ||
    path.startsWith('/refund-policy') ||
    path.startsWith('/revision-policy') ||
    path.startsWith('/academic-integrity') ||
    path.startsWith('/maintenance') ||
    path.startsWith('/forgot-password') ||
    path.startsWith('/reset-password')

  const isAuthBypassRoute =
    path.startsWith('/auth/callback') ||
    path.startsWith('/auth/signout') ||
    path.startsWith('/auth/confirm')

  const maintenanceSettings = await fetchMaintenanceSettings(supabase)

  if (maintenanceSettings.maintenance_enabled && !isAuthBypassRoute) {
    let role = 'customer'

    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      role = profile?.role || 'customer'
    }

    const isSuperAdmin = role === 'super_admin'

    if (!isSuperAdmin) {
      const shouldGate =
        !!user ||
        !isPublicRoute ||
        path.startsWith('/dashboard') ||
        path.startsWith('/admin-dashboard') ||
        path.startsWith('/admin') ||
        path.startsWith('/super-dashboard') ||
        path.startsWith('/super-admin')

      if (shouldGate && path !== '/maintenance') {
        url.pathname = '/maintenance'
        return NextResponse.redirect(url)
      }
    }
  }

  const isPublicApiRoute =
    path.startsWith('/api/health') ||
    path.startsWith('/api/metrics')

  if (!user && !isPublicRoute && !isAuthBypassRoute && !isPublicApiRoute) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const role = profile?.role || 'customer'

    if ((path.startsWith('/admin-dashboard') || path.startsWith('/admin')) && role === 'customer') {
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    if ((path.startsWith('/super-dashboard') || path.startsWith('/super-admin')) && role !== 'super_admin') {
      url.pathname = role === 'admin' ? '/admin-dashboard' : '/dashboard'
      return NextResponse.redirect(url)
    }

    if (path === '/login' || path === '/sign-up') {
      url.pathname =
        role === 'super_admin'
          ? '/super-dashboard'
          : role === 'admin'
            ? '/admin-dashboard'
            : '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  const latency = Date.now() - startTime
  recordMetric(latency, false)
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
