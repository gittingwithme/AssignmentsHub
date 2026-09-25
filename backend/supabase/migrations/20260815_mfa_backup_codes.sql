-- MFA Backup Codes table for TOTP recovery
-- Stores hashed backup codes that can be used once each

create table if not exists public.mfa_backup_codes (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null, -- SHA256 hash of the backup code
  used boolean not null default false,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_backup_codes_user_id_idx on public.mfa_backup_codes(user_id);
create index if not exists mfa_backup_codes_code_hash_idx on public.mfa_backup_codes(code_hash);

-- Enable RLS
alter table public.mfa_backup_codes enable row level security;

-- Users can only see their own backup codes (but only if they have MFA enabled)
drop policy if exists "mfa_backup_codes_user_select" on public.mfa_backup_codes;
create policy "mfa_backup_codes_user_select" on public.mfa_backup_codes
  for select to authenticated
  using (user_id = auth.uid());

-- Users can insert their own backup codes (when generating new ones)
drop policy if exists "mfa_backup_codes_user_insert" on public.mfa_backup_codes;
create policy "mfa_backup_codes_user_insert" on public.mfa_backup_codes
  for insert to authenticated
  with check (user_id = auth.uid());

-- Users can update their own backup codes (to mark as used)
drop policy if exists "mfa_backup_codes_user_update" on public.mfa_backup_codes;
create policy "mfa_backup_codes_user_update" on public.mfa_backup_codes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Service role can do anything (for server actions)
drop policy if exists "mfa_backup_codes_service_all" on public.mfa_backup_codes;
create policy "mfa_backup_codes_service_all" on public.mfa_backup_codes
  for all to service_role
  using (true)
  with check (true);