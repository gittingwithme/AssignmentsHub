// lib/supabase/server.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

const isProduction = process.env.NODE_ENV === 'production'

// Notice we added 'async' here
export async function createClient() {
  // And we added 'await' here
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                secure: isProduction,
                sameSite: 'lax' as CookieOptions['sameSite'],
                path: '/',
              } as CookieOptions)
            })
          } catch {
            // Safe to ignore: Next.js throws this when setting cookies from a Server Component
          }
        },
      },
    }
  )
}

// Service role client for admin operations (bypasses RLS)
export async function createServiceClient() {
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
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                secure: isProduction,
                sameSite: 'lax' as CookieOptions['sameSite'],
                path: '/',
              } as CookieOptions)
            })
          } catch {
            // Safe to ignore: Next.js throws this when setting cookies from a Server Component
          }
        },
      },
    }
  )
}