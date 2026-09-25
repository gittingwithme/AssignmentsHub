import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe'
import { notifyCustomer, customerOrderUrl, customerSubscriptionUrl } from '@/lib/email'

/**
 * Bypass Next.js body parsing — Stripe needs the raw body for signature verification.
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

function addPeriod(interval: string) {
  const now = new Date()
  const end = new Date(now)

  if (interval === 'weekly') {
    end.setDate(end.getDate() + 7)
  } else {
    end.setMonth(end.getMonth() + 1)
  }

  return {
    start: now.toISOString(),
    end: end.toISOString(),
  }
}

/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events:
 * - checkout.session.completed → finalize payment / activate subscription
 * - invoice.payment_failed → notify customer
 * - customer.subscription.deleted → deactivate subscription
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const stripe = getStripe()
  let webhookSecret: string

  try {
    webhookSecret = getStripeWebhookSecret()
  } catch {
    console.error('[Stripe Webhook] Webhook secret not configured')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  let event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  const supabase = getServiceClient()

  try {
    switch (event.type) {
      // ── CHECKOUT COMPLETED ──────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object
        const metadata = session.metadata || {}

        if (metadata.type === 'one_time') {
          await handleOneTimePayment(supabase, session, metadata)
        } else if (metadata.type === 'subscription') {
          await handleSubscriptionPayment(supabase, session, metadata)
        }

        break
      }

      // ── SUBSCRIPTION DELETED ────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const metadata = subscription.metadata || {}

        if (metadata.user_id) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'inactive',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscription.id)

          await notifyCustomer(metadata.user_id, {
            subject: 'Your subscription has ended',
            heading: 'Subscription cancelled',
            message:
              'Your subscription has been cancelled. You can resubscribe anytime from your dashboard.',
            cta: { label: 'View plans', href: customerSubscriptionUrl() },
          })
        }

        break
      }

      // ── INVOICE PAYMENT FAILED ──────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const stripeCustomerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : invoice.customer?.id ?? null

        if (stripeCustomerId) {
          const { data: userRecord } = await supabase
            .from('users')
            .select('id')
            .eq('stripe_customer_id', stripeCustomerId)
            .maybeSingle()

          if (userRecord) {
            await notifyCustomer(userRecord.id, {
              subject: 'Payment failed — action required',
              heading: 'Your payment could not be processed',
              message:
                'We were unable to process your latest payment. Please update your payment method or try again.',
              cta: { label: 'Manage subscription', href: customerSubscriptionUrl() },
            })
          }
        }

        break
      }

      default:
        // Unhandled event type — acknowledge receipt
        break
    }
  } catch (err) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, err)
    // Still return 200 to prevent Stripe retries for processing errors
  }

  return new Response('OK', { status: 200 })
}

// ── Handler: One-time order payment ─────────────────────────────────────

async function handleOneTimePayment(
  supabase: ReturnType<typeof getServiceClient>,
  session: { id: string; payment_intent?: string | { id: string } | null },
  metadata: Record<string, string>
) {
  const orderId = metadata.order_id
  const userId = metadata.user_id
  const invoiceId = metadata.invoice_id

  if (!orderId || !userId) return

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

  // Idempotency check — skip if already approved via this session
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('payment_status, stripe_checkout_session_id')
    .eq('id', orderId)
    .maybeSingle()

  if (existingOrder?.payment_status === 'approved') {
    return // Already processed
  }

  const now = new Date().toISOString()

  // Update order
  await supabase
    .from('orders')
    .update({
      payment_status: 'approved',
      status: 'in-progress',
      status_key: 'in_progress',
      final_output_locked: false,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq('id', orderId)

  // Unlock final output files
  await supabase
    .from('order_files')
    .update({ is_locked: false })
    .eq('order_id', orderId)
    .in('file_category', ['admin_final_docx', 'admin_final_pdf', 'admin_final_image'])

  // Update invoice if exists
  if (invoiceId) {
    await supabase
      .from('invoices')
      .update({
        status: 'approved',
        payment_method: 'stripe',
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        updated_at: now,
      })
      .eq('id', invoiceId)

    // Create/update payment approval record
    const { data: approvalRow } = await supabase
      .from('payment_approvals')
      .select('id')
      .eq('invoice_id', invoiceId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (approvalRow?.id) {
      await supabase
        .from('payment_approvals')
        .update({
          approved_at: now,
          paid_at: now,
          rejected_at: null,
          rejected_by: null,
        })
        .eq('id', approvalRow.id)
    } else {
      await supabase.from('payment_approvals').insert({
        invoice_id: invoiceId,
        user_id: userId,
        payment_reference: `stripe:${session.id}`,
        approved_at: now,
        paid_at: now,
      })
    }
  }

  // Fetch order title for email
  const { data: order } = await supabase
    .from('orders')
    .select('title')
    .eq('id', orderId)
    .maybeSingle()

  await notifyCustomer(userId, {
    subject: 'Payment confirmed — your request is in progress',
    heading: 'Payment successful',
    message: `Your payment for "${order?.title || 'your order'}" was processed successfully via Stripe. The team is now working on your request.`,
    cta: { label: 'View request', href: customerOrderUrl(orderId) },
  })
}

// ── Handler: Subscription payment ───────────────────────────────────────

async function handleSubscriptionPayment(
  supabase: ReturnType<typeof getServiceClient>,
  session: {
    id: string
    subscription?: string | { id: string } | null
    customer?: string | { id: string } | null
  },
  metadata: Record<string, string>
) {
  const planId = Number(metadata.plan_id)
  const userId = metadata.user_id

  if (!planId || !userId) return

  const stripeSubscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null

  const stripeCustomerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id ?? null

  // Get the plan
  const { data: plan } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle()

  if (!plan) return

  const now = new Date().toISOString()
  const dates = addPeriod(plan.interval)

  // Deactivate any existing active subscriptions
  await supabase
    .from('subscriptions')
    .update({ status: 'inactive', updated_at: now })
    .eq('user_id', userId)
    .in('status', ['active', 'awaiting_payment', 'pending_approval'])

  // Create a new subscription record
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan_id: plan.id,
      status: 'active',
      current_period_start: dates.start,
      current_period_end: dates.end,
      remaining_credits: plan.quota_credits,
      trial_used: false,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_checkout_session_id: session.id,
    })
    .select('*')
    .single()

  if (subError) {
    console.error('[Stripe Webhook] Failed to create subscription:', subError)
    return
  }

  // Create the invoice record
  const referenceCode = `STRIPE-SUB-${Date.now()}-${String(subscription.id).slice(0, 6).toUpperCase()}`
  await supabase.from('invoices').insert({
    user_id: userId,
    subscription_id: subscription.id,
    amount_cents: plan.price_cents,
    status: 'approved',
    invoice_kind: 'subscription',
    reference_code: referenceCode,
    payment_method: 'stripe',
    stripe_checkout_session_id: session.id,
    notes: `${plan.name} subscription activated via Stripe.`,
  })

  // Update user's Stripe customer ID
  if (stripeCustomerId) {
    await supabase
      .from('users')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', userId)
  }

  await notifyCustomer(userId, {
    subject: 'Your subscription is active',
    heading: 'Subscription activated',
    message: `Your ${plan.name} subscription is now active with ${plan.quota_credits} credits. Start submitting requests right away!`,
    details: [
      { label: 'Plan', value: plan.name },
      { label: 'Credits', value: String(plan.quota_credits) },
      { label: 'Valid until', value: new Date(dates.end).toLocaleDateString() },
    ],
    cta: { label: 'Open dashboard', href: customerSubscriptionUrl() },
  })
}
