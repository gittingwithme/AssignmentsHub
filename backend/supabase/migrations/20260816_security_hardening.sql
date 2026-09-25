-- Security hardening: close RLS gaps that allowed direct REST API tampering
--
-- Background
-- ----------
-- Postgres RLS restricts whole ROWS, not columns. The existing owner policies
-- (e.g. `users_owner_update`, `orders_owner_update`) let an authenticated user
-- update their OWN row — including columns that must never be client-writable:
--   • public.users.role          → privilege escalation to admin/super_admin
--   • public.orders.price / payment_status / final_output_locked / status
--   • public.invoices.status / amount_cents
--   • public.payment_approvals.approved_at / rejected_at / paid_at / by
-- Any logged-in user could PATCH these via the Supabase REST API (anon key +
-- their own session) and bypass the entire payment flow.
--
-- Fix: BEFORE INSERT/UPDATE triggers that re-check the caller's staff status
-- (`auth.role()` / `is_staff()`) and reject protected column changes. Service
-- role and staff keep full access (the app's server actions run as the signed
-- in staff member or via the service role).
--
-- Storage note: final outputs are now written to `outputs/{order_id}/...`
-- (no user id in the path). The owner storage policies only match
-- `orders/{user_id}/...`, so customers can never read, list, or sign URLs for
-- final outputs — access goes through the server-side download proxy
-- (/api/orders/[id]/files/[fileId]/download) which enforces the lock state.
-- Legacy files already stored under orders/{uid}/.../final-* should be moved
-- to outputs/{order_id}/ (or deleted pre-launch).

-- ── users: block role escalation and foreign-row creation ──────────────────
create or replace function public.guard_users_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role (server actions) and staff may change roles.
  if auth.role() = 'service_role' or public.is_staff() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id is distinct from auth.uid() then
      raise exception 'Cannot create a user row for another account';
    end if;
    if new.role is distinct from 'customer' then
      raise exception 'Cannot set a role at registration';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Cannot change role';
  end if;

  return new;
end;
$$;

drop trigger if exists users_role_guard on public.users;
create trigger users_role_guard
before insert or update on public.users
for each row execute function public.guard_users_role();

-- ── orders: restrict customer updates to the payment-submission transition ──
create or replace function public.guard_order_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_staff() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Customers may create orders, but only in the initial locked state.
    -- (Subscription orders are inserted as payment_status 'approved' while
    -- still locked; the lock is what gates delivery.)
    if new.final_output_locked is distinct from true then
      raise exception 'New orders must start locked';
    end if;
    if new.status_key is distinct from 'review_pending' then
      raise exception 'New orders must start in review';
    end if;
    if new.payment_status not in ('invoice_created', 'approved') then
      raise exception 'Invalid initial payment status';
    end if;
    return new;
  end if;

  -- Non-staff may only change payment/status fields, and only toward the
  -- "payment submitted" state (the customer's notifyPaymentMade action).
  if new.payment_status is distinct from old.payment_status
     or new.status is distinct from old.status
     or new.status_key is distinct from old.status_key then
    if new.payment_status <> 'pending_approval'
       or old.payment_status not in ('invoice_created', 'rejected', 'pending_approval')
       or new.status <> 'payment_submitted'
       or new.status_key <> 'payment_submitted' then
      raise exception 'Not allowed to change order payment/status state';
    end if;
  end if;

  -- Protected columns: never writable by non-staff.
  if new.user_id is distinct from old.user_id
     or new.price is distinct from old.price
     or new.quote_amount_cents is distinct from old.quote_amount_cents
     or new.final_output_locked is distinct from old.final_output_locked
     or new.is_trial_order is distinct from old.is_trial_order
     or new.submission_mode is distinct from old.submission_mode
     or new.file_url is distinct from old.file_url
     or new.file_urls is distinct from old.file_urls then
    raise exception 'Not allowed to modify protected order fields';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_guard on public.orders;
create trigger orders_guard
before insert or update on public.orders
for each row execute function public.guard_order_updates();

-- ── invoices: amount/reference immutable for customers, status restricted ───
create or replace function public.guard_invoice_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_staff() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then
      raise exception 'Cannot create an invoice for another account';
    end if;
    if new.status is distinct from 'invoice_created' then
      raise exception 'Cannot create an invoice in a non-initial status';
    end if;
    -- The amount must match the order's quoted price (never client-set).
    if not exists (
      select 1 from public.orders o
      where o.id = new.order_id
        and o.user_id = new.user_id
        and coalesce(o.quote_amount_cents, round(o.price * 100)) = new.amount_cents
    ) then
      raise exception 'Invoice amount does not match the order quote';
    end if;
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.order_id is distinct from old.order_id
     or new.amount_cents is distinct from old.amount_cents
     or new.reference_code is distinct from old.reference_code then
    raise exception 'Not allowed to modify protected invoice fields';
  end if;

  if new.status is distinct from old.status then
    if new.status <> 'pending_approval'
       or old.status not in ('invoice_created', 'rejected', 'pending_approval') then
      raise exception 'Not allowed to change invoice status';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_guard on public.invoices;
create trigger invoices_guard
before insert or update on public.invoices
for each row execute function public.guard_invoice_updates();

-- ── payment_approvals: results are staff-only; customers may only resubmit ──
create or replace function public.guard_payment_approval_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_staff() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then
      raise exception 'Cannot create a payment approval for another account';
    end if;
    if new.approved_at is not null
       or new.approved_by is not null
       or new.rejected_at is not null
       or new.rejected_by is not null
       or new.paid_at is not null then
      raise exception 'Cannot create a payment approval with a result';
    end if;
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.invoice_id is distinct from old.invoice_id then
    raise exception 'Not allowed to modify protected approval fields';
  end if;

  -- Customers may clear results (resubmit) but never set them.
  if new.approved_at is not null and new.approved_at is distinct from old.approved_at then
    raise exception 'Not allowed to set payment approval result';
  end if;
  if new.approved_by is not null and new.approved_by is distinct from old.approved_by then
    raise exception 'Not allowed to set payment approval result';
  end if;
  if new.rejected_at is not null and new.rejected_at is distinct from old.rejected_at then
    raise exception 'Not allowed to set payment approval result';
  end if;
  if new.rejected_by is not null and new.rejected_by is distinct from old.rejected_by then
    raise exception 'Not allowed to set payment approval result';
  end if;
  if new.paid_at is not null and new.paid_at is distinct from old.paid_at then
    raise exception 'Not allowed to set payment approval result';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_approvals_guard on public.payment_approvals;
create trigger payment_approvals_guard
before insert or update on public.payment_approvals
for each row execute function public.guard_payment_approval_updates();

-- ── storage: customers may only read their own uploads under orders/{uid}/ ──
drop policy if exists "assignments_owner_select" on storage.objects;
create policy "assignments_owner_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assignments'
    and (storage.foldername(name))[1] = 'orders'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
