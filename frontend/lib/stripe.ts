import Stripe from 'stripe'

/**
 * Stripe mode — determined by NEXT_PUBLIC_STRIPE_MODE.
 * Defaults to 'test' if not set (safe fallback).
 */
function getStripeMode(): 'test' | 'live' {
  const mode = process.env.NEXT_PUBLIC_STRIPE_MODE
  return mode === 'live' ? 'live' : 'test'
}

/**
 * Returns the correct Stripe secret key for the current mode.
 */
function getStripeSecretKey(): string {
  const mode = getStripeMode()
  const key =
    mode === 'live'
      ? process.env.STRIPE_SECRET_KEY_LIVE
      : process.env.STRIPE_SECRET_KEY_TEST

  if (!key) {
    throw new Error(
      `Missing Stripe secret key for ${mode} mode. ` +
        `Set STRIPE_SECRET_KEY_${mode.toUpperCase()} in your environment.`
    )
  }

  return key
}

/**
 * Returns the correct Stripe webhook secret for the current mode.
 */
export function getStripeWebhookSecret(): string {
  const mode = getStripeMode()
  const secret =
    mode === 'live'
      ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
      : process.env.STRIPE_WEBHOOK_SECRET_TEST

  if (!secret) {
    throw new Error(
      `Missing Stripe webhook secret for ${mode} mode. ` +
        `Set STRIPE_WEBHOOK_SECRET_${mode.toUpperCase()} in your environment.`
    )
  }

  return secret
}

/**
 * Server-side Stripe instance.
 * Uses the appropriate secret key based on the current mode.
 */
let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(getStripeSecretKey(), {
      apiVersion: '2026-08-26.dahlia',
      typescript: true,
    })
  }
  return stripeInstance
}

/**
 * Returns the publishable key for client-side usage.
 * This is safe to expose to the browser.
 */
export function getStripePublishableKey(): string {
  const mode = getStripeMode()
  const key =
    mode === 'live'
      ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE
      : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST

  if (!key) {
    throw new Error(
      `Missing Stripe publishable key for ${mode} mode. ` +
        `Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_${mode.toUpperCase()} in your environment.`
    )
  }

  return key
}

/**
 * Finds or creates a Stripe Customer for a given user.
 */
export async function findOrCreateStripeCustomer(
  userId: string,
  email: string,
  existingStripeCustomerId?: string | null
): Promise<string> {
  const stripe = getStripe()

  if (existingStripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(existingStripeCustomerId)
      if (!existing.deleted) {
        return existing.id
      }
    } catch {
      // Customer doesn't exist anymore — create a new one
    }
  }

  const customer = await stripe.customers.create({
    email,
    metadata: {
      supabase_user_id: userId,
    },
  })

  return customer.id
}
