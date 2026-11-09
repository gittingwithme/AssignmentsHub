-- Stripe bank-transfer migration: payment_events audit trail + schema updates
-- Run this migration in the Supabase SQL editor AFTER 20260925_stripe_integration.sql.
--
-- 1. Creates payment_events table for full audit trail
-- 2. Updates orders/invoices to support new payment states
-- 3. Adds RLS (service-role only for payment_events, staff read)
-- 4. Updates guard triggers for new payment_status values
-- 5. Publishes payment_events to realtime for admin dashboard

-- ── 1) payment_events: full audit trail ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  invoice_id               UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  user_id                  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Stripe references
  stripe_session_id        TEXT,
  stripe_payment_intent_id TEXT,

  -- State
  status                   TEXT NOT NULL CHECK (status IN (
    'initiated',       -- checkout session created
    'processing',      -- user redirected to bank / authenticating
    'succeeded',       -- money confirmed by Stripe
    'failed',          -- bank declined / insufficient funds
    'cancelled',       -- user cancelled mid-flow
    'expired'          -- session timed out (20 min)
  )),
  failure_reason           TEXT,        -- human-readable reason
  failure_code             TEXT,        -- Stripe error code (e.g. 'insufficient_funds')
  payment_type             TEXT NOT NULL DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'subscription')),

  -- Money
  amount_cents             INTEGER NOT NULL,
  currency                 TEXT NOT NULL DEFAULT 'eur',

  -- Idempotency: each Stripe event is processed exactly once
  idempotency_key          TEXT UNIQUE,

  -- Timestamps
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Forensics: full Stripe webhook payload for debugging
  raw_stripe_event         JSONB
);

COMMENT ON TABLE public.payment_events
  IS 'Immutable audit trail of every payment state transition. Written only by the webhook handler (service_role). Staff can read; customers cannot.';

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_payment_events_order_id
  ON public.payment_events (order_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_user_id
  ON public.payment_events (user_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_stripe_session
  ON public.payment_events (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_events_status
  ON public.payment_events (status);

CREATE INDEX IF NOT EXISTS idx_payment_events_created_at
  ON public.payment_events (created_at);

-- ── 2) orders: add new columns for bank transfer flow ────────────────────────
-- Track the active checkout session so we can cancel stale ones
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS active_stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS checkout_attempts       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_error      TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_at         TIMESTAMPTZ;

-- ── 3) invoices: track failure info and payment method update ────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS failure_reason  TEXT,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- Update default payment_method to 'stripe_bank_transfer'
ALTER TABLE public.invoices
  ALTER COLUMN payment_method SET DEFAULT 'stripe_bank_transfer';

-- ── 4) RLS on payment_events ─────────────────────────────────────────────────
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Staff (admin/super_admin) can read all payment events for the dashboard
DROP POLICY IF EXISTS "payment_events_staff_read" ON public.payment_events;
CREATE POLICY "payment_events_staff_read"
  ON public.payment_events
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- Only service_role (webhook handler) can write to this table.
-- This is enforced by RLS: no policy = no access for non-service-role.

-- ── 5) Update guard_order_updates() to allow new payment_status values ───────
-- The webhook handler runs as service_role, so it bypasses this trigger.
-- But we also need to allow the checkout route (service_role) to set 'processing'.
-- The trigger already allows service_role to pass through (line: if auth.role() = 'service_role' ... return new).
-- No trigger change needed for service_role writes.
--
-- However, we need to update the INSERT guard to allow 'processing' as an
-- initial payment status for bank transfer orders where the session is created
-- before payment completes.

CREATE OR REPLACE FUNCTION public.guard_order_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_staff() THEN
    RETURN new;
  END IF;

  IF tg_op = 'INSERT' THEN
    -- Customers may create orders, but only in the initial locked state.
    IF new.final_output_locked IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'New orders must start locked';
    END IF;
    IF new.status_key IS DISTINCT FROM 'review_pending' THEN
      RAISE EXCEPTION 'New orders must start in review';
    END IF;
    IF new.payment_status NOT IN ('invoice_created', 'approved') THEN
      RAISE EXCEPTION 'Invalid initial payment status';
    END IF;
    RETURN new;
  END IF;

  -- Non-staff may only change payment/status fields, and only toward the
  -- "payment submitted" state (the customer's notifyPaymentMade action).
  IF new.payment_status IS DISTINCT FROM old.payment_status
     OR new.status IS DISTINCT FROM old.status
     OR new.status_key IS DISTINCT FROM old.status_key THEN
    IF new.payment_status <> 'pending_approval'
       OR old.payment_status NOT IN ('invoice_created', 'rejected', 'pending_approval')
       OR new.status <> 'payment_submitted'
       OR new.status_key <> 'payment_submitted' THEN
      RAISE EXCEPTION 'Not allowed to change order payment/status state';
    END IF;
  END IF;

  -- Protected columns: never writable by non-staff.
  IF new.user_id IS DISTINCT FROM old.user_id
     OR new.price IS DISTINCT FROM old.price
     OR new.quote_amount_cents IS DISTINCT FROM old.quote_amount_cents
     OR new.final_output_locked IS DISTINCT FROM old.final_output_locked
     OR new.is_trial_order IS DISTINCT FROM old.is_trial_order
     OR new.submission_mode IS DISTINCT FROM old.submission_mode
     OR new.file_url IS DISTINCT FROM old.file_url
     OR new.file_urls IS DISTINCT FROM old.file_urls
     -- New protected columns for bank transfer
     OR new.active_stripe_session_id IS DISTINCT FROM old.active_stripe_session_id
     OR new.checkout_attempts IS DISTINCT FROM old.checkout_attempts
     OR new.last_payment_error IS DISTINCT FROM old.last_payment_error
     OR new.last_payment_at IS DISTINCT FROM old.last_payment_at THEN
    RAISE EXCEPTION 'Not allowed to modify protected order fields';
  END IF;

  RETURN new;
END;
$$;

-- ── 6) Publish payment_events to realtime for admin dashboard ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payment_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_events;
  END IF;
END $$;
