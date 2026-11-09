// app/auth/signout/route.ts
import { revalidatePath } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'
import { secureSignOut, SESSION_CONFIG } from '@/lib/session-management'

export async function POST(req: NextRequest) {
  await secureSignOut()
  revalidatePath('/', 'layout')
  const loginUrl = new URL('/login', req.url)
  const res = NextResponse.redirect(loginUrl, {
    status: 302,
  })
  res.cookies.delete(SESSION_CONFIG.SESSION_COOKIE_NAME)
  return res
}

export async function GET(req: NextRequest) {
  return POST(req)
}