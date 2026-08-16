-- Message replies
-- Run this migration in the Supabase SQL editor AFTER 20260811_realtime_payment_approvals.sql.
--
-- Adds messages.reply_to (the id of the message being replied to) so the
-- chat can render quoted replies. Idempotent — safe to re-run.

alter table public.messages
  add column if not exists reply_to uuid;

create index if not exists messages_reply_to_idx
  on public.messages (order_id, reply_to)
  where reply_to is not null;
