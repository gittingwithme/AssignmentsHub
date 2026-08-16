import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/ui/shared/dashboard-shell'
import DashboardSidebar, {
  customerSidebarItems,
} from '@/components/ui/shared/dashboard-sidebar'
import ActionForm from '@/components/ui/shared/action-form'
import Reveal from '@/components/ui/shared/reveal'
import {
  requestSubscriptionPlan,
  submitSubscriptionPayment,
} from '@/app/subscription-actions'

function formatMoney(cents?: number | null) {
  if (typeof cents !== 'number') return '—'
  return `€${(cents / 100).toFixed(2)}`
}

function prettifyLabel(value: string | null | undefined) {
  if (!value) return 'N/A'
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function SubscriptionPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [
    { data: plans },
    { data: subscriptions },
    { data: invoices },
    { data: payoutSettings },
    { data: recentUploadLogs },
  ] = await Promise.all([
    supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .in('interval', ['weekly', 'monthly'])
      .order('display_order', { ascending: true }),
    supabase
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .eq('invoice_kind', 'subscription')
      .order('created_at', { ascending: false }),
    supabase
      .from('payout_settings')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('upload_usage_logs')
      .select('*')
      .eq('user_id', user.id)
      // eslint-disable-next-line react-hooks/purity
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])

  const activeSubscription =
    (subscriptions ?? []).find((sub) => sub.status === 'active') ||
    (subscriptions ?? []).find((sub) => ['pending_approval', 'awaiting_payment'].includes(sub.status)) ||
    null

  const pendingInvoices = (invoices ?? []).filter((invoice) =>
    ['invoice_created', 'pending_approval', 'rejected'].includes(invoice.status)
  )

  const uploadsInLast24h = recentUploadLogs?.length ?? 0
  const uploadsRemaining =
    activeSubscription?.plans?.rolling_24h_upload_limit != null
      ? Math.max(activeSubscription.plans.rolling_24h_upload_limit - uploadsInLast24h, 0)
      : null

  return (
    <DashboardShell
      header={
        <Reveal className="glass-panel flex flex-col gap-3 rounded-[30px] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <p className="eyebrow">Subscription</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Manage your plan
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Weekly and monthly plans are the recommended path for smoother ongoing support.
            </p>
          </div>
          <Link href="/dashboard" className="premium-button">
            Back to dashboard
          </Link>
        </Reveal>
      }
      sidebar={
        <DashboardSidebar
          title="AssignmentsHub"
          subtitle="Customer Dashboard"
          roleLabel="Customer"
          items={customerSidebarItems}
        />
      }
    >
      <div className="space-y-6">
        <Reveal className="premium-card p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">Current subscription status</h2>

          {activeSubscription ? (
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <div className="surface-dark p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Plan</p>
                <p className="mt-2 text-sm text-white">{activeSubscription.plans?.name || 'Plan'}</p>
              </div>
              <div className="surface-white p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Status</p>
                <p className="mt-2 text-sm text-white">{prettifyLabel(activeSubscription.status)}</p>
              </div>
              <div className="surface-blue p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Credits left</p>
                <p className="mt-2 text-sm text-white">{activeSubscription.remaining_credits ?? 0}</p>
              </div>
              <div className="surface-dark p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Uploads / 24h</p>
                <p className="mt-2 text-sm text-white">{uploadsRemaining ?? 'N/A'}</p>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-400">
              You do not have an active or pending subscription yet. Choose a plan below to get started.
            </div>
          )}
        </Reveal>

        <Reveal delay={0.05} className="premium-card p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">Available plans</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {(plans ?? []).map((plan, index) => {
              const tone = index % 3 === 0 ? 'surface-dark' : index % 3 === 1 ? 'surface-white' : 'surface-blue'

              return (
                <div
                  key={plan.id}
                  className={`${tone} p-5 ${plan.is_recommended ? 'ring-1 ring-white/20' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-zinc-400">{plan.name}</p>
                      <h3 className="mt-3 text-3xl font-semibold text-white">
                        {formatMoney(plan.price_cents)}
                      </h3>
                    </div>
                    {plan.is_recommended ? <div className="status-chip">Recommended</div> : null}
                  </div>

                  <ul className="mt-5 space-y-2 text-sm leading-7 text-zinc-400">
                    <li>• Interval: {prettifyLabel(plan.interval)}</li>
                    <li>• Quota credits: {plan.quota_credits}</li>
                    <li>• Uploads / 24h: {plan.rolling_24h_upload_limit}</li>
                    <li>• Max active orders: {plan.max_active_orders}</li>
                    <li>• Revisions: {plan.revisions_allowed}</li>
                  </ul>

                  <ActionForm action={requestSubscriptionPlan} successTitle="Subscription requested" successDescription="We'll review your plan request shortly." className="mt-6">
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <button type="submit" className="premium-button-primary w-full">
                      Request this plan
                    </button>
                  </ActionForm>
                </div>
              )
            })}
          </div>
        </Reveal>

        <Reveal delay={0.08} className="premium-card p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">Pending subscription invoices</h2>

          {pendingInvoices.length > 0 ? (
            <div className="mt-5 space-y-4">
              {pendingInvoices.map((invoice) => (
                <div key={invoice.id} className="surface-dark p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        Invoice {invoice.reference_code || invoice.id}
                      </p>
                      <p className="mt-2 text-sm text-zinc-400">
                        Status: {prettifyLabel(invoice.status)}
                      </p>
                    </div>

                    <div className="surface-blue px-4 py-3 text-right">
                      <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Amount</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {formatMoney(invoice.amount_cents)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 surface-dark-soft p-4 text-sm text-zinc-300">
                    {payoutSettings ? (
                      <>
                        <p className="font-medium text-white">{payoutSettings.bank_name}</p>
                        <p>Account Holder: {payoutSettings.account_holder_name}</p>
                        <p>IBAN: {payoutSettings.iban}</p>
                        {payoutSettings.bic_swift ? <p>BIC/SWIFT: {payoutSettings.bic_swift}</p> : null}
                        {invoice.reference_code ? (
                          <p className="mt-2">
                            Reference: <span className="text-white">{invoice.reference_code}</span>
                          </p>
                        ) : null}
                        {payoutSettings.payment_reference_instructions ? (
                          <p className="mt-2 text-zinc-400">
                            {payoutSettings.payment_reference_instructions}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p>Bank transfer instructions will appear once admin configures payout settings.</p>
                    )}
                  </div>

                  <ActionForm action={submitSubscriptionPayment} successTitle="Payment submitted" successDescription="Admins have been notified for approval." className="mt-5 space-y-3">
                    <input type="hidden" name="invoice_id" value={invoice.id} />
                    <input
                      type="text"
                      name="payment_reference"
                      placeholder="Optional transfer reference"
                      className="premium-input"
                    />
                    <button type="submit" className="premium-button-primary w-full md:w-auto">
                      I have made the payment
                    </button>
                  </ActionForm>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-400">
              No pending subscription invoices at the moment.
            </div>
          )}
        </Reveal>
      </div>
    </DashboardShell>
  )
}
