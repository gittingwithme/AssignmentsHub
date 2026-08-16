# Cloudflare WAF & DDoS Protection Configuration

## Overview

Cloudflare provides Web Application Firewall (WAF) and DDoS protection at the edge. Configure these rules in the Cloudflare Dashboard for your production domain.

## Prerequisites

- Domain proxied through Cloudflare (orange cloud enabled)
- Cloudflare account with WAF access (Pro plan+ for custom rules)

---

## 1. DDoS Protection (Automatic - All Plans)

### Managed DDoS Ruleset (Enabled by Default)
Cloudflare automatically applies:
- L3/4 volumetric attack mitigation
- L7 HTTP flood protection
- DNS amplification protection

**Verification**: Dashboard → Security → DDoS → "Managed Ruleset" shows "On"

### HTTP DDoS Attack Protection
Configure sensitivity in **Security → DDoS → HTTP DDoS Attack Protection**:

| Rule | Sensitivity | Action |
|------|-------------|--------|
| HTTP Anomaly Detection | Medium | Managed Challenge |
| HTTP Request Rate | Medium | Managed Challenge |
| HTTP Request Intensity | Medium | Managed Challenge |

---

## 2. WAF Managed Rulesets (Pro+ Plan)

Enable these **Managed Rulesets** in **Security → WAF → Managed Rules**:

| Ruleset | Description | Action |
|---------|-------------|--------|
| Cloudflare Managed Ruleset | OWASP Top 10, CVEs, common exploits | Block |
| Cloudflare OWASP Managed Ruleset | OWASP Core Rule Set (CRS) | Block |
| Cloudflare WordPress Ruleset | Only if using WordPress | N/A |

**Note**: Monitor for false positives initially. Use "Log" mode first, then "Block".

---

## 3. Custom WAF Rules (Pro+ Plan)

Create in **Security → WAF → Custom Rules**:

### Rule 1: Block Known Bad Bots / Scanners
```
Expression: (cf.client.bot or http.user_agent contains "sqlmap" or http.user_agent contains "nikto" or http.user_agent contains "nmap" or http.user_agent contains "masscan" or http.user_agent contains "zgrab")
Action: Block
Description: Block known vulnerability scanners
```

### Rule 2: Rate Limit Auth Endpoints (Additional to App-Level)
```
Expression: (http.request.uri.path matches "^/api/auth/" or http.request.uri.path matches "^/login" or http.request.uri.path matches "^/sign-up" or http.request.uri.path matches "^/forgot-password" or http.request.uri.path matches "^/reset-password")
Action: Rate Limit (10 requests/minute per IP)
Description: Protect auth endpoints from brute force
```

### Rule 3: Block Access to Sensitive Paths
```
Expression: (http.request.uri.path matches "^/\.git" or http.request.uri.path matches "^/\.env" or http.request.uri.path matches "^/config" or http.request.uri.path matches "^/wp-admin" or http.request.uri.path matches "^/phpmyadmin" or http.request.uri.path matches "^/adminer")
Action: Block
Description: Block access to sensitive files/directories
```

### Rule 4: Restrict API to Expected Methods
```
Expression: (http.request.uri.path matches "^/api/" and http.request.method not in {"GET" "POST" "PUT" "PATCH" "DELETE" "OPTIONS"})
Action: Block
Description: Only allow standard HTTP methods on API
```

### Rule 5: Block Large Request Bodies (DoS Prevention)
```
Expression: (http.request.body.truncated or http.request.content_length > 1000000)
Action: Block
Description: Reject requests > 1MB (adjust for file uploads)
```

### Rule 6: Require HTTPS (Redirect at Edge)
```
Expression: (not ssl)
Action: Redirect (301) to https://your-domain.com${http.request.uri.path}
Description: Force HTTPS at edge
```

---

## 4. Bot Management (Business/Enterprise Plan)

If on Business/Enterprise, enable **Bot Management** in **Security → Bots**:

- **Definitely Automated**: Managed Challenge
- **Likely Automated**: JavaScript Challenge
- **Verified Bots** (Google, Bing, etc.): Allow

For Pro plan, use **Super Bot Fight Mode** (Security → Bots → Super Bot Fight Mode):
- Enable "Definitely Automated" → Managed Challenge

---

## 5. Security Headers via Cloudflare Workers (All Plans)

Create a Worker to add security headers:

```javascript
// Cloudflare Worker: security-headers
export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request);
    const newHeaders = new Headers(response.headers);
    
    // CSP - adjust for your needs
    newHeaders.set('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com; " +
      "frame-src https://challenges.cloudflare.com; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self';"
    );
    
    newHeaders.set('X-Frame-Options', 'DENY');
    newHeaders.set('X-Content-Type-Options', 'nosniff');
    newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    newHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
    newHeaders.set('Cross-Origin-Resource-Policy', 'same-origin');
    
    // HSTS (1 year, include subdomains, preload)
    newHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
```

Deploy to route `your-domain.com/*`.

---

## 6. Zone Lockdown (Business/Enterprise)

Restrict admin areas to specific IPs:

**Security → WAF → Zone Lockdown**
- URL: `your-domain.com/admin-dashboard*`
- IP Range: Your office VPN / static IP
- Action: Block (403)

---

## 7. Rate Limiting Rules (All Plans)

**Security → WAF → Rate Limiting Rules**:

| Rule | Threshold | Period | Action |
|------|-----------|--------|--------|
| Global API | 100 req | 1 min | Managed Challenge |
| Auth endpoints | 10 req | 1 min | Block (15 min) |
| Password reset | 3 req | 1 hour | Block (1 hour) |
| File upload | 5 req | 1 min | Managed Challenge |

---

## 8. SSL/TLS Settings

**SSL/TLS → Overview**:
- **Encryption Mode**: Full (Strict) — requires valid cert on origin
- **Always Use HTTPS**: On
- **Automatic HTTPS Rewrites**: On
- **Minimum TLS Version**: 1.2 (or 1.3 if supported)

**SSL/TLS → Edge Certificates**:
- **TLS 1.3**: On
- **Opportunistic Encryption**: On
- **Certificate Transparency Monitoring**: On (alerts on cert issuance)

---

## 9. DNS Security

**DNS → Records**:
- Proxy status: **Proxied (orange cloud)** for all A/AAAA/CNAME records
- **DNSSEC**: Enable (DNS → DNSSEC)
- **CAA Records**: Add for your cert authorities (Let's Encrypt, etc.)

---

## 10. Monitoring & Alerts

### Analytics
- **Security → Events**: Review WAF/DDoS events daily
- **Analytics → Security**: Traffic patterns, attack trends

### Alerting (via Notifications)
Configure in **Notifications → Create**:
- **WAF Events**: High severity → Email/Slack/PagerDuty
- **DDoS Attack**: Any → Email/Slack
- **Rate Limit Triggered**: >50 events/hour → Email

### Logpush (Enterprise)
Push WAF logs to:
- S3/GCS for long-term storage
- Splunk/Datadog/Sentinel for SIEM
- BigQuery for analytics

---

## 11. Testing Checklist

```bash
# Test WAF blocks SQL injection attempt
curl "https://your-domain.com/api/test?id=1' OR '1'='1"

# Test rate limiting
for i in {1..15}; do curl -I https://your-domain.com/login; done

# Test security headers
curl -I https://your-domain.com/

# Test HTTPS redirect
curl -I http://your-domain.com/

# Test Zone Lockdown (should 403 from non-allowed IP)
curl -I https://your-domain.com/admin-dashboard
```

---

## 12. Cost Optimization

| Feature | Plan Required |
|---------|---------------|
| DDoS Protection (L3/4, L7 managed) | Free |
| Managed WAF Rulesets | Pro ($20/mo) |
| Custom WAF Rules | Pro ($20/mo) - 5 rules |
| Rate Limiting | Pro ($20/mo) - 10 rules |
| Bot Fight Mode | Pro ($20/mo) |
| Advanced Bot Management | Business ($200/mo) |
| Zone Lockdown | Business ($200/mo) |
| Logpush | Enterprise |

---

## 13. Emergency: Under Attack Mode

If under active attack:
1. Dashboard → Overview → **Under Attack Mode** → Toggle ON
2. This presents JS challenge to ALL visitors
3. Monitor → When attack subsides, toggle OFF

---

## Notes

- All Cloudflare config is **dashboard-based** — no code changes needed
- Test rules in **Log** mode first, then switch to **Block**
- WAF rules execute **before** your application (at edge)
- App-level rate limiting (middleware) is **defense in depth** — both layers recommended
- Keep Supabase CORS + Cloudflare WAF in sync (allowed origins)