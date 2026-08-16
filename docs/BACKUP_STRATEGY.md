# Backup Strategy & Restoration Testing

## Overview

This document defines the backup, retention, and restoration procedures for AssignmentsHub. It covers Supabase (PostgreSQL), Vercel (frontend), and configuration/secret backups.

---

## 1. Supabase (PostgreSQL) Backups

### Built-in (Automatic)

| Plan | Point-in-Time Recovery (PITR) | Manual Backups | Retention |
|------|------------------------------|----------------|-----------|
| Free | ❌ | ❌ | N/A |
| Pro | ✅ 7 days | ✅ Daily | 7 days |
| Team | ✅ 7 days | ✅ Daily | 7 days |
| Enterprise | ✅ 30 days | ✅ Daily + on-demand | 30+ days |

**Current requirement**: Use **Pro or Team plan minimum** for production to enable PITR.

### What's Covered by PITR
- All database clusters (including `auth` schema)
- Continuous WAL archiving
- Restore to any second within retention window

### Manual Backup Schedule (Supplement to PITR)

| Frequency | Scope | Storage | Tool |
|-----------|-------|---------|------|
| Daily (03:00 UTC) | Full `public` schema + `auth.users` | S3/GCS bucket | `pg_dump` via GitHub Actions |
| Weekly (Sunday 04:00) | Full cluster (all schemas) | S3/GCS bucket | `pg_dumpall` via Supabase Dashboard |
| Before major migrations | Full cluster | S3/GCS + local | `supabase db dump` |

### Backup Verification (Monthly)

```bash
# 1. Restore latest daily backup to a temporary Supabase project
supabase db restore --project-ref <temp-project> --file s3://bucket/daily/latest.dump

# 2. Verify row counts match
supabase db shell --project-ref <temp-project> -c "
  SELECT schemaname, relname, n_live_tup
  FROM pg_stat_user_tables
  ORDER BY schemaname, relname;"

# 3. Spot-check critical tables
supabase db shell --project-ref <temp-project> -c "
  SELECT count(*) FROM users;
  SELECT count(*) FROM orders;
  SELECT count(*) FROM security_audit_log;"
```

---

## 2. Vercel (Frontend) Backups

### Automatic
- **Source code**: Git history (GitHub) — every commit is a backup
- **Deployments**: Vercel retains last 100 deployments per project
- **Environment variables**: Stored in Vercel Dashboard (not in git)

### Manual (Recommended)
- Export Vercel project config quarterly:
  ```bash
  vercel inspect <deployment-url> --output=json > vercel-config-$(date +%F).json
  ```
- Screenshot/copy Environment Variables page quarterly

---

## 3. Configuration & Secrets Backups

### What to Back Up (Not in Git)

| Item | Location | Backup Method | Frequency |
|------|----------|---------------|-----------|
| Supabase Dashboard settings (CORS, Auth providers, Rate limits, SMTP) | Supabase Dashboard | Screenshot/JSON export | Monthly + before changes |
| Cloudflare WAF rules, Zone Lockdown, Rate limits | Cloudflare Dashboard | API export (`cf zones settings list`) | Monthly + before changes |
| Cloudflare Turnstile site keys | Cloudflare Dashboard → Turnstile | Copy to password manager | On creation + rotation |
| Resend API keys & domains | Resend Dashboard | Copy to password manager | On creation + rotation |
| Sentry DSNs & alert rules | Sentry Dashboard | Export via API | Monthly |
| PagerDuty/Slack webhook URLs | Respective dashboards | Copy to password manager | On creation |

### Secrets Management
- **Primary**: 1Password / Bitwarden vault (shared team vault)
- **Backup**: Printed QR codes in physical safe (for recovery keys)
- **Rotation**: Every 90 days for service keys; immediately on team member departure

---

## 4. Restoration Procedures

### Scenario A: Database Corruption / Accidental DELETE

**RTO Target**: 30 minutes (PITR)
**RPO Target**: < 1 second (continuous WAL)

```bash
# 1. Identify the restore timestamp (just before incident)
# 2. In Supabase Dashboard → Database → Backups → Point-in-Time Recovery
# 3. Select timestamp → "Restore to new project"
# 4. Verify data in new project
# 5. Swap DNS / update NEXT_PUBLIC_SUPABASE_URL to new project
# 6. Run migrations if schema drifted
```

### Scenario B: Entire Supabase Project Deleted

**RTO Target**: 2 hours
**RPO Target**: Last daily backup (24h max)

```bash
# 1. Create new Supabase project
# 2. Restore latest pg_dump from S3
supabase db restore --project-ref <new-project> --file s3://bucket/daily/latest.dump

# 3. Re-create auth users (not in pg_dump of public schema)
#    Option A: Supabase Support can restore auth from cluster backup
#    Option B: Re-invite users via admin panel
# 4. Update all environment variables to new project ref
# 5. Redeploy frontend (Vercel auto-deploys on env var change)
```

### Scenario C: Vercel Project Corrupted

**RTO Target**: 15 minutes
**RPO Target**: 0 (git is source of truth)

```bash
# 1. Delete Vercel project
# 2. Re-import from GitHub
# 3. Re-add environment variables from password manager
# 4. Deploy — builds from git, no data loss
```

### Scenario D: Ransomware / Full Account Compromise

**RTO Target**: 4 hours
**RPO Target**: Last verified backup

1. **Freeze**: Rotate ALL secrets (Supabase, Cloudflare, Resend, Sentry, Vercel)
2. **Audit**: Check `security_audit_log` for unauthorized access
3. **Restore**: Fresh Supabase project + latest verified backup
4. **Verify**: Run test suite against restored data
5. **Communicate**: Notify users if PII was exposed (GDPR 72h)

---

## 5. Backup Testing Schedule

| Test | Frequency | Owner | Success Criteria |
|------|-----------|-------|------------------|
| PITR restore to temp project | Monthly | DevOps | Row counts match; app connects |
| Full pg_dump restore | Quarterly | DevOps | Schema + data intact; auth works |
| Vercel re-import from git | Quarterly | DevOps | Deploys clean; env vars applied |
| Secrets rotation drill | Quarterly | Lead Engineer | All services accept new keys |
| Ransomware tabletop | Bi-annually | Whole Team | Runbook executed in <4h |

### Test Documentation Template

```markdown
## Backup Test - $(date +%F)

**Type**: PITR / Full Restore / Vercel Re-import / Secrets Rotation
**Initiator**: @username
**Start**: 2026-08-16 14:00 UTC
**End**: 2026-08-16 14:23 UTC
**RTO Actual**: 23 minutes
**RPO Actual**: <1 second (PITR) / 24h (daily backup)

**Steps Performed**:
1. ...
2. ...

**Verification**:
- [ ] Row counts match production
- [ ] App starts and serves traffic
- [ ] Auth login works
- [ ] MFA challenge works
- [ ] Audit log query returns recent entries

**Issues**: None / [describe]
**Action Items**: [if any]
```

---

## 6. Retention Policy

| Data Type | Retention | Deletion Method |
|-----------|-----------|-----------------|
| Supabase PITR (WAL) | 7 days (Pro) / 30 days (Enterprise) | Automatic |
| Daily pg_dump (S3) | 90 days | S3 Lifecycle → Glacier → Delete |
| Weekly pg_dumpall (S3) | 1 year | S3 Lifecycle → Glacier → Delete |
| Vercel deployments | 100 most recent | Automatic |
| Sentry events | 90 days (Team) / 1 year (Business) | Automatic |
| Cloudflare logs | 72h (Free) / 30d (Pro) / 1y (Enterprise) | Automatic |
| `security_audit_log` table | **Indefinite** (audit requirement) | Manual purge only |
| Application logs (Vercel) | 7 days (Hobby) / 30 days (Pro) | Automatic |

---

## 7. Compliance Notes

- **GDPR Art. 32**: "Ability to restore availability and access to personal data in a timely manner" → PITR + tested restores satisfy this
- **SOC2 CC7.2**: "System monitoring includes... backup and recovery" → This doc + test logs are evidence
- **PCI DSS 10.5**: "Audit trail retention ≥ 1 year" → `security_audit_log` retained indefinitely

---

## 8. Emergency Contacts

| Role | Name | Contact | Backup |
|------|------|---------|--------|
| Primary DB Admin | | | |
| Secondary DB Admin | | | |
| Vercel Account Owner | | | |
| Cloudflare Account Owner | | | |
| Supabase Support | support@supabase.io | Dashboard → Support | |

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│  BACKUP QUICK REFERENCE                                     │
├─────────────────────────────────────────────────────────────┤
│  PITR:           Supabase Dashboard → Database → Backups    │
│  Daily Dump:     GitHub Actions → "nightly-backup" workflow │
│  S3 Bucket:      s3://assignmentshub-backups/               │
│  Secrets Vault:  1Password → "AssignmentsHub Production"    │
│  Test Schedule:  1st Monday each month, 14:00 UTC           │
│  Runbook:        This document + Incident Runbooks          │
└─────────────────────────────────────────────────────────────┘
```

---

*Last reviewed: 2026-08-16*
*Next review: 2026-11-16*