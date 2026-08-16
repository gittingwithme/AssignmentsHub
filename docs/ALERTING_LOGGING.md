# Alerting & Log Aggregation Configuration

## Overview

This project uses **Sentry** (already integrated) for error tracking and performance monitoring. This document describes the remaining configuration needed for production alerting and log aggregation.

---

## 1. Sentry Configuration (Required)

### Environment Variables

Set these in **Vercel Project Settings → Environment Variables** for each environment:

| Variable | Client? | Description |
|----------|---------|-------------|
| `SENTRY_DSN` | ❌ Server-only | Server-side DSN (from Sentry → Settings → Projects → Client Keys (DSN)) |
| `NEXT_PUBLIC_SENTRY_DSN` | ✅ Client-safe | Browser DSN (same as above, but allowed in client bundle) |
| `NEXT_PUBLIC_APP_VERSION` | ✅ Client-safe | App version for release tracking (e.g., `1.2.3`) |

### Sentry Project Setup

1. Create **two Sentry projects** (or one with environments):
   - `assignmentshub-staging`
   - `assignmentshub-production`

2. In each project, copy the **DSN** (Client Key) from **Settings → Projects → [Project] → Client Keys (DSN)**

3. Add DSNs to Vercel per environment:
   - **Preview/Development**: Staging DSN
   - **Production**: Production DSN

### Recommended Sentry Alert Rules

Create these in **Sentry → Settings → Alerts → Create Alert Rule**:

| Alert Name | Conditions | Actions |
|------------|------------|---------|
| **High Error Rate** | `event.count() > 10` in `5m` for `level:error` | Email + Slack/PagerDuty |
| **Critical Errors** | `event.count() > 0` in `1m` for `level:fatal` | PagerDuty (immediate) |
| **Auth Failures Spike** | Custom: `tags.credential_stuffing_detected = true` | Email + Slack |
| **Performance Degradation** | `transaction.duration.p95 > 3s` in `10m` | Email |
| **Database Errors** | `event.count() > 5` in `5m` for `tags.db_error = true` | Slack |

### Sentry Alert Rule JSON (for API import)

```json
{
  "name": "High Error Rate",
  "conditions": [
    {
      "type": "event_frequency",
      "query": "level:error",
      "aggregation": 10,
      "time_window": 300,
      "trigger": "above"
    }
  ],
  "actions": [
    {"type": "email", "target_type": "team"},
    {"type": "slack", "integration_id": "YOUR_SLACK_INTEGRATION_ID", "channel": "#alerts"}
  ],
  "projects": ["assignmentshub-production"],
  "environment": ["production"]
}
```

---

## 2. External Alerting Integrations (Required Manual Setup)

### PagerDuty
1. Sentry → Settings → Integrations → PagerDuty → **Add Integration**
2. Copy the **Integration Key** from PagerDuty
3. In Sentry alert rules, add PagerDuty action for Critical/Fatal alerts

### Slack
1. Sentry → Settings → Integrations → Slack → **Add to Slack**
2. Authorize workspace, pick `#alerts` channel
3. In Sentry alert rules, add Slack action

### Opsgenie / VictorOps / Datadog
Similar flow — Sentry has native integrations for all major incident management tools.

---

## 3. Log Aggregation Strategy

### Current State

| Source | Destination | Notes |
|--------|-------------|-------|
| Next.js runtime logs | Vercel Dashboard → Logs | Built-in, 7-day retention (Hobby), 30-day (Pro) |
| Sentry errors/events | Sentry UI | 90-day retention on Team plan |
| Cloudflare WAF/DDoS logs | Cloudflare Dashboard → Security Events | 72-hour on Free, 30-day on Pro |
| Supabase audit logs | `security_audit_log` table | Permanent until manually purged |

### Recommended Production Upgrade

For SOC2/compliance or long-term retention, push logs to a SIEM:

#### Option A: Vercel Log Drains (Pro/Enterprise)
```
Vercel → Settings → Log Drains → Add Drain
```
Destinations: **Datadog, Splunk, Sumo Logic, New Relic, Logtail, Custom HTTP endpoint**

#### Option B: Cloudflare Logpush (Enterprise)
```
Cloudflare → Analytics → Logs → Logpush
```
Push WAF/DDoS/HTTP request logs to **S3, GCS, Splunk, Datadog, Sentinel**

#### Option C: Supabase → External (via pg_cron + edge function)
Schedule a nightly export of `security_audit_log` to S3/GCS:
```sql
-- Run via pg_cron nightly
COPY (
  SELECT * FROM security_audit_log
  WHERE created_at >= now() - interval '1 day'
) TO PROGRAM 'aws s3 cp - s3://your-bucket/audit-logs/$(date +%F).csv';
```

---

## 4. Dashboard Recommendations

### Sentry Dashboards (Built-in)
- **Overview** → Error rate, throughput, adoption
- **Performance** → P50/P95/P99 latency by endpoint
- **Releases** → Error rate by deploy

### Custom Grafana/Datadog Dashboard (if using SIEM)
Key panels to build:
1. **Auth Health**: Login success/failure rate, MFA challenge rate, credential stuffing alerts
2. **API Health**: Request rate, error rate, p95 latency per endpoint
3. **Security Events**: WAF blocks, rate limit triggers, audit log inserts/hour
4. **Business**: Orders created, payments approved/rejected, active sessions

---

## 5. Environment-Specific Checklist

### Development
- [ ] `SENTRY_DSN` = staging project DSN (optional)
- [ ] `NEXT_PUBLIC_SENTRY_DSN` = staging project DSN (optional)
- [ ] Log level: `debug: true` in instrumentation

### Staging (Preview Deployments)
- [ ] `SENTRY_DSN` = staging project DSN
- [ ] `NEXT_PUBLIC_SENTRY_DSN` = staging project DSN
- [ ] Alert rules: **Disabled** or routed to a test channel

### Production
- [ ] `SENTRY_DSN` = production project DSN
- [ ] `NEXT_PUBLIC_SENTRY_DSN` = production project DSN
- [ ] Alert rules: **Enabled** → PagerDuty + Slack
- [ ] Log drain: Configured to SIEM (if applicable)
- [ ] Release tracking: `NEXT_PUBLIC_APP_VERSION` set on each deploy

---

## 6. Quick Verification Commands

```bash
# Test Sentry error capture (run in dev console)
Sentry.captureException(new Error("Test error from dashboard"))

# Verify DSN is loaded (dev tools console)
console.log(process.env.NEXT_PUBLIC_SENTRY_DSN)

# Check Vercel logs
vercel logs --follow [deployment-url]

# Query audit log directly
supabase db shell -c "SELECT * FROM security_audit_log ORDER BY created_at DESC LIMIT 20;"
```

---

## Notes

- **No code changes needed** for basic alerting — Sentry is already instrumented
- All external integrations (PagerDuty, Slack, SIEM) are **dashboard configurations**
- `SENTRY_DSN` must be a **server-only** variable; `NEXT_PUBLIC_SENTRY_DSN` is the **only** client-safe one
- The `beforeSend` hooks in `instrumentation.ts` and `instrumentation-client.ts` already strip cookies/authorization headers