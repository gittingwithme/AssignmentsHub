'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sanitizeRichText } from '@/lib/sanitize'

export async function sendOrderMessage(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const orderId = String(formData.get('order_id') || '')
  const body = sanitizeRichText(String(formData.get('body') || ''))
  const replyToRaw = String(formData.get('reply_to') || '').trim()

  if (!orderId) throw new Error('Missing order id.')
  if (!body) throw new Error('Message body is required.')

  // Validate the replied-to message belongs to the same order. If the reply
  // reference can't be resolved (missing row, or the reply_to column isn't
  // migrated yet), send the message WITHOUT the quote rather than failing.
  let replyTo: string | null = null
  if (replyToRaw) {
    const { data: parent } = await supabase
      .from('messages')
      .select('id')
      .eq('id', replyToRaw)
      .eq('order_id', orderId)
      .maybeSingle()

    if (parent) replyTo = parent.id
  }

  const [{ data: order }, { data: profile }] = await Promise.all([
    supabase.from('orders').select('id, user_id').eq('id', orderId).maybeSingle(),
    supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
  ])

  if (!order) throw new Error('Order not found.')

  const role = profile?.role || 'customer'
  const canAccess =
    role === 'admin' ||
    role === 'super_admin' ||
    order.user_id === user.id

  if (!canAccess) throw new Error('Forbidden')

  const insertPayload: Record<string, string | boolean> = {
    order_id: orderId,
    sender_id: user.id,
    body,
    is_read: false,
  }
  if (replyTo) insertPayload.reply_to = replyTo

  const { error } = await supabase.from('messages').insert(insertPayload)

  // The reply_to column may not exist yet in the live DB (migration pending).
  // If so, retry without the quote so the message itself always sends.
  if (error && replyTo && /column.*reply_to|reply_to.*column/i.test(error.message)) {
    delete insertPayload.reply_to
    const retry = await supabase.from('messages').insert(insertPayload)
    if (retry.error) throw new Error(retry.error.message)
  } else if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/orders/' + orderId)
  revalidatePath('/admin-dashboard')
  revalidatePath('/admin-dashboard/orders/' + orderId)
  revalidatePath('/super-dashboard')
}