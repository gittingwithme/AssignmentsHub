import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getStripe, findOrCreateStripeCustomer } from '@/lib/stripe'

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
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for:
 *   - One-time order payments (mode: 'payment')
 *   - Subscription purchases  (mode: 'subscription')
 *
 * Body: {
 *   type: 'one_time' | 'subscription'
 *   order_id?: string     // required for one_time
 *   plan_id?: number       // required for subscription
 *   invoice_id?: string    // optional — links to existing invoice
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, order_id, plan_id, invoice_id } = body

    if (!type || !['one_time', 'subscription'].includes(type)) {
      return Response.json({ error: 'Invalid type. Must be "one_time" or "subscription".' }, { status: 400 })
    }

    const supabase = getServiceClient()

    // Authenticate the user from the request cookies
    const { createClient } = await import('@/lib/supabase/server')
    const userSupabase = await createClient()
    const {
      data: { user },
    } = await userSupabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get or create the user's Stripe customer
    const { data: userProfile } = await supabase
      .from('users')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .maybeSingle()

    const stripeCustomerId = await findOrCreateStripeCustomer(
      user.id,
      user.email || userProfile?.email || '',
      userProfile?.stripe_customer_id
    )

    // Persist the Stripe customer ID if it's new
    if (stripeCustomerId !== userProfile?.stripe_customer_id) {
      await supabase
        .from('users')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id)
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const stripe = getStripe()

    // ── ONE-TIME ORDER PAYMENT ──────────────────────────────────────────
    if (type === 'one_time') {
      if (!order_id) {
        return Response.json({ error: 'order_id is required for one_time payments.' }, { status: 400 })
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, title, quote_amount_cents, price, user_id, payment_status')
        .eq('id', order_id)
        .maybeSingle()

      if (orderError || !order) {
        return Response.json({ error: 'Order not found.' }, { status: 404 })
      }

      if (order.user_id !== user.id) {
        return Response.json({ error: 'Forbidden.' }, { status: 403 })
      }

      const amountCents =
        order.quote_amount_cents ??
        (order.price ? Math.round(Number(order.price) * 100) : null)

      if (!amountCents || amountCents <= 0) {
        return Response.json({ error: 'No quote amount set for this order.' }, { status: 400 })
      }

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: `Order: ${order.title}`,
                description: `AssignmentsHub one-time order payment`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: 'one_time',
          order_id: order.id,
          user_id: user.id,
          invoice_id: invoice_id || '',
        },
        success_url: `${siteUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`,
        cancel_url: `${siteUrl}/payment/cancel?order_id=${order.id}`,
      })

      // Track the checkout session on the order
      await supabase
        .from('orders')
        .update({ stripe_checkout_session_id: session.id })
        .eq('id', order.id)

      // Also track on the invoice if one was provided
      if (invoice_id) {
        await supabase
          .from('invoices')
          .update({
            stripe_checkout_session_id: session.id,
            payment_method: 'stripe',
          })
          .eq('id', invoice_id)
      }

      return Response.json({ url: session.url })
    }

    // ── SUBSCRIPTION PAYMENT ────────────────────────────────────────────
    if (type === 'subscription') {
      if (!plan_id) {
        return Response.json({ error: 'plan_id is required for subscription payments.' }, { status: 400 })
      }

      const { data: plan, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('id', plan_id)
        .eq('is_active', true)
        .maybeSingle()

      if (planError || !plan) {
        return Response.json({ error: 'Plan not found.' }, { status: 404 })
      }

      const stripeMode = process.env.NEXT_PUBLIC_STRIPE_MODE === 'live' ? 'live' : 'test'
      let stripePriceId =
        stripeMode === 'live' ? plan.stripe_price_id_live : plan.stripe_price_id_test

      // Auto-create Stripe Price if not yet configured
      if (!stripePriceId) {
        const stripeProduct = await stripe.products.create({
          name: plan.name,
          metadata: {
            plan_id: String(plan.id),
            interval: plan.interval,
          },
        })

        const stripePrice = await stripe.prices.create({
          product: stripeProduct.id,
          currency: 'eur',
          unit_amount: plan.price_cents,
          recurring: {
            interval: plan.interval === 'weekly' ? 'week' : 'month',
          },
          metadata: {
            plan_id: String(plan.id),
          },
        })

        stripePriceId = stripePrice.id

        // Persist the new Stripe Price ID
        const priceColumn =
          stripeMode === 'live' ? 'stripe_price_id_live' : 'stripe_price_id_test'
        await supabase
          .from('plans')
          .update({ [priceColumn]: stripePriceId })
          .eq('id', plan.id)
      }

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: stripePriceId,
            quantity: 1,
          },
        ],
        metadata: {
          type: 'subscription',
          plan_id: String(plan.id),
          user_id: user.id,
        },
        subscription_data: {
          metadata: {
            plan_id: String(plan.id),
            user_id: user.id,
          },
        },
        success_url: `${siteUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&plan_id=${plan.id}`,
        cancel_url: `${siteUrl}/payment/cancel?plan_id=${plan.id}`,
      })

      return Response.json({ url: session.url })
    }

    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  } catch (error) {
    console.error('[Stripe Checkout] Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
