import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/ui/shared/dashboard-shell'
import DashboardSidebar, { superSidebarItems } from '@/components/ui/shared/dashboard-sidebar'
import ActionForm from '@/components/ui/shared/action-form'
import Reveal from '@/components/ui/shared/reveal'
import {
  updatePlanPrice,
  updatePayoutSettings,
} from '@/app/super-actions'
import { setOrderPrice } from '@/app/payment-actions'
import MaintenanceToggle from '@/components/super/maintenance-toggle'
import UserPermissionsSearch from '@/components/super/user-permissions-search'

export default async function SuperDashboardPage({ searchParams }: { searchParams: { tab?: string, page?: string } }) {
  const params = await searchParams
  const currentTab = params.tab || 'overview'
  const currentPage = Math.max(1, parseInt(params.page || '1', 10))
  const pageSize = 15
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'super_admin') {
    redirect('/dashboard')
  }

  // Only fetch paginated orders if we're on the plans tab
  const paginatedOrdersReq = currentTab === 'plans' 
    ? supabase.from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((currentPage - 1) * pageSize, currentPage * pageSize - 1)
    : supabase.from('orders').select('*').limit(0) // dummy

  // Payment logs: only approved payments are logged (paid_at set on approval)
  const paymentLogsReq = currentTab === 'payments'
    ? supabase
        .from('payment_approvals')
        .select('id, paid_at, approved_at, invoice_id, payment_reference', { count: 'exact' })
        .not('paid_at', 'is', null)
        .order('paid_at', { ascending: false })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1)
    : supabase.from('payment_approvals').select('id, paid_at, approved_at, invoice_id, payment_reference').limit(0) // dummy

  const [
    { data: allPlans },
    { data: payoutSettings },
    { data: platformSettings },
    { count: pendingApprovalsCount },
    { data: paginatedOrdersData },
    { count: allOrdersCount },
    { data: paymentLogsData, count: paymentLogsCount },
    { count: collectedCount },
    { data: paidInvoiceRows },
    { data: allInvoices },
    { data: allOrders },
    { data: usersWithEmail }
  ] = await Promise.all([
    supabase.from('pricing_plans').select('*').order('price', { ascending: true }),
    supabase
      .from('payout_settings')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('platform_settings')
      .select('*')
      .eq('id', 'global')
      .maybeSingle(),
    supabase
      .from('payment_approvals')
      .select('id', { count: 'exact', head: true })
      .is('approved_at', null)
      .is('rejected_at', null),
    paginatedOrdersReq,
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    paymentLogsReq,
    supabase
      .from('payment_approvals')
      .select('id', { count: 'exact', head: true })
      .not('paid_at', 'is', null),
    supabase.from('payment_approvals').select('invoice_id').not('paid_at', 'is', null),
    supabase.from('invoices').select('id, order_id, user_id, amount_cents, invoice_kind, reference_code, subscription_id'),
    supabase.from('orders').select('id, title, user_id'),
    supabase.from('users').select('id, email'),
  ])

  const pendingApprovals = pendingApprovalsCount || 0
  const notifications = [
    ...(pendingApprovals > 0
      ? [{
          id: 'approvals',
          title: `${pendingApprovals} payment${pendingApprovals === 1 ? '' : 's'} awaiting approval`,
          description: 'Review in the admin workspace',
          href: '/admin-dashboard?tab=approvals',
          tone: 'warning' as const,
        }]
      : []),
    ...(platformSettings?.maintenance_enabled
      ? [{
          id: 'maintenance',
          title: 'Maintenance mode is active',
          description: 'Customers and admins are being redirected',
          href: '/super-dashboard?tab=maintenance',
          tone: 'info' as const,
        }]
      : []),
  ]

  const displayOrders = currentTab === 'plans' ? (paginatedOrdersData ?? []) : []
  const totalOrders = allOrdersCount || 0
  const paymentsTotal = paymentLogsCount || 0
  const totalPages = Math.ceil(totalOrders / pageSize)

  // ── Payment log derivation ────────────────────────────────────────────────
  const invoiceById = new Map((allInvoices ?? []).map((inv) => [inv.id, inv]))
  const orderById = new Map((allOrders ?? []).map((order) => [order.id, order]))
  const emailById = new Map((usersWithEmail ?? []).map((u) => [u.id, u.email]))

  const paymentLogs = (paymentLogsData ?? []).map((log) => {
    const invoice = log.invoice_id ? invoiceById.get(log.invoice_id) : null
    const order = invoice?.order_id ? orderById.get(invoice.order_id) : null
    const amountCents = invoice?.amount_cents ?? null
    const reference = invoice?.reference_code || log.payment_reference || ''
    const kind = invoice?.invoice_kind || 'one_time'
    const itemLabel = order?.title || (invoice?.invoice_kind === 'subscription' ? 'Subscription payment' : 'One-time payment')
    const email = invoice?.user_id ? emailById.get(invoice.user_id) : undefined
    return {
      id: log.id,
      paidAt: log.paid_at || log.approved_at || '',
      amountCents,
      reference,
      kind,
      itemLabel,
      email,
    }
  })

  const paymentsTotalPages = Math.max(1, Math.ceil(paymentsTotal / pageSize))
  // Sum the amounts of every paid invoice (invoices are loaded in full already)
  const paidInvoiceIdSet = new Set((paidInvoiceRows ?? []).map((row) => row.invoice_id))
  const totalCollectedCents = (allInvoices ?? [])
    .filter((inv) => paidInvoiceIdSet.has(inv.id) && typeof inv.amount_cents === 'number')
    .reduce((sum, inv) => sum + (inv.amount_cents as number), 0)

  return (
    <DashboardShell
      workspaceLabel="Super Admin"
      activeItem={currentTab === 'payments' ? 'Payment Logs' : currentTab === 'permissions' ? 'Permissions' : currentTab === 'maintenance' ? 'Maintenance' : currentTab === 'payout' ? 'Payout Settings' : currentTab === 'pricing' ? 'Pricing' : currentTab === 'plans' ? 'Plan Settings' : 'Overview'}
      roleLabel="Super Admin"
      notifications={notifications}
      currentUserId={user.id}
      role="super_admin"
      orderContext={Object.fromEntries((allOrders ?? []).map((o) => [o.id, o.title]))}
      header={
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Super Admin</p>
            <h1 className="mt-1.5 text-[26px] font-semibold leading-8 tracking-[-0.022em]" style={{ color: 'var(--ink)' }}>
              Master control center
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-5" style={{ color: 'var(--ink-muted)' }}>
              Manage permissions, plans, payout settings, and platform-level controls.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <form action="/auth/signout" method="post">
              <button type="submit" className="mp-btn mp-btn-secondary mp-btn-md">Log out</button>
            </form>
          </div>
        </div>
      }
      sidebar={
        <DashboardSidebar
          title="AssignmentsHub"
          subtitle="Super Admin"
          roleLabel="Super Admin"
          items={superSidebarItems}
        />
      }
    >
      <div className="space-y-4">
        {/* ── Overview ── */}
        {currentTab === 'overview' && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="mp-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--ink-muted)]">Total Collected</p>
                <h3 className="tnum text-2xl font-bold text-[var(--ink)] mt-2">€{(totalCollectedCents / 100).toFixed(2)}</h3>
              </div>
              <Link href="/super-dashboard?tab=payments" className="text-sm text-[var(--brand-500)] hover:underline mt-4">View payment logs &rarr;</Link>
            </div>
            <div className="mp-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--ink-muted)]">Payments Approved</p>
                <h3 className="tnum text-2xl font-bold text-[var(--ink)] mt-2">{collectedCount || 0}</h3>
              </div>
              <Link href="/super-dashboard?tab=payments" className="text-sm text-[var(--brand-500)] hover:underline mt-4">View payment logs &rarr;</Link>
            </div>
            <div className="mp-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--ink-muted)]">Total Orders</p>
                <h3 className="tnum text-2xl font-bold text-[var(--ink)] mt-2">{totalOrders}</h3>
              </div>
              <Link href="/super-dashboard?tab=plans" className="text-sm text-[var(--brand-500)] hover:underline mt-4">View order quotes &rarr;</Link>
            </div>
            <div className="mp-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--ink-muted)]">Pricing Tiers</p>
                <h3 className="tnum text-2xl font-bold text-[var(--ink)] mt-2">{allPlans?.length || 0}</h3>
              </div>
              <Link href="/super-dashboard?tab=pricing" className="text-sm text-[var(--brand-500)] hover:underline mt-4">Edit pricing &rarr;</Link>
            </div>
          </div>
        )}

        {/* ── Payment Logs ── */}
        {currentTab === 'payments' && (
        <div className="grid gap-4 xl:grid-cols-1">
          <section id="payments" className="mp-card">
            <header className="mp-card-header">
              <div>
                <h2 className="mp-card-title">Payment logs</h2>
                <p className="mp-card-description">Every approved payment that has landed in the account — logged automatically when approved.</p>
              </div>
              <span className="mp-badge">{paymentsTotal} recorded</span>
            </header>

            {paymentLogs.length > 0 ? (
              <div className="w-full overflow-x-auto">
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                      <th className="mp-th">Amount</th>
                      <th className="mp-th">Customer</th>
                      <th className="mp-th hidden md:table-cell">Reference</th>
                      <th className="mp-th hidden lg:table-cell">Type</th>
                      <th className="mp-th">For</th>
                      <th className="mp-th">Paid at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentLogs.map((log) => (
                      <tr key={log.id} className="mp-tr">
                        <td className="mp-td tnum font-semibold" style={{ color: 'var(--ink)' }}>
                          {typeof log.amountCents === 'number' ? `€${(log.amountCents / 100).toFixed(2)}` : '—'}
                        </td>
                        <td className="mp-td">
                          <span className="block font-medium" style={{ color: 'var(--ink)' }}>{log.email || 'Unknown'}</span>
                          <span className="block font-mono text-[11px]" style={{ color: 'var(--ink-faint)' }}>{log.id.slice(0, 8)}</span>
                        </td>
                        <td className="mp-td hidden font-mono text-[12px] md:table-cell" style={{ color: 'var(--ink-muted)' }}>{log.reference || '—'}</td>
                        <td className="mp-td hidden lg:table-cell">
                          <span className="mp-badge capitalize">{log.kind.replaceAll('_', ' ')}</span>
                        </td>
                        <td className="mp-td max-w-[220px] truncate" style={{ color: 'var(--ink-muted)' }}>{log.itemLabel}</td>
                        <td className="mp-td whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>
                          {log.paidAt
                            ? new Date(log.paidAt).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No approved payments yet. Payments appear here automatically once you approve them.</p>
              </div>
            )}

            {paymentsTotal > 0 && (
              <footer className="mp-card-footer flex flex-wrap items-center justify-between gap-3">
                {(() => {
                  const pageParams = (page: number) => `?tab=payments&page=${page}`
                  const start = (currentPage - 1) * pageSize + 1
                  const end = Math.min(currentPage * pageSize, paymentsTotal)
                  const first = Math.max(1, currentPage - 2)
                  const last = Math.min(paymentsTotalPages, first + 4)
                  const pages: number[] = []
                  for (let p = first; p <= last; p++) pages.push(p)
                  return (
                    <>
                      <p className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>Showing {start}–{end} of {paymentsTotal}</p>
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/super-dashboard${pageParams(Math.max(1, currentPage - 1))}`}
                          aria-label="Previous page"
                          className={`mp-btn mp-btn-ghost mp-btn-sm ${currentPage <= 1 ? 'pointer-events-none opacity-40' : ''}`}
                        >
                          <ChevronLeft size={14} aria-hidden />
                        </Link>
                        {pages.map((p) => (
                          <Link
                            key={p}
                            href={`/super-dashboard${pageParams(p)}`}
                            aria-current={p === currentPage ? 'page' : undefined}
                            className={`mp-btn mp-btn-sm ${p === currentPage ? 'mp-btn-primary' : 'mp-btn-ghost'}`}
                          >
                            {p}
                          </Link>
                        ))}
                        <Link
                          href={`/super-dashboard${pageParams(Math.min(paymentsTotalPages, currentPage + 1))}`}
                          aria-label="Next page"
                          className={`mp-btn mp-btn-ghost mp-btn-sm ${currentPage >= paymentsTotalPages ? 'pointer-events-none opacity-40' : ''}`}
                        >
                          <ChevronRight size={14} aria-hidden />
                        </Link>
                      </div>
                    </>
                  )
                })()}
              </footer>
            )}
          </section>
        </div>
        )}

        {/* ── Maintenance Mode ── */}
        {currentTab === 'maintenance' && (
        <Reveal id="maintenance" className="">
          <MaintenanceToggle
            currentEnabled={!!platformSettings?.maintenance_enabled}
            currentTitle={platformSettings?.maintenance_title || 'Under Maintenance'}
            currentDescription={
              platformSettings?.maintenance_description ||
              'AssignmentsHub is temporarily unavailable while we perform upgrades. Please check back soon.'
            }
          />
        </Reveal>
        )}

        {/* ── Permissions ── */}
        {currentTab === 'permissions' && (
        <div className="grid gap-4 xl:grid-cols-1">
          <section id="permissions" className="mp-card relative z-50" style={{ overflow: 'visible' }}>
            <header className="mp-card-header">
              <div>
                <h2 className="mp-card-title">User permissions</h2>
                <p className="mp-card-description">Search users, then assign their platform role.</p>
              </div>
            </header>
            <div className="mp-card-content relative z-50">
              <UserPermissionsSearch currentUserId={user.id} />
            </div>
          </section>
        </div>
        )}

        {/* ── Payout Settings ── */}
        {currentTab === 'payout' && (
        <div className="grid gap-4 xl:grid-cols-1">
          <section id="payout" className="mp-card">
            <header className="mp-card-header">
              <div>
                <h2 className="mp-card-title">Founder bank settings</h2>
                <p className="mp-card-description">These details are shown to customers during invoice payment flow.</p>
              </div>
            </header>
            <div className="mp-card-content">
              <ActionForm action={updatePayoutSettings} successTitle="Payout settings saved" className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: 'var(--ink-muted)' }}>Account Holder Name</label>
                  <input name="account_holder_name" defaultValue={payoutSettings?.account_holder_name || ''} required className="mp-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: 'var(--ink-muted)' }}>IBAN</label>
                  <input name="iban" defaultValue={payoutSettings?.iban || ''} required className="mp-input font-mono tracking-[0.04em]" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium" style={{ color: 'var(--ink-muted)' }}>BIC / SWIFT</label>
                    <input name="bic_swift" defaultValue={payoutSettings?.bic_swift || ''} className="mp-input font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium" style={{ color: 'var(--ink-muted)' }}>Bank Name</label>
                    <input name="bank_name" defaultValue={payoutSettings?.bank_name || ''} required className="mp-input" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: 'var(--ink-muted)' }}>Payment Reference Instructions</label>
                  <textarea name="payment_reference_instructions" defaultValue={payoutSettings?.payment_reference_instructions || ''} rows={3} className="mp-textarea" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: 'var(--ink-muted)' }}>Billing Support Note</label>
                  <textarea name="billing_support_note" defaultValue={payoutSettings?.billing_support_note || ''} rows={3} className="mp-textarea" />
                </div>
                <button type="submit" className="mp-btn mp-btn-primary mp-btn-md w-full">Save payout settings</button>
              </ActionForm>
            </div>
          </section>
        </div>
        )}

        {/* ── Pricing Tiers ── */}
        {currentTab === 'pricing' && (
        <div className="grid gap-4 xl:grid-cols-1">
          <section id="pricing" className="mp-card">
            <header className="mp-card-header">
              <div>
                <h2 className="mp-card-title">One-time pricing tiers</h2>
                <p className="mp-card-description">Adjust one-time automatic pricing defaults.</p>
              </div>
            </header>
            <div className="divide-hairline">
              {(allPlans ?? []).map((plan) => (
                <ActionForm key={plan.id} action={updatePlanPrice} successTitle="Plan price updated" className="mp-row flex-wrap">
                  <input type="hidden" name="plan_id" value={plan.id} />
                  <div className="min-w-[140px] flex-1">
                    <p className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{plan.name}</p>
                    <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                      {plan.plan_type} {plan.max_images ? `• up to ${plan.max_images} images` : '• custom tier'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <input type="number" step="0.01" min="0" name="price" defaultValue={plan.price} className="mp-input h-8 w-28 text-[13px]" />
                    <button type="submit" className="mp-btn mp-btn-secondary mp-btn-sm">Update</button>
                  </div>
                </ActionForm>
              ))}
            </div>
          </section>
        </div>
        )}

        {/* ── Plan Settings (Manual Quotes) ── */}
        {currentTab === 'plans' && (
        <div className="grid gap-4 xl:grid-cols-1">
          <section id="quotes" className="mp-card">
            <header className="mp-card-header">
              <div>
                <h2 className="mp-card-title">Manual quotes for orders</h2>
                <p className="mp-card-description">Set or override one-time order pricing where automation is not enough.</p>
              </div>
            </header>
            <div className="divide-hairline">
              {displayOrders.map((order) => (
                <ActionForm key={order.id} action={setOrderPrice} successTitle="Quote set" className="mp-row flex-wrap">
                  <input type="hidden" name="order_id" value={order.id} />
                  <div className="min-w-[140px] flex-1">
                    <p className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{order.title}</p>
                    <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-faint)' }}>{order.course_subject}</p>
                  </div>
                  <div className="flex gap-2">
                    <input type="number" name="price" min="1" step="0.01" placeholder="EUR" className="mp-input h-8 w-28 text-[13px]" />
                    <button type="submit" className="mp-btn mp-btn-primary mp-btn-sm">Set</button>
                  </div>
                </ActionForm>
              ))}
            </div>
            {totalOrders > 0 && (
            <footer className="mp-card-footer flex flex-wrap items-center justify-between gap-3">
              {(() => {
                const pageParams = (page: number) => `?tab=plans&page=${page}`
                const start = (currentPage - 1) * pageSize + 1
                const end = Math.min(currentPage * pageSize, totalOrders)
                const first = Math.max(1, currentPage - 2)
                const last = Math.min(totalPages, first + 4)
                const pages: number[] = []
                for (let p = first; p <= last; p++) pages.push(p)
                return (
                  <>
                    <p className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>Showing {start}–{end} of {totalOrders}</p>
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/super-dashboard${pageParams(Math.max(1, currentPage - 1))}`}
                        aria-label="Previous page"
                        className={`mp-btn mp-btn-ghost mp-btn-sm ${currentPage <= 1 ? 'pointer-events-none opacity-40' : ''}`}
                      >
                        <ChevronLeft size={14} aria-hidden />
                      </Link>
                      {pages.map((p) => (
                        <Link
                          key={p}
                          href={`/super-dashboard${pageParams(p)}`}
                          aria-current={p === currentPage ? 'page' : undefined}
                          className={`mp-btn mp-btn-sm ${p === currentPage ? 'mp-btn-primary' : 'mp-btn-ghost'}`}
                        >
                          {p}
                        </Link>
                      ))}
                      <Link
                        href={`/super-dashboard${pageParams(Math.min(totalPages, currentPage + 1))}`}
                        aria-label="Next page"
                        className={`mp-btn mp-btn-ghost mp-btn-sm ${currentPage >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
                      >
                        <ChevronRight size={14} aria-hidden />
                      </Link>
                    </div>
                  </>
                )
              })()}
            </footer>
            )}
          </section>
        </div>
        )}
      </div>
    </DashboardShell>
  )
}