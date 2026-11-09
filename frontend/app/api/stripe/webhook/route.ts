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

type ServiceClient = ReturnType<typeof getServiceClient>

/**
 * Logs a payment event to the audit trail.
 * Uses idempotency_key to prevent duplicate processing.
 * Returns false if the event was already processed (duplicate).
 */
async function logPaymentEvent(
  supabase: ServiceClient,
  event: {
    order_id?: string | null
    invoice_id?: string | null
    user_id: string
    stripe_session_id?: string | null
    stripe_payment_intent_id?: string | null
    status: string
    failure_reason?: string | null
    failure_code?: string | null
    payment_type: string
    amount_cents: number
    currency?: string
    idempotency_key: string
    raw_stripe_event?: Record<string, unknown> | null
  }
): Promise<boolean> {
  const { error } = await supabase.from('payment_events').insert({
    order_id: event.order_id || null,
    invoice_id: event.invoice_id || null,
    user_id: event.user_id,
    stripe_session_id: event.stripe_session_id || null,
    stripe_payment_intent_id: event.stripe_payment_intent_id || null,
    status: event.status,
    failure_reason: event.failure_reason || null,
    failure_code: event.failure_code || null,
    payment_type: event.payment_type,
    amount_cents: event.amount_cents,
    currency: event.currency || 'eur',
    idempotency_key: event.idempotency_key,
    raw_stripe_event: event.raw_stripe_event || null,
  })

  if (error) {
    // Unique constraint violation on idempotency_key = already processed
    if (error.code === '23505') {
      console.log(`[Stripe Webhook] Duplicate event skipped: ${event.idempotency_key}`)
      return false
    }
    console.error('[Stripe Webhook] Failed to log payment event:', error)
  }

  return true
}

/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events for bank-transfer payments:
 *
 * Success flow:
 * - checkout.session.completed → finalize payment / activate subscription
 *
 * Failure flow:
 * - checkout.session.async_payment_failed → bank declined / insufficient funds
 * - charge.failed → charge-level failure
 *
 * Cancellation/expiry flow:
 * - checkout.session.expired → user cancelled or session timed out
 *
 * Subscription lifecycle:
 * - customer.subscription.deleted → deactivate subscription
 * - invoice.payment_failed → notify customer of failed renewal
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
      // ── CHECKOUT COMPLETED (payment succeeded) ────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object
        const metadata = session.metadata || {}

        if (metadata.type === 'one_time') {
          await handleOneTimePaymentSuccess(supabase, session, metadata, event)
        } else if (metadata.type === 'subscription') {
          await handleSubscriptionPaymentSuccess(supabase, session, metadata, event)
        }

        break
      }

      // ── ASYNC PAYMENT FAILED (bank declined / insufficient funds) ─────
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object
        const metadata = session.metadata || {}

        if (metadata.type === 'one_time') {
          await handleOneTimePaymentFailure(supabase, session, metadata, event)
        }
        // Subscription async failures are handled by invoice.payment_failed

        break
      }

      // ── SESSION EXPIRED (user cancelled or timed out) ─────────────────
      case 'checkout.session.expired': {
        const session = event.data.object
        const metadata = session.metadata || {}

        if (metadata.type === 'one_time') {
          await handleOneTimePaymentExpired(supabase, session, metadata, event)
        }

        break
      }

      // ── CHARGE FAILED (charge-level failure) ──────────────────────────
      case 'charge.failed': {
        const charge = event.data.object
        const paymentIntentId = typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null

        if (paymentIntentId) {
          await handleChargeFailed(supabase, paymentIntentId, charge, event)
        }

        break
      }

      // ── SUBSCRIPTION DELETED ──────────────────────────────────────────
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

      // ── INVOICE PAYMENT FAILED (subscription renewal failed) ──────────
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
                'We were unable to process your latest subscription payment via bank transfer. Please update your payment method or try again.',
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

// ── Handler: One-time payment SUCCESS ───────────────────────────────────────

async function handleOneTimePaymentSuccess(
  supabase: ServiceClient,
  session: {
    id: string
    payment_intent?: string | { id: string } | null
    amount_total?: number | null
  },
  metadata: Record<string, string>,
  rawEvent: { id: string; type: string; data: { object: unknown } }
) {
  const orderId = metadata.order_id
  const userId = metadata.user_id
  const invoiceId = metadata.invoice_id
  const idempotencyKey = metadata.idempotency_key || `completed_${session.id}`

  if (!orderId || !userId) return

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

  // Idempotency: log the event — if duplicate, skip entirely
  const isNew = await logPaymentEvent(supabase, {
    order_id: orderId,
    invoice_id: invoiceId || null,
    user_id: userId,
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    status: 'succeeded',
    payment_type: 'one_time',
    amount_cents: session.amount_total ?? 0,
    idempotency_key: idempotencyKey,
    raw_stripe_event: rawEvent as unknown as Record<string, unknown>,
  })

  if (!isNew) return // Already processed

  const now = new Date().toISOString()

  // Update order → approved
  await supabase
    .from('orders')
    .update({
      payment_status: 'approved',
      status: 'in-progress',
      status_key: 'in_progress',
      final_output_locked: false,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      active_stripe_session_id: null, // Clear active session
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

  // Update invoice if exists
  if (invoiceId) {
    await supabase
      .from('invoices')
      .update({
        status: 'approved',
        payment_method: 'stripe_bank_transfer',
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        failure_reason: null,
        last_attempt_at: now,
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
        payment_reference: `stripe_bank:${session.id}`,
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
    message: `Your bank transfer payment for "${order?.title || 'your order'}" was processed successfully. The team is now working on your request.`,
    cta: { label: 'View request', href: customerOrderUrl(orderId) },
  })
}

// ── Handler: One-time payment FAILURE ───────────────────────────────────────

async function handleOneTimePaymentFailure(
  supabase: ServiceClient,
  session: {
    id: string
    payment_intent?: string | { id: string } | null
    amount_total?: number | null
  },
  metadata: Record<string, string>,
  rawEvent: { id: string; type: string; data: { object: unknown } }
) {
  const orderId = metadata.order_id
  const userId = metadata.user_id
  const invoiceId = metadata.invoice_id
  const idempotencyKey = `failed_${session.id}`

  if (!orderId || !userId) return

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

  // Try to get the specific failure reason from the PaymentIntent
  let failureReason = 'Bank transfer payment failed'
  let failureCode = 'unknown'

  if (paymentIntentId) {
    try {
      const stripe = getStripe()
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (pi.last_payment_error) {
        failureCode = pi.last_payment_error.code || 'unknown'
        failureReason = getHumanReadableFailureReason(failureCode)
      }
    } catch {
      // Could not retrieve PI details — use generic reason
    }
  }

  const isNew = await logPaymentEvent(supabase, {
    order_id: orderId,
    invoice_id: invoiceId || null,
    user_id: userId,
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    status: 'failed',
    failure_reason: failureReason,
    failure_code: failureCode,
    payment_type: 'one_time',
    amount_cents: session.amount_total ?? 0,
    idempotency_key: idempotencyKey,
    raw_stripe_event: rawEvent as unknown as Record<string, unknown>,
  })

  if (!isNew) return

  const now = new Date().toISOString()

  // Update order → failed
  await supabase
    .from('orders')
    .update({
      payment_status: 'failed',
      active_stripe_session_id: null,
      last_payment_error: failureReason,
      last_payment_at: now,
    })
    .eq('id', orderId)

  // Update invoice if exists
  if (invoiceId) {
    await supabase
      .from('invoices')
      .update({
        failure_reason: failureReason,
        last_attempt_at: now,
        updated_at: now,
      })
      .eq('id', invoiceId)
  }

  // Fetch order title for email
  const { data: order } = await supabase
    .from('orders')
    .select('title')
    .eq('id', orderId)
    .maybeSingle()

  await notifyCustomer(userId, {
    subject: 'Payment failed — please try again',
    heading: 'Bank transfer payment failed',
    message: `Your bank transfer for "${order?.title || 'your order'}" could not be completed. Reason: ${failureReason}. You can try again immediately from your dashboard.`,
    cta: { label: 'Retry payment', href: customerOrderUrl(orderId) },
  })
}

// ── Handler: One-time payment EXPIRED / CANCELLED ───────────────────────────

async function handleOneTimePaymentExpired(
  supabase: ServiceClient,
  session: {
    id: string
    amount_total?: number | null
  },
  metadata: Record<string, string>,
  rawEvent: { id: string; type: string; data: { object: unknown } }
) {
  const orderId = metadata.order_id
  const userId = metadata.user_id
  const invoiceId = metadata.invoice_id
  const idempotencyKey = `expired_${session.id}`

  if (!orderId || !userId) return

  const isNew = await logPaymentEvent(supabase, {
    order_id: orderId,
    invoice_id: invoiceId || null,
    user_id: userId,
    stripe_session_id: session.id,
    status: 'expired',
    payment_type: 'one_time',
    amount_cents: session.amount_total ?? 0,
    idempotency_key: idempotencyKey,
    raw_stripe_event: rawEvent as unknown as Record<string, unknown>,
  })

  if (!isNew) return

  // Only revert to a retryable state if it's still in 'processing'
  // (don't overwrite 'approved' if somehow the success webhook came first)
  const { data: currentOrder } = await supabase
    .from('orders')
    .select('payment_status')
    .eq('id', orderId)
    .maybeSingle()

  if (currentOrder?.payment_status === 'processing') {
    await supabase
      .from('orders')
      .update({
        payment_status: 'cancelled',
        active_stripe_session_id: null,
        last_payment_error: 'Payment session expired or was cancelled',
        last_payment_at: new Date().toISOString(),
      })
      .eq('id', orderId)
  }
}

// ── Handler: Charge-level failure ───────────────────────────────────────────

async function handleChargeFailed(
  supabase: ServiceClient,
  paymentIntentId: string,
  charge: { id: string; failure_code?: string | null; failure_message?: string | null },
  rawEvent: { id: string; type: string; data: { object: unknown } }
) {
  const idempotencyKey = `charge_failed_${charge.id}`

  const failureCode = charge.failure_code || 'unknown'
  const failureReason = charge.failure_message || getHumanReadableFailureReason(failureCode)

  // Find the order associated with this payment intent
  const { data: order } = await supabase
    .from('orders')
    .select('id, user_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()

  if (!order) {
    // Could be a subscription charge — log but don't update orders
    console.warn(`[Stripe Webhook] charge.failed for unknown PI: ${paymentIntentId}`)
    return
  }

  const isNew = await logPaymentEvent(supabase, {
    order_id: order.id,
    user_id: order.user_id,
    stripe_payment_intent_id: paymentIntentId,
    status: 'failed',
    failure_reason: failureReason,
    failure_code: failureCode,
    payment_type: 'one_time',
    amount_cents: 0, // charge.amount not always available in typed event
    idempotency_key: idempotencyKey,
    raw_stripe_event: rawEvent as unknown as Record<string, unknown>,
  })

  if (!isNew) return

  await supabase
    .from('orders')
    .update({
      payment_status: 'failed',
      active_stripe_session_id: null,
      last_payment_error: failureReason,
      last_payment_at: new Date().toISOString(),
    })
    .eq('id', order.id)
}

// ── Handler: Subscription payment SUCCESS ───────────────────────────────────

async function handleSubscriptionPaymentSuccess(
  supabase: ServiceClient,
  session: {
    id: string
    subscription?: string | { id: string } | null
    customer?: string | { id: string } | null
    amount_total?: number | null
  },
  metadata: Record<string, string>,
  rawEvent: { id: string; type: string; data: { object: unknown } }
) {
  const planId = Number(metadata.plan_id)
  const userId = metadata.user_id
  const idempotencyKey = metadata.idempotency_key || `sub_completed_${session.id}`

  if (!planId || !userId) return

  // Idempotency check
  const isNew = await logPaymentEvent(supabase, {
    user_id: userId,
    stripe_session_id: session.id,
    status: 'succeeded',
    payment_type: 'subscription',
    amount_cents: session.amount_total ?? 0,
    idempotency_key: idempotencyKey,
    raw_stripe_event: rawEvent as unknown as Record<string, unknown>,
  })

  if (!isNew) return

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
  const referenceCode = `STRIPE-BANK-SUB-${Date.now()}-${String(subscription.id).slice(0, 6).toUpperCase()}`
  await supabase.from('invoices').insert({
    user_id: userId,
    subscription_id: subscription.id,
    amount_cents: plan.price_cents,
    status: 'approved',
    invoice_kind: 'subscription',
    reference_code: referenceCode,
    payment_method: 'stripe_bank_transfer',
    stripe_checkout_session_id: session.id,
    notes: `${plan.name} subscription activated via bank transfer.`,
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

// ── Utility: human-readable failure reasons ─────────────────────────────────

function getHumanReadableFailureReason(code: string): string {
  const reasons: Record<string, string> = {
    insufficient_funds: 'Your account has insufficient funds. Please ensure adequate balance and try again.',
    bank_account_declined: 'Your bank declined the transaction. Please contact your bank or try a different account.',
    bank_account_closed: 'The bank account appears to be closed. Please use a different account.',
    bank_account_unusable: 'This bank account cannot be used for this transaction. Please try a different account.',
    debit_not_authorized: 'The debit was not authorized. Please authorize the payment through your banking app.',
    generic_decline: 'Your bank declined the payment. Please contact your bank for details.',
    authentication_required: 'Additional authentication was required but not completed. Please try again.',
    processing_error: 'A processing error occurred. Please try again in a few moments.',
    currency_not_supported: 'Your bank does not support EUR transactions. Please try a different account.',
    account_closed: 'The account has been closed. Please use a different payment method.',
    expired_card: 'The payment method has expired.',
    incorrect_number: 'Invalid account details provided.',
  }

  return reasons[code] || `Payment was declined (${code}). Please try again or contact support.`
}
