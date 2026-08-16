-- Customer notification emails
-- Run this migration in the Supabase SQL editor (or via CLI) alongside
-- 20260810_storage_rls_realtime.sql.
--
-- Adds a denormalized email column to public.users so server actions can
-- notify customers about quotes, approvals, rejections, and status changes.
-- Backfills existing rows from auth.users so everyone is reachable immediately.

alter table public.users
  add column if not exists email text;

update public.users u
set email = au.email
from auth.users au
where au.id = u.id
  and (u.email is null or u.email = '');

create index if not exists users_email_idx
  on public.users (email);
