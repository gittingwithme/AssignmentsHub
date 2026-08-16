# AssignmentsHub — Manual Setup Notes

## Supabase dashboard configuration

### 1. Run the platform settings migration

Execute `supabase/migrations/20260807_platform_settings.sql` in the Supabase SQL editor (or via CLI) before using maintenance mode.

### 2. Google OAuth (`Continue with Google`)

1. Supabase Dashboard → **Authentication** → **Providers** → enable **Google**
2. Create OAuth credentials in Google Cloud Console
3. Add authorized redirect URI:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Paste Google Client ID and Client Secret into Supabase
5. Supabase Dashboard → **Authentication** → **URL Configuration**
   - **Site URL**: your production URL (e.g. `https://yourdomain.com`)
   - **Redirect URLs**: include `https://yourdomain.com/auth/callback` and `http://localhost:3000/auth/callback`

Optional env var for local/dev:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 3. Email confirmation (email/password sign-up)

1. Supabase Dashboard → **Authentication** → **Providers** → **Email**
2. Enable **Confirm email**
3. Configure SMTP (recommended for production) or use Supabase default mail for testing
4. Ensure redirect URLs include `/auth/callback` (same as Google above)

Sign-up flow:
- User creates account → receives confirmation email → confirms → signs in
- If session is returned immediately (confirm email disabled in dev), user goes straight to dashboard

### 4. Environment variables (do not commit secrets)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Email (Resend)
RESEND_API_KEY=
RESEND_FROM_EMAIL=
PAYMENT_APPROVAL_EMAIL=
ADMIN_EMAIL=
SUPPORT_EMAIL=

# Optional
NEXT_PUBLIC_SITE_URL=
```

Configure public contact/support emails in `lib/site-config.ts`.

### 5. Founder payout / bank details

Super admin sets these in **Super Dashboard → Founder bank settings**.

### 6. Storage RLS + realtime messaging migration (REQUIRED)

Run **`backend/supabase/migrations/20260810_storage_rls_realtime.sql`** in the
Supabase SQL editor **exactly once**. It does four things:

1. Makes the `assignments` storage bucket **private** (creates it if missing).
2. Restricts storage objects: customers can only read/upload under their own
   `orders/{user_id}/...` path; admin/super_admin can manage everything in the bucket.
3. Enables **RLS on `messages`**: order participants + staff can read/send/mark-read,
   everyone else is locked out.
4. Adds `messages` to the `supabase_realtime` publication so the order chat
   receives live INSERT events (the `OrderThread` component already subscribes).

Steps:
1. Supabase Dashboard → your project → **SQL Editor** → **New query**.
2. Paste the entire contents of the migration file.
3. Click **Run** (make sure the query has no errors — it is idempotent, so
   re-running is safe).

### 7. Core-table RLS lockdown (REQUIRED)

Run **`backend/supabase/migrations/20260811_core_rls.sql`** in the SQL editor
after the migration above. It enables RLS on every core table (`users`,
`orders`, `invoices`, `payment_approvals`, `order_files`, `subscriptions`,
`upload_usage_logs`, `plans`, `pricing_plans`, `payout_settings`, plus
service-role-only locks on `anti_abuse_signals` / `trial_attempts`) and adds
owner + staff policies so customers can only touch their own rows.

### 8. Payment logs (REQUIRED for super-admin money tracking)

Run **`backend/supabase/migrations/20260811_payment_logs.sql`** in the SQL
editor after the core RLS migration. It adds `payment_approvals.paid_at`
(set automatically whenever a payment is approved) and backfills already-
approved payments so existing history appears in the super admin's Payment
Logs tab and Total Collected overview card.

### 9. Realtime payment notifications (REQUIRED for the live bell)

Run **`backend/supabase/migrations/20260811_realtime_payment_approvals.sql`**
in the SQL editor after the payment-logs migration. It publishes
`payment_approvals` to `supabase_realtime` so the notification bell can react
live to payments being submitted (admin sees "awaiting review") and approved/
rejected (customer sees the outcome). Chat-message notifications need
`messages` published, which 20260810_storage_rls_realtime.sql already did.

### 10. Message replies (REQUIRED for swipe-to-reply quoting)

Run **`backend/supabase/migrations/20260811_message_replies.sql`** in the SQL
editor after the realtime payment migration. It adds `messages.reply_to` so
replies show the quoted original message in the chat.

Order matters: run 20260810_storage_rls_realtime.sql first, then
20260810_customer_email.sql, then 20260811_core_rls.sql, then
20260811_payment_logs.sql, then 20260811_realtime_payment_approvals.sql,
then 20260811_message_replies.sql.

After running, verify from the repo root:

```bash
cd frontend && node scripts/verify-supabase.mjs
```

The script is read-only and reports: bucket visibility, whether `messages` is
still anon-readable (should be denied once RLS is on), and the realtime channel
status. It never prints secrets.

> ⚠️ **Known gap:** `SUPABASE_SERVICE_ROLE_KEY` in `frontend/.env.local` is still
> a placeholder (`your_supabase_service_role_key...`). Replace it with the real
> key from Supabase Dashboard → **Project Settings → API** → `service_role`
> secret. Until then, service-role flows (free-trial anti-abuse logging) will
> fail, and the bucket check in the verify script uses the anon key instead.

---

## Maintenance mode

Super admin → **Super Dashboard → Maintenance mode**

- Toggle on/off
- Edit title and description
- Customers and admins are redirected to `/maintenance`
- Super admin retains full access

---

## Free trial

Backend trial schema/logic remains in place but is **hidden from UI**. Do not re-expose without product review.
