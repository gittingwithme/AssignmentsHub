# Supabase CORS Configuration

## Overview

Supabase allows configuring CORS (Cross-Origin Resource Sharing) to restrict which origins can make requests to your Supabase project. This prevents malicious sites from making authenticated requests on behalf of your users.

## Required Configuration

### Production Supabase Project

In the Supabase Dashboard:
1. Go to **Project Settings** → **API**
2. Scroll to **CORS (Cross-Origin Resource Sharing)**
3. Add only your production domain(s):
   ```
   https://your-domain.com
   https://www.your-domain.com
   ```
4. **Do NOT** add `http://localhost:3000`, `http://127.0.0.1:3000`, or wildcard `*`

### Staging Supabase Project

Separate Supabase project for staging:
```
https://staging.your-domain.com
```

### Development Supabase Project

Separate Supabase project for development (or use local Supabase):
```
http://localhost:3000
http://127.0.0.1:3000
```

## Verification

Test CORS is working correctly:

```bash
# Should succeed (allowed origin)
curl -H "Origin: https://your-domain.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: authorization,apikey,content-type" \
     -X OPTIONS \
     https://your-project.supabase.co/auth/v1/token

# Should fail (disallowed origin)
curl -H "Origin: https://evil.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: authorization,apikey,content-type" \
     -X OPTIONS \
     https://your-project.supabase.co/auth/v1/token
```

## Why Separate Projects?

Using separate Supabase projects per environment provides defense in depth:
- **Dev credentials leaked** → only dev data exposed
- **Staging compromised** → prod data isolated
- **CORS misconfiguration** → limited to single environment
- **RLS policies** → tested against production schema in staging

## Additional Supabase Security Settings

### Auth Providers
Disable providers you don't use:
- Only enable: Email, Google (if used)
- Disable: GitHub, GitLab, Bitbucket, etc. unless needed

### Email Templates
Customize in **Authentication** → **Email Templates**:
- Confirm signup
- Reset password
- Magic link
- Change email
Use your production domain in all links.

### JWT Settings (Dashboard → Authentication → Settings)
- **JWT Expiry**: 3600 seconds (1 hour) — shorter = more secure
- **Refresh Token Rotation**: Enabled
- **Refresh Token Reuse Interval**: 10 seconds
- **OTP Expiry**: 3600 seconds

### Rate Limiting (Dashboard → Authentication → Rate Limits)
Configure Supabase-side rate limits as defense in depth:
- Sign up: 5/hour/IP
- Sign in: 10/hour/IP
- Password reset: 3/hour/IP
- OTP SMS: 5/hour/phone
- OTP Email: 10/hour/email

### Network Restrictions (Pro/Enterprise)
If on Pro/Enterprise plan, enable **Network Restrictions** to limit API access to your Vercel/Cloudflare IP ranges.

## Notes

- CORS changes take effect immediately (no deploy needed)
- Supabase CORS applies to ALL endpoints (auth, REST, Realtime, Storage)
- For Storage, also configure **Bucket CORS** if using direct uploads
- The `SUPABASE_SERVICE_ROLE_KEY` bypasses CORS (server-side only)