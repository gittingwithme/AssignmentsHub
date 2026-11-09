import Link from 'next/link'
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, LayoutDashboard, FileTextIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/ui/shared/dashboard-shell'
import DashboardSidebar, {
  customerSidebarItems,
} from '@/components/ui/shared/dashboard-sidebar'
import Reveal from '@/components/ui/shared/reveal'
import PaymentStatusNote from '@/components/ui/shared/payment-status-note'

type OrderRow = {
  id: string
  user_id: string
  title: string
  course_subject: string
  description?: string | null
  instructions?: string | null
  support_type?: string | null
  support_type_key?: string | null
  status?: string | null
  status_key?: string | null
  payment_status?: string | null
  quote_amount_cents?: number | null
  price?: number | string | null
}

type InvoiceRow = {
  id: string
  order_id?: string | null
  amount_cents?: number | null
}

type ApprovalRow = {
  id: string
  invoice_id: string
  approved_at?: string | null
  rejected_at?: string | null
  approval_note_seen_at?: string | null
}

function parsePrice(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function formatMoney(amountCents?: number | null, price?: number | string | null) {
  if (typeof amountCents === 'number') return `€${(amountCents / 100).toFixed(2)}`
  const parsedPrice = parsePrice(price)
  if (parsedPrice !== null) return `€${parsedPrice.toFixed(2)}`
  return null
}

function prettifyLabel(value: string | null | undefined) {
  if (!value) return 'N/A'
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function needsAttention(
  order: OrderRow,
  paymentState: 'awaiting_payment' | 'processing' | 'pending_approval' | 'approved' | 'rejected' | 'failed' | 'cancelled' | 'expired',
  displayAmount: string | null
) {
  if (paymentState === 'pending_approval' || paymentState === 'rejected') return true
  if (paymentState === 'failed' || paymentState === 'cancelled' || paymentState === 'expired') return true
  if (!displayAmount && ['review_pending', 'draft', 'pending'].includes(order.status_key || order.status || '')) {
    return true
  }
  if (paymentState === 'awaiting_payment' && displayAmount) return true
  return false
}

const PAGE_SIZE = 10

export default async function DashboardPage({ searchParams }: { searchParams: { tab?: string, q?: string, page?: string } }) {
  const params = await searchParams
  const currentTab = params.tab || 'overview'
  const searchQuery = params.q?.trim() || ''
  const currentPage = Math.max(1, parseInt(params.page || '1', 10))
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: orders }, { data: invoices }, { data: approvals }, { data: subscriptions }, { data: recentUsage }] =
    await Promise.all([
      supabase.from('users').select('full_name, role').eq('id', user.id).single(),
      supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase
        .from('payment_approvals')
        .select('*')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('upload_usage_logs')
        .select('*')
        .eq('user_id', user.id)
        // eslint-disable-next-line react-hooks/purity
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ])

  const displayName = profile?.full_name || 'Student'
  const allOrders = (orders ?? []) as OrderRow[]
  const allInvoices = (invoices ?? []) as InvoiceRow[]
  const allApprovals = (approvals ?? []) as ApprovalRow[]
  const activeSubscription =
    (subscriptions ?? []).find((sub) => sub.status === 'active') ||
    (subscriptions ?? []).find((sub) => ['pending_approval', 'awaiting_payment'].includes(sub.status)) ||
    null

  const invoiceByOrderId = new Map<string, InvoiceRow>(
    allInvoices.filter((inv) => !!inv.order_id).map((inv) => [inv.order_id as string, inv])
  )

  const approvalByInvoiceId = new Map<string, ApprovalRow>(
    allApprovals.map((approval) => [approval.invoice_id, approval])
  )

  const attentionCount = allOrders.filter((order) => {
    const invoice = invoiceByOrderId.get(order.id)
    const approval = invoice ? approvalByInvoiceId.get(invoice.id) : undefined
    const displayAmount = formatMoney(order.quote_amount_cents ?? invoice?.amount_cents, order.price)

    let paymentState: 'awaiting_payment' | 'pending_approval' | 'approved' | 'rejected' = 'awaiting_payment'
    if (approval?.rejected_at) paymentState = 'rejected'
    else if (approval?.approved_at) paymentState = 'approved'
    else if (['payment_submitted', 'pending_approval', 'verification_pending'].includes(order.payment_status || '')) {
      paymentState = 'pending_approval'
    }

    return needsAttention(order, paymentState, displayAmount)
  }).length

  const uploadsInLast24h = recentUsage?.length ?? 0
  const uploadsRemaining =
    activeSubscription?.plans?.rolling_24h_upload_limit != null
      ? Math.max(activeSubscription.plans.rolling_24h_upload_limit - uploadsInLast24h, 0)
      : null

  const filteredOrders = searchQuery
    ? allOrders.filter((order) => {
        const q = searchQuery.toLowerCase()
        return [order.title, order.course_subject, order.description, order.instructions]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q))
      })
    : allOrders

  // My Requests tab paginates the (search-filtered) list client-side
  const filteredTotal = filteredOrders.length
  const filteredPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))
  const safePage = Math.min(currentPage, filteredPages)
  const pagedOrders = currentTab === 'requests'
    ? filteredOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    : filteredOrders

  const notifications = [
    ...(attentionCount > 0
      ? [{
          id: 'attention',
          title: `${attentionCount} request${attentionCount === 1 ? '' : 's'} need your attention`,
          description: 'Payment or review action required',
          href: '/dashboard?tab=requests',
          tone: 'warning' as const,
        }]
      : []),
    ...(activeSubscription &&
    ['pending_approval', 'awaiting_payment'].includes(activeSubscription.status)
      ? [{
          id: 'subscription',
          title: 'Your subscription payment is pending',
          description: 'Complete the bank transfer to activate your plan',
          href: '/dashboard/subscription',
          tone: 'brand' as const,
        }]
      : []),
  ]

  const requestsSection = (
    <Reveal delay={0.05}>
      <section className="mp-card">
        <header className="mp-card-header">
          <div>
            <h2 className="mp-card-title">Your requests</h2>
            <p className="mp-card-description">Open a request for full details, payment steps, and messaging.</p>
          </div>
          <Link href="/dashboard/new-order" className="mp-btn mp-btn-outline mp-btn-sm">New request →</Link>
        </header>
        <div className="w-full overflow-x-auto">
          {pagedOrders.length > 0 ? (
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr>
                  <th className="mp-th">Request</th>
                  <th className="mp-th hidden md:table-cell">Category</th>
                  <th className="mp-th">Status</th>
                  <th className="mp-th hidden sm:table-cell">Amount</th>
                  <th className="mp-th w-10" />
                </tr>
              </thead>
              <tbody>
                {pagedOrders.map((order) => {
                  const invoice = invoiceByOrderId.get(order.id)
                  const approval = invoice ? approvalByInvoiceId.get(invoice.id) : undefined
                  const displayAmount = formatMoney(order.quote_amount_cents ?? invoice?.amount_cents, order.price)
                  let paymentState: 'awaiting_payment' | 'processing' | 'pending_approval' | 'approved' | 'rejected' | 'failed' | 'cancelled' | 'expired' = 'awaiting_payment'
                  if (approval?.rejected_at) paymentState = 'rejected'
                  else if (approval?.approved_at || order.payment_status === 'approved') paymentState = 'approved'
                  else if (order.payment_status === 'processing') paymentState = 'processing'
                  else if (order.payment_status === 'failed') paymentState = 'failed'
                  else if (order.payment_status === 'cancelled') paymentState = 'cancelled'
                  else if (order.payment_status === 'expired') paymentState = 'expired'
                  else if (['payment_submitted', 'pending_approval', 'verification_pending'].includes(order.payment_status || '')) paymentState = 'pending_approval'
                  const hideApprovedBanner = paymentState === 'approved' && !!approval?.approval_note_seen_at
                  let statusNote: ReactNode = null
                  if (paymentState === 'pending_approval') statusNote = <PaymentStatusNote state="pending_approval" approvalId={approval?.id ?? null} />
                  else if (paymentState === 'approved' && approval && !hideApprovedBanner) statusNote = <PaymentStatusNote state="approved" approvalId={approval.id} />
                  else if (paymentState === 'rejected') statusNote = <PaymentStatusNote state="rejected" approvalId={approval?.id ?? null} />
                  const showAttention = needsAttention(order, paymentState, displayAmount)
                  return (
                    <tr key={order.id} className="mp-tr">
                      <td className="mp-td">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ border: '1px solid var(--hairline)', backgroundColor: 'var(--surface-raised)', color: 'var(--ink-faint)' }}>
                            <FileTextIcon size={13} aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium" style={{ color: 'var(--ink)' }}>{order.title}</span>
                            <span className="block font-mono text-[11px]" style={{ color: 'var(--ink-faint)' }}>{order.id.slice(0, 8)}</span>
                          </span>
                        </div>
                        {statusNote && <div className="mt-2">{statusNote}</div>}
                      </td>
                      <td className="mp-td hidden md:table-cell">{order.course_subject}</td>
                      <td className="mp-td">
                        {showAttention
                          ? <span className="mp-badge mp-badge-warning"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--warn-400)' }} aria-hidden />Needs attention</span>
                          : <span className="mp-badge"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--ink-faint)' }} aria-hidden />{prettifyLabel(order.status_key || order.status || 'Review Pending')}</span>
                        }
                      </td>
                      <td className="mp-td hidden sm:table-cell tnum text-right font-medium" style={{ color: 'var(--ink)' }}>{displayAmount || '—'}</td>
                      <td className="mp-td text-right">
                        <Link href={`/dashboard/orders/${order.id}`} className="mp-btn mp-btn-ghost mp-btn-sm">→</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center">
              {allOrders.length === 0 ? (
                <>
                  <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>You have not submitted any support requests yet.</p>
                  <Link href="/dashboard/new-order" className="mp-btn mp-btn-secondary mp-btn-sm mt-4 inline-flex">Create your first request</Link>
                </>
              ) : (
                <>
                  <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No requests match “{searchQuery}”.</p>
                  <Link href="/dashboard?tab=requests" className="mp-btn mp-btn-secondary mp-btn-sm mt-4 inline-flex">Clear search</Link>
                </>
              )}
            </div>
          )}
        </div>
        {currentTab === 'requests' && filteredTotal > 0 && (
          <footer className="mp-card-footer flex flex-wrap items-center justify-between gap-3">
            {(() => {
              const pageParams = (page: number) => {
                const sp = new URLSearchParams({ tab: 'requests', page: String(page) })
                if (searchQuery) sp.set('q', searchQuery)
                return `?${sp.toString()}`
              }
              const start = (safePage - 1) * PAGE_SIZE + 1
              const end = Math.min(safePage * PAGE_SIZE, filteredTotal)
              const first = Math.max(1, safePage - 2)
              const last = Math.min(filteredPages, first + 4)
              const pages: number[] = []
              for (let p = first; p <= last; p++) pages.push(p)
              return (
                <>
                  <p className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>Showing {start}–{end} of {filteredTotal}</p>
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/dashboard${pageParams(Math.max(1, safePage - 1))}`}
                      aria-label="Previous page"
                      className={`mp-btn mp-btn-ghost mp-btn-sm ${safePage <= 1 ? 'pointer-events-none opacity-40' : ''}`}
                    >
                      <ChevronLeft size={14} aria-hidden />
                    </Link>
                    {pages.map((p) => (
                      <Link
                        key={p}
                        href={`/dashboard${pageParams(p)}`}
                        aria-current={p === safePage ? 'page' : undefined}
                        className={`mp-btn mp-btn-sm ${p === safePage ? 'mp-btn-primary' : 'mp-btn-ghost'}`}
                      >
                        {p}
                      </Link>
                    ))}
                    <Link
                      href={`/dashboard${pageParams(Math.min(filteredPages, safePage + 1))}`}
                      aria-label="Next page"
                      className={`mp-btn mp-btn-ghost mp-btn-sm ${safePage >= filteredPages ? 'pointer-events-none opacity-40' : ''}`}
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
    </Reveal>
  )

  return (
    <DashboardShell
      workspaceLabel="Customer Workspace"
      activeItem={currentTab === 'requests' ? 'My Requests' : 'Overview'}
      roleLabel="Customer"
      notifications={notifications}
      currentUserId={user.id}
      role="customer"
      orderContext={Object.fromEntries(allOrders.map((o) => [o.id, o.title]))}
      header={
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Customer Workspace</p>
            <h1 className="mt-1.5 text-[26px] font-semibold leading-8 tracking-[-0.022em]" style={{ color: 'var(--ink)' }}>
              Welcome back, {displayName}
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-5" style={{ color: 'var(--ink-muted)' }}>
              Manage your support requests and subscription from here.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/dashboard/new-order" className="mp-btn mp-btn-primary mp-btn-md">+ New request</Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="mp-btn mp-btn-secondary mp-btn-md">Log out</button>
            </form>
          </div>
        </div>
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
      <div className="space-y-4">
        <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="stat-card">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Plan status</p>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border" style={{ borderColor: 'rgba(200,27,28,0.25)', backgroundColor: 'var(--brand-900)', color: 'var(--brand-300)' }}>
                <LayoutDashboard size={14} aria-hidden />
              </span>
            </div>
            <p className="mt-3 tnum text-[22px] font-semibold leading-7 tracking-[-0.02em]" style={{ color: 'var(--ink)' }}>
              {activeSubscription?.plans?.name || 'No active plan'}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-faint)' }}>Pay-as-you-go pricing applies</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Needs attention</p>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border" style={attentionCount > 0 ? { borderColor: 'rgba(245,158,11,0.25)', backgroundColor: 'var(--warn-900)', color: 'var(--warn-400)' } : { borderColor: 'var(--hairline)', backgroundColor: 'var(--surface-raised)', color: 'var(--ink-muted)' }}>
                <AlertTriangle size={14} aria-hidden />
              </span>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <p className="tnum text-[26px] font-semibold leading-8 tracking-[-0.02em]" style={{ color: 'var(--ink)' }}>{attentionCount}</p>
              {attentionCount > 0 && <span className="mb-1 text-[12px] font-medium" style={{ color: 'var(--warn-400)' }}>Action required</span>}
            </div>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-faint)' }}>Action required to continue</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Total requests</p>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border" style={{ borderColor: 'var(--hairline)', backgroundColor: 'var(--surface-raised)', color: 'var(--ink-muted)' }}>
                <Inbox size={14} aria-hidden />
              </span>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <p className="tnum text-[26px] font-semibold leading-8 tracking-[-0.02em]" style={{ color: 'var(--ink)' }}>{allOrders.length}</p>
              <span className="mb-1 text-[12px] font-medium" style={{ color: 'var(--brand-400)' }}>↑ 2 this month</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.03}>
          <section className="mp-card">
            <header className="mp-card-header">
              <div>
                <h2 className="mp-card-title">Your plan</h2>
                <p className="mp-card-description">
                  {activeSubscription
                    ? `${prettifyLabel(activeSubscription.status)} • ${activeSubscription.remaining_credits ?? 0} credits • ${uploadsRemaining ?? 'N/A'} uploads left / 24h`
                    : 'No active subscription. Subscriptions unlock priority turnaround and lower per-request pricing.'}
                </p>
              </div>
              <Link href="/dashboard/subscription" className="mp-btn mp-btn-secondary mp-btn-sm">Manage subscription</Link>
            </header>
          </section>
        </Reveal>

        {/* ── Platform Promise banner ── */}
        {currentTab === 'overview' && (
        <Reveal delay={0.08}>
          <div
            className="relative overflow-hidden rounded-xl"
            style={{
              border: '1px solid var(--hairline)',
              background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-raised) 100%)',
            }}
          >
            {/* Emerald glow accent */}
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(200,27,28,0.14) 0%, transparent 70%)',
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(222,92,92,0.08) 0%, transparent 70%)',
              }}
              aria-hidden
            />

            <div className="relative flex flex-col items-start gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <span
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base"
                  style={{
                    border: '1px solid rgba(200,27,28,0.3)',
                    backgroundColor: 'var(--brand-900)',
                    color: 'var(--brand-300)',
                  }}
                >
                  🎓
                </span>
                <div>
                  <p
                    className="text-[14px] font-semibold"
                    style={{ color: 'var(--ink)' }}
                  >
                    Your academic goals, our commitment
                  </p>
                  <p
                    className="mt-1 max-w-lg text-[12px] leading-5"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    Every request is handled with full confidentiality, expert care, and timely delivery.
                    Need priority turnaround? Upgrade your subscription to unlock faster response times.
                  </p>
                  {/* Mini trust chips */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['✓ Confidential', '✓ Expert writers', '✓ On-time delivery', '✓ Free revisions'].map((t) => (
                      <span
                        key={t}
                        className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          border: '1px solid rgba(200,27,28,0.18)',
                          backgroundColor: 'rgba(200,27,28,0.06)',
                          color: 'var(--brand-400)',
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                <Link href="/dashboard/new-order" className="mp-btn mp-btn-primary mp-btn-md whitespace-nowrap">
                  Start a new request
                </Link>
                <Link href="/dashboard/subscription" className="mp-btn mp-btn-ghost mp-btn-sm whitespace-nowrap">
                  View subscription →
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
        )}

        {currentTab === 'requests' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-[16px] font-semibold" style={{ color: 'var(--ink)' }}>All my requests</h2>
                <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-muted)' }}>Everything you have submitted, newest first.</p>
              </div>
              <Link href="/dashboard/new-order" className="mp-btn mp-btn-primary mp-btn-md">+ New request</Link>
            </div>
            {searchQuery && (
              <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--hairline)', backgroundColor: 'var(--surface)' }}>
                <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                  Showing results for “{searchQuery}”
                </p>
                <Link href="/dashboard?tab=requests" className="ml-auto text-[12px] font-medium hover:underline" style={{ color: 'var(--brand-400)' }}>Clear</Link>
              </div>
            )}
            {requestsSection}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
