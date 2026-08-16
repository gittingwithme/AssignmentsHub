# Environment Variable Strategy

## Overview

This project uses **separate secrets per environment** (development, staging, production). This is a security best practice that limits blast radius if one environment is compromised.

## Files

| File | Purpose | Committed? |
|------|---------|------------|
| `.env.example` | Template with placeholders | ✅ Yes |
| `.env.development` | Local dev defaults (no real secrets) | ✅ Yes |
| `.env.staging` | Staging template (no real secrets) | ✅ Yes |
| `.env.production` | Production template (no real secrets) | ✅ Yes |
| `.env.local` | Your local overrides | ❌ No (gitignored) |
| Vercel/Cloudflare Env Vars | Actual secrets per environment | ❌ No |

## Required Separate Resources Per Environment

### 1. Supabase Projects
- **Dev**: `your-dev-project.supabase.co` — local development, can be shared
- **Staging**: `your-staging-project.supabase.co` — CI/CD, testing
- **Prod**: `your-prod-project.supabase.co` — production data, backups, PITR

Each project has its own:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only!)

### 2. Cloudflare Turnstile Sites
Create separate Turnstile "sites" per environment:
- Dev: `localhost`, `127.0.0.1`
- Staging: `staging.your-domain.com`
- Prod: `your-domain.com`

Each has its own:
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (client-safe)
- `TURNSTILE_SECRET_KEY` (server-only!)

### 3. Resend Email Domains
- Dev: `dev.your-domain.com` or sandbox
- Staging: `staging.your-domain.com`
- Prod: `your-domain.com`

Each has its own:
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

### 4. Notification Emails
Use separate email aliases per environment so you can filter:
- Dev: `dev-admin@your-domain.com`
- Staging: `staging-admin@your-domain.com`
- Prod: `admin@your-domain.com`

## Deployment

### Vercel (Frontend)
1. Go to Project Settings → Environment Variables
2. Add variables for **Production**, **Preview** (staging), and **Development**
3. Use the values from your actual Supabase/Turnstile/Resend projects

### Supabase (Backend)
Each Supabase project is independent. Run migrations against each:
```bash
# Development
supabase db push --project-ref <dev-project-ref>

# Staging
supabase db push --project-ref <staging-project-ref>

# Production (requires approval)
supabase db push --project-ref <prod-project-ref>
```

## Local Development

```bash
# 1. Copy example
cp .env.example .env.local

# 2. Fill in your DEV project credentials
# 3. Run dev server
npm run dev
```

## Security Checklist

- [ ] No real secrets in any committed `.env*` file
- [ ] Each environment uses separate Supabase project
- [ ] Each environment uses separate Turnstile site
- [ ] Each environment uses separate Resend domain
- [ ] Service role keys ONLY in server-side environment variables
- [ ] `NEXT_PUBLIC_*` variables are truly safe to expose to client
- [ ] `.gitignore` blocks `.env.local`, `.env.production`, `.env.staging`
- [ ] CI/CD injects secrets at deploy time (not build time)