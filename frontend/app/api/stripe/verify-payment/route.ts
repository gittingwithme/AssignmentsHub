import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getStripe } from '@/lib/stripe'

/**
 * Prevent caching — always check live status.
 */
export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
    }
  )
}

/**
 * GET /api/stripe/verify-payment?order_id=xxx
 *
 * Fallback endpoint to manually check payment status with Stripe API.
 * Used when webhooks may be delayed. Only the order owner or staff can call this.
 *
 * Returns the current payment status and, if available, syncs the DB
 * if Stripe says the payment succeeded but the webhook hasn't arrived yet.
 */
export async function GET(request: NextRequest) {
  try {
    const orderId = request.nextUrl.searchParams.get('order_id')

    if (!orderId) {
      return Response.json({ error: 'order_id is required.' }, { status: 400 })
    }

    // Authenticate the user
    const { createClient } = await import('@/lib/supabase/server')
    const userSupabase = await createClient()
    const {
      data: { user },
    } = await userSupabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceClient()

    // Get the order — verify ownership
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, payment_status, stripe_checkout_session_id, active_stripe_session_id, last_payment_error')
      .eq('id', orderId)
      .maybeSingle()

    if (orderError || !order) {
      return Response.json({ error: 'Order not found.' }, { status: 404 })
    }

    // Check access: order owner or staff
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const isStaff = userProfile?.role === 'admin' || userProfile?.role === 'super_admin'

    if (order.user_id !== user.id && !isStaff) {
      return Response.json({ error: 'Forbidden.' }, { status: 403 })
    }

    // If there's no active session, just return current DB status
    const sessionId = order.active_stripe_session_id || order.stripe_checkout_session_id
    if (!sessionId) {
      return Response.json({
        payment_status: order.payment_status,
        stripe_status: null,
        last_error: order.last_payment_error,
        synced: false,
      })
    }

    // Check Stripe for the real session status
    const stripe = getStripe()
    let stripeSession

    try {
      stripeSession = await stripe.checkout.sessions.retrieve(sessionId)
    } catch {
      return Response.json({
        payment_status: order.payment_status,
        stripe_status: 'session_not_found',
        last_error: order.last_payment_error,
        synced: false,
      })
    }

    const stripeStatus = stripeSession.payment_status // 'paid' | 'unpaid' | 'no_payment_required'
    const sessionStatus = stripeSession.status // 'open' | 'complete' | 'expired'

    // If Stripe says 'paid' but our DB doesn't reflect it yet,
    // the webhook is delayed — manually sync
    if (stripeStatus === 'paid' && sessionStatus === 'complete' && order.payment_status !== 'approved') {
      const paymentIntentId =
        typeof stripeSession.payment_intent === 'string'
          ? stripeSession.payment_intent
          : (stripeSession.payment_intent as { id: string } | null)?.id ?? null

      const now = new Date().toISOString()

      // Update order
      await supabase
        .from('orders')
        .update({
          payment_status: 'approved',
          status: 'in-progress',
          status_key: 'in_progress',
          final_output_locked: false,
          stripe_checkout_session_id: sessionId,
          stripe_payment_intent_id: paymentIntentId,
          active_stripe_session_id: null,
          last_payment_error: null,
          last_payment_at: now,
        })
        .eq('id', orderId)

      // Unlock final output files
      await supabase
        .from('order_files')
        .update({ is_locked: false })
        .eq('order_id', orderId)
        .in('file_category', ['admin_final_docx', 'admin_final_pdf', 'admin_final_image'])

      // Log the reconciliation event
      await supabase.from('payment_events').insert({
        order_id: orderId,
        user_id: order.user_id,
        stripe_session_id: sessionId,
        stripe_payment_intent_id: paymentIntentId,
        status: 'succeeded',
        payment_type: 'one_time',
        amount_cents: stripeSession.amount_total ?? 0,
        idempotency_key: `verify_sync_${sessionId}`,
      }).then(({ error }) => {
        // Ignore duplicate idempotency key errors
        if (error && error.code !== '23505') {
          console.error('[Verify Payment] Failed to log event:', error)
        }
      })

      return Response.json({
        payment_status: 'approved',
        stripe_status: 'paid',
        synced: true,
      })
    }

    // If expired, update DB if still stuck on 'processing'
    if (sessionStatus === 'expired' && order.payment_status === 'processing') {
      await supabase
        .from('orders')
        .update({
          payment_status: 'cancelled',
          active_stripe_session_id: null,
          last_payment_error: 'Payment session expired',
          last_payment_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      return Response.json({
        payment_status: 'cancelled',
        stripe_status: 'expired',
        synced: true,
      })
    }

    return Response.json({
      payment_status: order.payment_status,
      stripe_status: `${sessionStatus}/${stripeStatus}`,
      last_error: order.last_payment_error,
      synced: false,
    })
  } catch (error) {
    console.error('[Verify Payment] Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
