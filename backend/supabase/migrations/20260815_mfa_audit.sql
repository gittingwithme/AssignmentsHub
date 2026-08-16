-- MFA/TOTP support for Supabase Auth
-- Supabase handles MFA factors in auth.mfa_factors and auth.mfa_challenges
-- This migration adds helper functions and enables MFA in auth config

-- Enable MFA in auth config (run in Supabase SQL Editor)
-- UPDATE auth.config SET enable_mfa = true;

-- Helper: Check if user has MFA enabled
create or replace function public.user_has_mfa(user_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from auth.mfa_factors
    where user_id = $1 and factor_type = 'totp' and status = 'verified'
  )
$$;

-- Helper: Get user's verified TOTP factor
create or replace function public.get_user_totp_factor(user_id uuid)
returns auth.mfa_factors
language sql
security definer
as $$
  select * from auth.mfa_factors
  where user_id = $1 and factor_type = 'totp' and status = 'verified'
  limit 1
$$;

-- Audit log table for security events
create table if not exists public.security_audit_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_log_user_id_idx on public.security_audit_log(user_id);
create index if not exists security_audit_log_action_idx on public.security_audit_log(action);
create index if not exists security_audit_log_created_at_idx on public.security_audit_log(created_at desc);

-- Enable RLS on audit log
alter table public.security_audit_log enable row level security;

-- Only service role and staff can read audit logs
create policy "security_audit_log_staff_select" on public.security_audit_log
  for select to authenticated
  using (public.is_staff());

-- Service role can insert (server actions use service role)
create policy "security_audit_log_service_insert" on public.security_audit_log
  for insert to service_role
  with check (true);