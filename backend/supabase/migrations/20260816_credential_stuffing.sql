-- Credential stuffing detection indexes.
--
-- The credential-stuffing monitor (frontend/lib/credential-stuffing-monitor.ts)
-- pings the audit log on every failed login with:
--   WHERE action = 'login_failed' AND ip_address = $1 AND created_at >= $2
-- and once more for the cooldown with action = 'credential_stuffing_detected'.
-- These composite indexes make both lookups index-only and bounded.

-- Failed-logins by IP within a time window.
create index if not exists security_audit_log_action_ip_created_idx
  on public.security_audit_log (action, ip_address, created_at desc);

-- The single-action indexes already exist (action_idx, created_at_idx), but
-- add a partial index so the stuffing cooldown lookup is even cheaper.
create index if not exists security_audit_log_stuffing_ip_created_idx
  on public.security_audit_log (ip_address, created_at desc)
  where action = 'credential_stuffing_detected';
