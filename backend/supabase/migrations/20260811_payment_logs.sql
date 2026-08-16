-- Payment logs: track received money
-- Run this migration in the Supabase SQL editor AFTER 20260811_core_rls.sql.
--
-- Adds payment_approvals.paid_at, set by the app whenever a payment is
-- approved (and cleared again on rejection). Only rows with paid_at set are
-- "logged" as received payments in the super admin Payment Logs view.
-- Backfills every already-approved payment so existing history shows up too.

alter table public.payment_approvals
  add column if not exists paid_at timestamptz;

-- Existing approved payments are money already received — backfill them.
-- (The table has no updated_at column; approved_at/submitted_at are the timestamps it stores.)
update public.payment_approvals
set paid_at = coalesce(approved_at, submitted_at)
where paid_at is null
  and approved_at is not null
  and rejected_at is null;

create index if not exists payment_approvals_paid_at_idx
  on public.payment_approvals (paid_at)
  where paid_at is not null;
