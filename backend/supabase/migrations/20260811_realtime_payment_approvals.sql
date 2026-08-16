-- Realtime payment notifications
-- Run this migration in the Supabase SQL editor AFTER 20260811_payment_logs.sql.
--
-- Publishes payment_approvals to supabase_realtime so the dashboard bell can
-- react live to: a customer submitting a payment (admin sees "awaiting
-- review"), and an admin approving/rejecting it (customer sees the outcome).
-- Idempotent — safe to re-run.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payment_approvals'
  ) then
    alter publication supabase_realtime add table public.payment_approvals;
  end if;
end $$;
