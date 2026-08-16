-- Platform-wide settings (maintenance mode, etc.)
-- Run this migration in the Supabase SQL editor or via CLI.

create table if not exists public.platform_settings (
  id text primary key default 'global',
  maintenance_enabled boolean not null default false,
  maintenance_title text not null default 'Under Maintenance',
  maintenance_description text not null default 'AssignmentsHub is temporarily unavailable while we perform upgrades. Please check back soon.',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

insert into public.platform_settings (id, maintenance_enabled, maintenance_title, maintenance_description)
values (
  'global',
  false,
  'Under Maintenance',
  'AssignmentsHub is temporarily unavailable while we perform upgrades. Please check back soon.'
)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- Anyone can read maintenance state (needed for middleware gate)
create policy "platform_settings_public_read"
  on public.platform_settings
  for select
  to anon, authenticated
  using (true);

-- Only super admins can update (via service role in server actions)
create policy "platform_settings_super_admin_update"
  on public.platform_settings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'super_admin'
    )
  );
