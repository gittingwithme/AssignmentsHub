# AssignmentsHub Security Implementation Checklist

## Authentication & Authorization

### Server-Side Authentication
- [x] Enforce server-side authentication in middleware (`frontend/middleware.ts`)
- [x] Verify all protected routes use server-side auth checks
- [x] Audit all server actions for proper authentication (`auth-actions.ts`, `admin-actions.ts`, etc.)

### Server-Side Admin Checks
- [x] Verify `requireAdminRole()` in `admin-actions.ts` is used for all admin operations
- [x] Ensure middleware blocks customer access to `/admin-dashboard` and `/super-admin` (lines 221-229)
- [x] Audit all admin endpoints for role validation

### 2FA/OTP Implementation
- [x] Research Supabase MFA capabilities (Supabase Auth MFA)
- [x] Implement TOTP (Time-based One-Time Password) option (`mfa-actions.ts`)
- [x] Add backup codes for account recovery (`mfa-actions.ts` + `mfa_backup_codes` table)
- [ ] Create enrollment flow for users to enable 2FA (UI needed)
- [ ] Add 2FA challenge step in login flow

### Strong Password Rules
- [x] Add client-side password strength validation
- [x] Add server-side password policy enforcement in `signup()` action
- [x] Minimum 12 characters
- [x] Require uppercase, lowercase, number, and special character
- [x] Maximum length to prevent DoS (128 chars)
- [x] Check password against user email/name (not contained)

### Leaked Password Detection
- [x] Integrate with HaveIBeenPwned API (k-anonymity model) (`lib/pwned-passwords.ts`)
- [x] Add server-side check before accepting passwords in signup (`auth-actions.ts:signup`)
- [x] Block passwords appearing in known breaches with informative error (also enforced on password reset)

### Password Hashing
- [x] Verify Supabase uses bcrypt/argon2 (handled by Supabase Auth)
- [x] Document that password hashing is managed by Supabase
- [x] Ensure no plaintext password logging or storage

### Secure Session Cookies
- [x] Verify Supabase session cookies have `HttpOnly` flag (set in `middleware.ts` cookie handler)
- [x] Verify `Secure` flag is set in production (set in `middleware.ts` + `session-management.ts`)
- [x] Set appropriate `SameSite` attribute (Lax) (set in `middleware.ts` + `session-management.ts`)
- [x] Configure cookie expiration times (absolute 24hr, idle 30min via `SESSION_CONFIG`)

### Session Token Storage
- [x] Audit codebase for localStorage session usage
- [x] Remove any session tokens from localStorage
- [x] Ensure only HTTP-only cookies store session data

### Session Management & Token Expiry
- [x] Configure Supabase JWT expiration (handled by Supabase Auth - 1 hour default)
- [x] Implement idle session timeout (30 minutes)
- [x] Add absolute session timeout (24 hours)
- [x] Implement secure logout (clear all session data)

### Password Reset Links
- [ ] Verify Supabase password reset expiry (should be short, e.g., 30 min) — Supabase default
- [ ] Ensure reset tokens are single-use — Supabase handles
- [x] Log password reset requests (`auth-actions.ts` logs `PASSWORD_RESET_REQUESTED` + `PASSWORD_RESET_COMPLETED`)

### Row-Level Security (RLS)
- [x] Enable RLS on all Supabase tables
- [x] Create RLS policies for `users` table (users can only read/update own row)
- [x] Create RLS policies for `orders` table (customers see own orders, admins see all)
- [x] Create RLS policies for `order_files` table
- [x] Create RLS policies for `invoices` table
- [x] Create RLS policies for `messages` table
- [x] Test RLS policies thoroughly

### Data Isolation / Lock Record Access
- [x] Audit all queries for proper user_id filtering
- [x] Ensure customers can only access their own records via UUID
- [x] Verify order isolation by user_id in all server actions
- [x] Add database-level constraints for multi-tenancy
- [ ] Test with multiple user accounts for data leakage

---

## Input Validation & Injection Prevention

### Input Sanitization
- [x] Install DOMPurify or similar sanitization library (`dompurify` + `jsdom` in package.json)
- [x] Sanitize all user-submitted text before display (`lib/sanitize.ts`)
- [x] Sanitize form inputs: title, description, messages (`sanitizeUserInput`, `sanitizeRichText`)
- [x] Sanitize URL parameters (`sanitizeUrl`)
- [x] Sanitize file names in upload functions (`sanitizeFilename`)

### Input Validation
- [x] Create centralized validation utilities (`lib/validation.ts`)
- [x] Validate email format server-side
- [x] Validate file types in `uploadAdminOutput()` with magic byte checking
- [x] Validate order status values (enum validation)
- [x] Validate all numeric inputs (prices, IDs)
- [x] Add Zod schema validation

### XSS Prevention
- [x] Audit all user-generated content rendering
- [x] Ensure React's default escaping is not bypassed
- [x] Use `dangerouslySetInnerHTML` only with sanitization (`sanitizeHtmlClient` in `lib/sanitize.ts`)
- [x] Add Content-Security-Policy header (implemented in `next.config.ts`)
- [ ] Test for stored XSS in messages, order titles

### Parameterized Queries
- [x] Verify all Supabase queries use parameterized methods (`.eq()`, `.in()`, etc.)
- [x] Audit for any raw SQL usage
- [x] Ensure no string concatenation in queries

### Field Tampering Prevention
- [x] Audit forms for hidden fields that shouldn't be modified
- [x] Validate pricing fields server-side (never trust client)
- [x] Prevent role escalation in profile updates
- [x] Validate order ownership before updates
- [x] Check for mass assignment vulnerabilities

### File Upload Security
- [x] Validate file type by content (magic bytes), not just extension
- [x] Enforce maximum file size limits (50MB)
- [x] Store uploads outside web root or in Supabase Storage
- [x] Rename files to prevent execution
- [x] Block executable extensions (.exe, .php, .sh, .bat)
- [x] Add virus scanning for uploads (ClamAV interface in `lib/virus-scan.ts`)
- [x] Validate MIME type matches claimed type
- [x] Quarantine suspicious files

---

## Application Security & Network

### Rate Limiting
- [x] Implement rate limiting on login endpoint (5 attempts / 15 min)
- [x] Implement rate limiting on password reset endpoint (3 attempts / 60 min)
- [x] Implement rate limiting on signup endpoint (3 attempts / 60 min)
- [x] Add general API rate limiting (middleware + Cloudflare WAF docs)
- [x] Store rate limit state in Supabase (`rate_limits` table)
- [x] Add progressive delays on failed auth attempts

### API Key & Secrets Management
- [x] Audit for hardcoded secrets in codebase
- [x] Move all secrets to environment variables
- [x] Verify `.env` files are in `.gitignore`
- [x] Use different keys for dev/staging/production (`docs/ENVIRONMENT.md`)
- [ ] Rotate API keys periodically
- [ ] Use Supabase secrets management

### Git Secrets Purge
- [x] Run `trufflehog` scan on repository (source code clean — only false positives in `node_modules/`)
- [x] Remove any accidentally committed secrets (none found in source)
- [ ] Use BFG Repo-Cleaner if needed
- [ ] Rotate any potentially exposed credentials

### Payment Webhook Verification
- [x] Payment webhooks not applicable (manual bank transfers)
- [x] Payment approval flow verified server-side
- [x] Log all payment events
- [x] Handle duplicate payment submissions (idempotency)

### API Response Trimming
- [x] Audit API responses for over-fetching
- [x] Remove sensitive fields from responses (password hashes, internal IDs)
- [x] Use field selection in queries (`.select('id, name')`)
- [x] Never expose Supabase service role key to client

### Security Headers
- [x] Add Content-Security-Policy header
- [x] Add X-Frame-Options: DENY
- [x] Add X-Content-Type-Options: nosniff
- [x] Add Referrer-Policy: strict-origin-when-cross-origin
- [x] Add Permissions-Policy header
- [x] Configure in `next.config.ts`

### HTTPS Enforcement
- [x] Configure HTTPS redirect in production (handled by hosting platform)
- [x] Set HSTS header (Strict-Transport-Security) in `next.config.ts`
- [x] Ensure secure cookies in production (`middleware.ts` + `session-management.ts` set `secure: true` in production)
- [x] Configure Supabase for HTTPS only (enforced by platform)

### CORS Restrictions
- [x] Audit Supabase CORS settings (`docs/SUPABASE_CORS.md`)
- [x] Restrict allowed origins to your domain (per-environment config)
- [x] Block wildcard CORS in production (documented, enforced via separate Supabase projects)
- [ ] Validate Origin header on API routes (Next.js + Supabase handle)

### Web Application Firewall (WAF)
- [x] Configure Cloudflare or similar WAF (`docs/CLOUDFLARE_WAF.md` with full ruleset)
- [x] Enable DDoS protection (Cloudflare managed, documented)
- [x] Set up bot filtering rules (Turnstile + Cloudflare Bot Fight Mode documented)
- [x] Configure rate limiting at CDN level (Cloudflare WAF rules documented)
- [x] Block known malicious IPs (custom WAF rules documented)

### Bot Protection
- [x] Add CAPTCHA on login/signup (Cloudflare Turnstile)
- [x] Implement server-side CAPTCHA verification (`lib/turnstile-server.ts`)
- [x] Client-side form validation prevents submission without CAPTCHA
- [x] Monitor for credential stuffing attacks (`lib/credential-stuffing-monitor.ts` + indexes)

---

## Operations, Logging & Monitoring

### Dependency Scanning
- [ ] Enable Dependabot or similar tool
- [ ] Run `npm audit` regularly
- [ ] Set up automated PRs for security updates
- [ ] Subscribe to security advisories

### Audit Trails
- [x] Log all authentication events (login, logout, failed attempts)
- [x] Log all order status changes
- [x] Log admin actions with actor ID and timestamp
- [x] Log payment events
- [x] Make logs tamper-evident (append-only storage - service role only insert)
- [x] Include user_id, action, timestamp, IP address

### Error Tracking
- [x] Integrate Sentry (@sentry/nextjs)
- [x] Server-side error capture (instrumentation.ts)
- [x] Client-side error capture (instrumentation-client.ts)
- [x] Error boundary component (sentry-error-boundary.tsx)
- [x] Sanitize errors before logging (no secrets, no auth headers)

### Monitoring & Alerts
- [x] Health check endpoint (`/api/health`)
- [x] Metrics endpoint (`/api/metrics`) for Prometheus
- [x] Middleware metrics (`/api/metrics/middleware`)
- [x] Configure alerts for high error rates (Sentry + `docs/ALERTING_LOGGING.md` runbooks)
- [x] Monitor for suspicious activity patterns (audit logs + credential-stuffing monitor)
- [ ] Set up log aggregation (external)
- [ ] Create dashboard for key metrics (external)

### Availability & Disaster Recovery
- [ ] Document backup strategy for Supabase
- [ ] Test backup restoration process
- [ ] Implement Blue/Green or canary deployments
- [ ] Create runbooks for incident response
- [ ] Define RTO (Recovery Time Objective)
- [ ] Define RPO (Recovery Point Objective)

---

## Compliance & Policies

### Privacy Policy
- [x] Privacy Policy page exists at `/privacy`
- [ ] Review and update content for accuracy
- [ ] Include data collection details
- [ ] Include PII handling procedures
- [ ] Include cookie usage disclosure
- [ ] Include third-party data sharing (if any)

### Terms & Conditions
- [x] Terms page exists at `/terms`
- [ ] Review and update content for accuracy
- [ ] Include user responsibilities
- [ ] Include payment terms
- [ ] Include termination clauses
- [ ] Include liability limitations

### PII Handling & Data Retention
- [ ] Document PII fields collected
- [ ] Define data retention periods
- [ ] Implement automated data deletion for old records
- [ ] Create user data export functionality
- [ ] Create user data deletion functionality (GDPR/CCPA)
- [ ] Document deletion verification process

### robots.txt
- [x] Create `public/robots.txt`
- [x] Block sensitive paths (admin, dashboard, auth)
- [x] Allow public content indexing
- [x] Block AI crawlers (GPTBot, Claude, etc.)
- [x] Configure crawler behavior

---

## Implementation Priority

### Critical (Do First) - ✅ COMPLETED
1. ✅ Enable RLS on all Supabase tables
2. ✅ Add rate limiting to auth endpoints
3. ✅ Implement security headers
4. ✅ Verify payment webhook signatures
5. ✅ Add CAPTCHA/bot protection

### High Priority - ✅ COMPLETED
1. ✅ Add password strength validation
2. ✅ Check for leaked passwords (HaveIBeenPwned integration)
3. ✅ Implement input validation library (Zod)
4. ✅ Add audit logging
5. ✅ Set up error tracking (Sentry)

### Medium Priority
1. Implement 2FA enrollment UI + login challenge
2. Add file upload virus scanning
3. Set up monitoring and alerts
4. Document disaster recovery
5. Review legal pages

### Ongoing
1. Dependency scanning
2. Log review
3. Security audit schedule
4. Penetration testing
5. Staff security training
