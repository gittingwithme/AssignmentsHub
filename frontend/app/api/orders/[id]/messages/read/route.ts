import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle()

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const [{ data: profile }] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
  ])

  const role = profile?.role || 'customer'
  const canAccess = role === 'admin' || role === 'super_admin' || order.user_id === user.id

  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: updateError } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('order_id', id)
    .neq('sender_id', user.id)
    .eq('is_read', false)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}