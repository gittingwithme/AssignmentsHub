import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/ui/shared/dashboard-shell'
import DashboardSidebar, { adminSidebarItems } from '@/components/ui/shared/dashboard-sidebar'
import ActionForm from '@/components/ui/shared/action-form'
import { updateOrderStatus } from '@/app/admin-actions'
import { confirmPayment, rejectPayment, setOrderPrice } from '@/app/payment-actions'
import {
  approveSubscriptionPayment,
  rejectSubscriptionPayment,
} from '@/app/subscription-actions'

function formatMoney(
  order: Partial<{ quote_amount_cents: number | null; price: number | string | null }> | null,
  invoice?: Partial<{ amount_cents: number | null }> | null
) {
  if (typeof order?.quote_amount_cents === 'number') return `€${(order.quote_amount_cents / 100).toFixed(2)}`
  if (typeof invoice?.amount_cents === 'number') return `€${(invoice.amount_cents / 100).toFixed(2)}`
  if (typeof order?.price === 'number') return `€${order.price.toFixed(2)}`
  if (typeof order?.price === 'string') {
    const parsed = Number(order.price)
    if (!Number.isNaN(parsed)) return `€${parsed.toFixed(2)}`
  }
  return null
}

const REQUEST_STATUS_OPTIONS = [
  { value: 'review_pending', label: 'Review Pending' },
  { value: 'awaiting_payment', label: 'Awaiting Payment' },
  { value: 'payment_submitted', label: 'Payment Submitted' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'revision_requested', label: 'Revision Requested' },
  { value: 'locked', label: 'Locked' },
]

export default async function AdminDashboardPage({ searchParams }: { searchParams: { tab?: string, page?: string, status?: string, q?: string } }) {
  const params = await searchParams
  const currentTab = params.tab || 'overview'
  const currentPage = Math.max(1, parseInt(params.page || '1', 10))
  const statusFilter = params.status || ''
  const searchQuery = params.q?.trim() || ''
  // Commas would break PostgREST's or() condition syntax — treat them as spaces.
  const searchPattern = searchQuery.replace(/,/g, ' ')
  const pageSize = 15
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role || 'customer'
  if (!['admin', 'super_admin'].includes(role)) {
    redirect('/dashboard')
  }

  // Only fetch paginated orders if we're on the requests tab (filters compose with pagination)
  const paginatedOrdersReq = currentTab === 'requests'
    ? (() => {
        let query = supabase.from('orders').select('*', { count: 'exact' })
        if (statusFilter) query = query.eq('status_key', statusFilter)
        if (searchPattern) query = query.or(`title.ilike.%${searchPattern}%,description.ilike.%${searchPattern}%,course_subject.ilike.%${searchPattern}%`)
        return query.order('created_at', { ascending: false }).range((currentPage - 1) * pageSize, currentPage * pageSize - 1)
      })()
    : supabase.from('orders').select('*').limit(0) // dummy

  // Overview stat counts (real numbers on the dashboard cards)
  const overviewCountsReq = Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status_key', 'completed'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status_key', 'in_progress'),
  ])

  const [
    { data: orders },
    { data: invoices },
    { data: approvals },
    { data: orderFiles },
    { data: subscriptions },
    { data: plans },
    { data: paginatedOrdersData, count: totalOrdersCount },
    [{ count: overviewTotalOrders }, { count: overviewCompleted }, { count: overviewInProgress }]
  ] = await Promise.all([
    // For overview and approvals, we fetch specific items (or limit to recent)
    supabase.from('orders').select('*').in('payment_status', ['payment_submitted', 'pending_approval', 'verification_pending']),
    supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('payment_approvals').select('*').order('submitted_at', { ascending: false }).limit(200),
    supabase.from('order_files').select('order_id, file_category').order('created_at', { ascending: false }).limit(500),
    supabase.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('plans').select('*'),
    paginatedOrdersReq,
    overviewCountsReq,
  ])

  const allOrders = orders ?? []
  const allInvoices = invoices ?? []
  const allApprovals = approvals ?? []
  const allFiles = orderFiles ?? []
  const allSubscriptions = subscriptions ?? []
  const allPlans = plans ?? []

  const planById = new Map(allPlans.map((plan) => [plan.id, plan]))
  const invoiceByOrderId = new Map(
    allInvoices.filter((inv) => inv.order_id).map((inv) => [inv.order_id, inv])
  )
  const approvalByInvoiceId = new Map(
    allApprovals.filter((a) => a.invoice_id).map((a) => [a.invoice_id, a])
  )

  const fileCountByOrderId = allFiles.reduce<Record<string, number>>((acc, file) => {
    acc[file.order_id] = (acc[file.order_id] || 0) + 1
    return acc
  }, {})

  const orderApprovalQueue = allOrders // which is now just the pending orders
  const displayOrders = currentTab === 'requests' ? (paginatedOrdersData ?? []) : []
  const totalPages = Math.ceil((totalOrdersCount || 0) / pageSize)

  const subscriptionApprovalQueue = allInvoices
    .filter((invoice) => invoice.invoice_kind === 'subscription' && invoice.status === 'pending_approval')
    .map((invoice) => {
      const subscription = allSubscriptions.find((sub) => sub.id === invoice.subscription_id)
      const plan = subscription ? planById.get(subscription.plan_id) : null
      const approval = approvalByInvoiceId.get(invoice.id)
      return { invoice, subscription, plan, approval }
    })

  const notifications = [
    ...(orderApprovalQueue.length > 0
      ? [{
          id: 'order-approvals',
          title: `${orderApprovalQueue.length} payment${orderApprovalQueue.length === 1 ? '' : 's'} awaiting approval`,
          description: 'One-time bank-transfer submissions to review',
          href: '/admin-dashboard?tab=approvals',
          tone: 'warning' as const,
        }]
      : []),
    ...(subscriptionApprovalQueue.length > 0
      ? [{
          id: 'subscription-approvals',
          title: `${subscriptionApprovalQueue.length} subscription${subscriptionApprovalQueue.length === 1 ? '' : 's'} awaiting approval`,
          description: 'Plan payments submitted for review',
          href: '/admin-dashboard?tab=subscriptions',
          tone: 'warning' as const,
        }]
      : []),
  ]

  return (
    <DashboardShell
      workspaceLabel="Admin Workspace"
      activeItem={currentTab === 'approvals' ? 'Order Approvals' : currentTab === 'subscriptions' ? 'Subscriptions' : currentTab === 'requests' ? 'All Requests' : 'Overview'}
      roleLabel="Admin"
      notifications={notifications}
      currentUserId={user.id}
      role={role}
      orderContext={Object.fromEntries(allOrders.map((o) => [o.id, o.title]))}
      header={
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Admin Workspace</p>
            <h1 className="mt-1.5 text-[26px] font-semibold leading-8 tracking-[-0.022em]" style={{ color: 'var(--ink)' }}>
              Review and manage support requests
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-5" style={{ color: 'var(--ink-muted)' }}>
              Manual approval queues, quotes, subscriptions, and request progress.
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
          subtitle="Admin Dashboard"
          roleLabel="Admin"
          items={adminSidebarItems}
        />
      }
    >
      <div className="space-y-4">
        {/* ── Overview ── */}
        {currentTab === 'overview' && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="mp-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--ink-muted)]">Pending Approvals</p>
                <h3 className="text-2xl font-bold text-[var(--ink)] mt-2">{orderApprovalQueue.length}</h3>
              </div>
              <Link href="/admin-dashboard?tab=approvals" className="text-sm text-[var(--brand-500)] hover:underline mt-4">View queue &rarr;</Link>
            </div>
            <div className="mp-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--ink-muted)]">Pending Subscriptions</p>
                <h3 className="text-2xl font-bold text-[var(--ink)] mt-2">{subscriptionApprovalQueue.length}</h3>
              </div>
              <Link href="/admin-dashboard?tab=subscriptions" className="text-sm text-[var(--brand-500)] hover:underline mt-4">View subscriptions &rarr;</Link>
            </div>
            <div className="mp-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--ink-muted)]">Total Requests</p>
                <h3 className="text-2xl font-bold text-[var(--ink)] mt-2">{overviewTotalOrders ?? 0}</h3>
              </div>
              <Link href="/admin-dashboard?tab=requests" className="text-sm text-[var(--brand-500)] hover:underline mt-4">View all &rarr;</Link>
            </div>
            <div className="mp-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--ink-muted)]">In Progress</p>
                <h3 className="text-2xl font-bold text-[var(--ink)] mt-2">{overviewInProgress ?? 0}</h3>
              </div>
              <Link href="/admin-dashboard?tab=requests&status=in_progress" className="text-sm text-[var(--brand-500)] hover:underline mt-4">View in progress &rarr;</Link>
            </div>
            <div className="mp-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--ink-muted)]">Completed</p>
                <h3 className="text-2xl font-bold text-[var(--ink)] mt-2">{overviewCompleted ?? 0}</h3>
              </div>
              <Link href="/admin-dashboard?tab=requests&status=completed" className="text-sm text-[var(--brand-500)] hover:underline mt-4">View completed &rarr;</Link>
            </div>
          </div>
        )}

        {/* ── Order Approvals ── */}
        {currentTab === 'approvals' && (
        <section id="approvals" className="mp-card">
          <header className="mp-card-header">
            <div>
              <h2 className="mp-card-title">Order payment approval queue</h2>
              <p className="mp-card-description">Review one-time manual bank-transfer submissions and activate access.</p>
            </div>
            <span className={`mp-badge ${orderApprovalQueue.length > 0 ? 'mp-badge-warning' : ''}`}>
              {orderApprovalQueue.length} pending
            </span>
          </header>

          {orderApprovalQueue.length > 0 ? (
            <ul className="divide-hairline">
              {orderApprovalQueue.map((order) => {
                const invoice = invoiceByOrderId.get(order.id)
                const approval = invoice ? approvalByInvoiceId.get(invoice.id) : null
                return (
                  <li key={order.id} className="mp-row flex-wrap">
                    <div className="min-w-[200px] flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{order.title}</p>
                        <span className="mp-badge mp-badge-warning"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--warn-400)' }} aria-hidden />Pending</span>
                      </div>
                      <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                        {order.course_subject} &bull; Ref: {invoice?.reference_code || approval?.payment_reference || 'N/A'}
                      </p>
                    </div>
                    <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
                      <div>
                        <dt className="eyebrow">Amount</dt>
                        <dd className="tnum text-[13px] font-medium mt-0.5" style={{ color: 'var(--ink)' }}>{formatMoney(order, invoice) || '—'}</dd>
                      </div>
                      <div>
                        <dt className="eyebrow">User ID</dt>
                        <dd className="font-mono text-[12px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>{order.user_id.slice(0, 8)}</dd>
                      </div>
                    </dl>
                    <div className="ml-auto flex items-center gap-2">
                      <ActionForm action={rejectPayment} successTitle="Payment declined">
                        <input type="hidden" name="order_id" value={order.id} />
                        <button type="submit" className="mp-btn mp-btn-ghost mp-btn-sm">Decline</button>
                      </ActionForm>
                      <ActionForm action={confirmPayment} successTitle="Payment approved" successDescription="Order unlocked for delivery.">
                        <input type="hidden" name="order_id" value={order.id} />
                        <button type="submit" className="mp-btn mp-btn-primary mp-btn-sm">Approve</button>
                      </ActionForm>
                      <Link href={`/admin-dashboard/orders/${order.id}`} className="mp-btn mp-btn-outline mp-btn-sm">Open</Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No one-time order payments are waiting for approval right now.</p>
            </div>
          )}
          <footer className="mp-card-footer">
            <p className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>Approvals are logged and visible to super admins.</p>
          </footer>
        </section>
        )}

        {/* ── Subscription Approvals ── */}
        {currentTab === 'subscriptions' && (
        <section id="subscriptions" className="mp-card">
          <header className="mp-card-header">
            <div>
              <h2 className="mp-card-title">Subscription approval queue</h2>
              <p className="mp-card-description">Review weekly and monthly plan payment submissions.</p>
            </div>
            <span className={`mp-badge ${subscriptionApprovalQueue.length > 0 ? 'mp-badge-warning' : ''}`}>
              {subscriptionApprovalQueue.length} pending
            </span>
          </header>

          {subscriptionApprovalQueue.length > 0 ? (
            <ul className="divide-hairline">
              {subscriptionApprovalQueue.map(({ invoice, plan }) => (
                <li key={invoice.id} className="mp-row flex-wrap">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{plan?.name || 'Subscription plan'}</p>
                      <span className="mp-badge mp-badge-warning"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--warn-400)' }} aria-hidden />Pending</span>
                    </div>
                    <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                      User: {invoice.user_id?.slice(0, 8)} &bull; Interval: {plan?.interval || 'N/A'} &bull; Ref: {invoice.reference_code || 'N/A'}
                    </p>
                  </div>
                  <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div>
                      <dt className="eyebrow">Amount</dt>
                      <dd className="tnum text-[13px] font-medium mt-0.5" style={{ color: 'var(--ink)' }}>
                        {typeof invoice.amount_cents === 'number' ? `€${(invoice.amount_cents / 100).toFixed(2)}` : '—'}
                      </dd>
                    </div>
                  </dl>
                  <div className="ml-auto flex items-center gap-2">
                    <ActionForm action={rejectSubscriptionPayment} successTitle="Subscription payment declined">
                      <input type="hidden" name="invoice_id" value={invoice.id} />
                      <button type="submit" className="mp-btn mp-btn-ghost mp-btn-sm">Decline</button>
                    </ActionForm>
                    <ActionForm action={approveSubscriptionPayment} successTitle="Subscription approved" successDescription="Plan activated with full credits.">
                      <input type="hidden" name="invoice_id" value={invoice.id} />
                      <button type="submit" className="mp-btn mp-btn-primary mp-btn-sm">Approve</button>
                    </ActionForm>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No subscription payments are waiting for approval right now.</p>
            </div>
          )}
          <footer className="mp-card-footer">
            <p className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>Approvals are logged and visible to super admins.</p>
          </footer>
        </section>
        )}

        {/* ── All Requests ── */}
        {currentTab === 'requests' && (
        <section id="requests" className="mp-card">
          <header className="mp-card-header">
            <div>
              <h2 className="mp-card-title">All requests</h2>
              <p className="mp-card-description">Monitor request details, image counts, quotes, and progress states.</p>
            </div>
          </header>

          <div className="mp-card-content">
            <form method="get" action="/admin-dashboard" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="requests" />
              <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Search title, subject, description…"
                  className="mp-input h-9 w-full pl-8 text-[13px]"
                />
              </div>
              <select name="status" defaultValue={statusFilter} className="mp-select h-9 text-[13px]">
                <option value="">All statuses</option>
                {REQUEST_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button type="submit" className="mp-btn mp-btn-secondary mp-btn-md">Apply filters</button>
              {(statusFilter || searchQuery) && (
                <Link href="/admin-dashboard?tab=requests" className="mp-btn mp-btn-ghost mp-btn-md">Clear</Link>
              )}
            </form>
          </div>

          <div className="divide-hairline">
            {displayOrders.map((order) => {
              const invoice = invoiceByOrderId.get(order.id)
              const fileCount = fileCountByOrderId[order.id] || 0

              return (
                <div key={order.id} className="mp-row flex-wrap">
                  <div className="min-w-[240px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{order.title}</p>
                      <span className="mp-badge capitalize">{String(order.status_key || order.status || '').replaceAll('_', ' ')}</span>
                    </div>
                    <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                      {order.course_subject} &bull; {fileCount} file(s)
                    </p>
                    {(order.description || order.instructions) && (
                      <p className="mt-2 max-w-3xl text-[12px] leading-5" style={{ color: 'var(--ink-faint)' }}>
                        {(order.description || order.instructions)?.slice(0, 120)}...
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row items-start">
                    {!formatMoney(order, invoice) ? (
                      <ActionForm action={setOrderPrice} successTitle="Quote set" successDescription="Invoice created for the customer." className="flex gap-2">
                        <input type="hidden" name="order_id" value={order.id} />
                        <input type="number" name="price" placeholder="Quote (EUR)" required min="1" step="0.01" className="mp-input h-8 w-32 text-[13px]" />
                        <button type="submit" className="mp-btn mp-btn-primary mp-btn-sm">Set</button>
                      </ActionForm>
                    ) : (
                      <span className="tnum mp-badge">{formatMoney(order, invoice)}</span>
                    )}

                    <ActionForm action={updateOrderStatus} successTitle="Status updated" className="flex gap-2">
                      <input type="hidden" name="order_id" value={order.id} />
                      <select name="status" defaultValue={order.status_key || order.status} className="mp-select h-8 text-[13px]">
                        <option value="review_pending">Review Pending</option>
                        <option value="awaiting_payment">Awaiting Payment</option>
                        <option value="payment_submitted">Payment Submitted</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="revision_requested">Revision Requested</option>
                        <option value="locked">Locked</option>
                      </select>
                      <button type="submit" className="mp-btn mp-btn-secondary mp-btn-sm">Update</button>
                    </ActionForm>

                    <Link href={`/admin-dashboard/orders/${order.id}`} className="mp-btn mp-btn-outline mp-btn-sm">Open</Link>
                  </div>
                </div>
              )
            })}
          </div>
          <footer className="mp-card-footer flex flex-wrap items-center justify-between gap-3">
            {(() => {
              const pageParams = (page: number) => {
                const sp = new URLSearchParams({ tab: 'requests', page: String(page) })
                if (statusFilter) sp.set('status', statusFilter)
                if (searchQuery) sp.set('q', searchQuery)
                return `?${sp.toString()}`
              }
              const start = (currentPage - 1) * pageSize + 1
              const end = Math.min(currentPage * pageSize, totalOrdersCount || 0)
              const first = Math.max(1, currentPage - 2)
              const last = Math.min(totalPages, first + 4)
              const pages: number[] = []
              for (let p = first; p <= last; p++) pages.push(p)
              return (
                <>
                  <p className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                    {totalOrdersCount ? `Showing ${start}–${end} of ${totalOrdersCount}` : 'No requests found'}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/admin-dashboard${pageParams(Math.max(1, currentPage - 1))}`}
                      aria-label="Previous page"
                      className={`mp-btn mp-btn-ghost mp-btn-sm ${currentPage <= 1 ? 'pointer-events-none opacity-40' : ''}`}
                    >
                      <ChevronLeft size={14} aria-hidden />
                    </Link>
                    {pages.map((p) => (
                      <Link
                        key={p}
                        href={`/admin-dashboard${pageParams(p)}`}
                        aria-current={p === currentPage ? 'page' : undefined}
                        className={`mp-btn mp-btn-sm ${p === currentPage ? 'mp-btn-primary' : 'mp-btn-ghost'}`}
                      >
                        {p}
                      </Link>
                    ))}
                    <Link
                      href={`/admin-dashboard${pageParams(Math.min(totalPages, currentPage + 1))}`}
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
        </section>
        )}
      </div>
    </DashboardShell>
  )
}