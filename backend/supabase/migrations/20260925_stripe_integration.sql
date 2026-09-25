-- Stripe integration columns
-- Run this migration in the Supabase SQL editor AFTER all existing migrations.
--
-- Adds Stripe-specific columns to track checkout sessions, payment intents,
-- and Stripe customer/subscription IDs alongside the existing manual
-- bank-transfer approval flow.

-- ── orders ────────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- ── invoices ──────────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'bank_transfer';

COMMENT ON COLUMN public.invoices.payment_method
  IS 'Payment method used: bank_transfer (default/legacy) or stripe';

-- ── subscriptions ─────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

-- ── users ─────────────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- ── plans (Stripe Price IDs for test + live) ──────────────────────────────
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_price_id_test TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id_live TEXT;

-- ── Indexes for webhook lookups ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_stripe_checkout_session
  ON public.orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_stripe_checkout_session
  ON public.invoices (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer
  ON public.users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
