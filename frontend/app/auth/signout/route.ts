// app/auth/signout/route.ts
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'
import { secureSignOut } from '@/lib/session-management'

export async function POST(req: NextRequest) {
  await secureSignOut()
  revalidatePath('/', 'layout')
  return NextResponse.redirect(new URL('/login', req.url), {
    status: 302,
  })
}