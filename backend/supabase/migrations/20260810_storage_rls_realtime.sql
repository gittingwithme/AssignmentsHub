-- Storage RLS hardening + realtime messaging
-- Run this migration in the Supabase SQL editor (or via CLI).
--
-- 1. Makes the 'assignments' storage bucket private.
-- 2. Restricts object access: customers only touch their own orders/... paths,
--    staff (admin/super_admin) can manage everything in the bucket.
-- 3. Enables RLS on messages (participants + staff only).
-- 4. Adds messages to the supabase_realtime publication so the chat
--    receives live INSERT events.

-- ── 1) Bucket: ensure it exists and is private ─────────────────────────────
insert into storage.buckets (id, name, public)
values ('assignments', 'assignments', false)
on conflict (id) do update set public = false;

-- ── 2) Storage object policies ─────────────────────────────────────────────
-- Drop the standard Supabase-generated public-bucket policies if present.
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Give anon users access to objects in bucket assignments" on storage.objects;
drop policy if exists "Give authenticated users access to objects in bucket assignments" on storage.objects;

-- Objects live under orders/{user_id}/{order_id}/... so foldername(name)[2]
-- is the owner's user id.
drop policy if exists "assignments_owner_insert" on storage.objects;
create policy "assignments_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assignments'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "assignments_owner_select" on storage.objects;
create policy "assignments_owner_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assignments'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "assignments_staff_all" on storage.objects;
create policy "assignments_staff_all"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'assignments'
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'assignments'
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('admin', 'super_admin')
    )
  );

-- ── 3) Messages RLS ────────────────────────────────────────────────────────
alter table public.messages enable row level security;

drop policy if exists "messages_participant_select" on public.messages;
drop policy if exists "messages_participant_insert" on public.messages;
drop policy if exists "messages_participant_update" on public.messages;
drop policy if exists "messages_staff_all" on public.messages;

-- Participants (the order owner) can read the thread.
create policy "messages_participant_select"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = messages.order_id and o.user_id = auth.uid()
    )
  );

-- Participants can send on their own orders, only as themselves.
create policy "messages_participant_insert"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = messages.order_id and o.user_id = auth.uid()
    )
  );

-- Participants can mark messages read on their own orders.
create policy "messages_participant_update"
  on public.messages for update to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = messages.order_id and o.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = messages.order_id and o.user_id = auth.uid()
    )
  );

-- Staff see, send, and manage every thread.
create policy "messages_staff_all"
  on public.messages for all to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('admin', 'super_admin')
    )
  );

-- ── 4) Realtime publication ────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
