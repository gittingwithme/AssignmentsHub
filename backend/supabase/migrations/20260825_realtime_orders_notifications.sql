-- Realtime notifications & messaging publication
-- Run this in your Supabase SQL editor to ensure all necessary tables are published to supabase_realtime.

do $$
begin
  -- 1) Messages table for live chat/texting
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  -- 2) Payment approvals table for live payment review & status changes
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_approvals'
  ) then
    alter publication supabase_realtime add table public.payment_approvals;
  end if;

  -- 3) Orders table for live quote updates, new orders, and delivery status changes
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  -- 4) Invoices table for live subscription and payment updates
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invoices'
  ) then
    alter publication supabase_realtime add table public.invoices;
  end if;
end $$;
