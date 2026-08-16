-- Core-table RLS lockdown
-- Run this migration in the Supabase SQL editor (or via CLI) AFTER
-- 20260810_storage_rls_realtime.sql and 20260810_customer_email.sql.
--
-- The tables were originally created without RLS, so any anonymous visitor
-- could read every order, message, and user row. This migration enables RLS
-- on every core table and adds two policy shapes:
--   • OWNER  — a customer can select/insert/update their own rows
--   • STAFF  — admin/super_admin can do anything (the app's server actions
--              act on behalf of the signed-in admin via their session)
-- Service-role writes (super-admin settings, trial signals) bypass RLS by
-- design, so no policies are needed for them.

-- ── Shared helper: is the current user staff? ─────────────────────────────
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role in ('admin', 'super_admin')
  )
$$;

-- ── users ─────────────────────────────────────────────────────────────────
alter table public.users enable row level security;

drop policy if exists "users_owner_select" on public.users;
drop policy if exists "users_owner_insert" on public.users;
drop policy if exists "users_owner_update" on public.users;
drop policy if exists "users_staff_all" on public.users;

create policy "users_owner_select" on public.users
  for select to authenticated using (id = auth.uid());

create policy "users_owner_insert" on public.users
  for insert to authenticated with check (id = auth.uid());

create policy "users_owner_update" on public.users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "users_staff_all" on public.users
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── orders ────────────────────────────────────────────────────────────────
alter table public.orders enable row level security;

drop policy if exists "orders_owner_select" on public.orders;
drop policy if exists "orders_owner_insert" on public.orders;
drop policy if exists "orders_owner_update" on public.orders;
drop policy if exists "orders_staff_all" on public.orders;

create policy "orders_owner_select" on public.orders
  for select to authenticated using (user_id = auth.uid());

create policy "orders_owner_insert" on public.orders
  for insert to authenticated with check (user_id = auth.uid());

create policy "orders_owner_update" on public.orders
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "orders_staff_all" on public.orders
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── invoices ──────────────────────────────────────────────────────────────
alter table public.invoices enable row level security;

drop policy if exists "invoices_owner_select" on public.invoices;
drop policy if exists "invoices_owner_insert" on public.invoices;
drop policy if exists "invoices_owner_update" on public.invoices;
drop policy if exists "invoices_staff_all" on public.invoices;

create policy "invoices_owner_select" on public.invoices
  for select to authenticated using (user_id = auth.uid());

create policy "invoices_owner_insert" on public.invoices
  for insert to authenticated with check (user_id = auth.uid());

create policy "invoices_owner_update" on public.invoices
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "invoices_staff_all" on public.invoices
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── payment_approvals ─────────────────────────────────────────────────────
alter table public.payment_approvals enable row level security;

drop policy if exists "payment_approvals_owner_select" on public.payment_approvals;
drop policy if exists "payment_approvals_owner_insert" on public.payment_approvals;
drop policy if exists "payment_approvals_owner_update" on public.payment_approvals;
drop policy if exists "payment_approvals_staff_all" on public.payment_approvals;

create policy "payment_approvals_owner_select" on public.payment_approvals
  for select to authenticated using (user_id = auth.uid());

create policy "payment_approvals_owner_insert" on public.payment_approvals
  for insert to authenticated with check (user_id = auth.uid());

create policy "payment_approvals_owner_update" on public.payment_approvals
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "payment_approvals_staff_all" on public.payment_approvals
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── order_files ───────────────────────────────────────────────────────────
alter table public.order_files enable row level security;

drop policy if exists "order_files_owner_select" on public.order_files;
drop policy if exists "order_files_owner_insert" on public.order_files;
drop policy if exists "order_files_staff_all" on public.order_files;

-- Customers see files on their own orders (including admin uploads).
create policy "order_files_owner_select" on public.order_files
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_files.order_id and o.user_id = auth.uid()
    )
  );

create policy "order_files_owner_insert" on public.order_files
  for insert to authenticated with check (uploaded_by = auth.uid());

create policy "order_files_staff_all" on public.order_files
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── subscriptions ─────────────────────────────────────────────────────────
alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_owner_select" on public.subscriptions;
drop policy if exists "subscriptions_owner_insert" on public.subscriptions;
drop policy if exists "subscriptions_owner_update" on public.subscriptions;
drop policy if exists "subscriptions_staff_all" on public.subscriptions;

create policy "subscriptions_owner_select" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

create policy "subscriptions_owner_insert" on public.subscriptions
  for insert to authenticated with check (user_id = auth.uid());

create policy "subscriptions_owner_update" on public.subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "subscriptions_staff_all" on public.subscriptions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── upload_usage_logs ─────────────────────────────────────────────────────
alter table public.upload_usage_logs enable row level security;

drop policy if exists "upload_usage_logs_owner_select" on public.upload_usage_logs;
drop policy if exists "upload_usage_logs_owner_insert" on public.upload_usage_logs;
drop policy if exists "upload_usage_logs_staff_all" on public.upload_usage_logs;

create policy "upload_usage_logs_owner_select" on public.upload_usage_logs
  for select to authenticated using (user_id = auth.uid());

create policy "upload_usage_logs_owner_insert" on public.upload_usage_logs
  for insert to authenticated with check (user_id = auth.uid());

create policy "upload_usage_logs_staff_all" on public.upload_usage_logs
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── plans (subscription plans) ────────────────────────────────────────────
alter table public.plans enable row level security;

drop policy if exists "plans_public_select" on public.plans;
drop policy if exists "plans_staff_all" on public.plans;

-- Pricing is public data; customers read it from the subscription page.
create policy "plans_public_select" on public.plans
  for select to anon, authenticated using (true);

create policy "plans_staff_all" on public.plans
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── pricing_plans (one-time pricing tiers) ────────────────────────────────
alter table public.pricing_plans enable row level security;

drop policy if exists "pricing_plans_public_select" on public.pricing_plans;
drop policy if exists "pricing_plans_staff_all" on public.pricing_plans;

create policy "pricing_plans_public_select" on public.pricing_plans
  for select to anon, authenticated using (true);

create policy "pricing_plans_staff_all" on public.pricing_plans
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── payout_settings ───────────────────────────────────────────────────────
alter table public.payout_settings enable row level security;

drop policy if exists "payout_settings_auth_select" on public.payout_settings;
drop policy if exists "payout_settings_staff_all" on public.payout_settings;

-- Shown to customers during the payment flow; only staff can change them.
create policy "payout_settings_auth_select" on public.payout_settings
  for select to authenticated using (true);

create policy "payout_settings_staff_all" on public.payout_settings
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── anti_abuse_signals / trial_attempts (service-role only) ───────────────
-- No policies: RLS on + no grants means only service-role writes work.
alter table public.anti_abuse_signals enable row level security;
alter table public.trial_attempts enable row level security;

-- ── platform_settings (already handled in 20260807) ───────────────────────
-- Left untouched.
