-- Rate limiting table for auth endpoints
-- Tracks failed login/signup attempts to prevent brute force attacks

create table if not exists public.rate_limits (
  key text primary key,
  attempts integer not null default 1,
  first_attempt_at timestamptz not null default now()
);

-- Auto-cleanup: delete entries older than 1 hour
create or replace function public.cleanup_old_rate_limits()
returns void
language sql
security definer
as $$
  delete from public.rate_limits
  where first_attempt_at < now() - interval '1 hour';
$$;

-- Create index for faster lookups
create index if not exists rate_limits_first_attempt_idx on public.rate_limits(first_attempt_at);

-- Enable RLS
alter table public.rate_limits enable row level security;

-- Only service role can manage rate limits (server-side only)
drop policy if exists "rate_limits_service_role_only" on public.rate_limits;
create policy "rate_limits_service_role_only" on public.rate_limits
  for all to service_role using (true) with check (true);
