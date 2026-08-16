import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/ui/shared/dashboard-shell'
import DashboardSidebar, {
  customerSidebarItems,
} from '@/components/ui/shared/dashboard-sidebar'
import ActionForm from '@/components/ui/shared/action-form'
import Reveal from '@/components/ui/shared/reveal'
import PaymentStatusNote from '@/components/ui/shared/payment-status-note'
import { notifyPaymentMade } from '@/app/payment-actions'
import OrderThread from '@/components/ui/shared/order-thread'
import {
  isCustomerInputCategory,
  isFinalOutputCategory,
  prettifyFileCategory,
  resolveOrderFilesForDisplay,
  type OrderFileRow,
} from '@/lib/storage'

function prettifyLabel(value: string | null | undefined) {
  if (!value) return 'N/A'
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatMoney(amountCents?: number | null, price?: number | string | null) {
  if (typeof amountCents === 'number') return `€${(amountCents / 100).toFixed(2)}`
  if (typeof price === 'number') return `€${price.toFixed(2)}`
  if (typeof price === 'string') {
    const parsed = Number(price)
    if (!Number.isNaN(parsed)) return `€${parsed.toFixed(2)}`
  }
  return null
}

export default async function CustomerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [
    { data: order },
    { data: files },
    { data: messages },
    { data: invoice },
    { data: approval },
    { data: payoutSettings },
  ] = await Promise.all([
    supabase.from('orders').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(),
    supabase.from('order_files').select('*').eq('order_id', id).order('created_at', { ascending: true }),
    supabase.from('messages').select('*').eq('order_id', id).order('created_at', { ascending: true }),
    supabase.from('invoices').select('*').eq('order_id', id).eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('payment_approvals').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('payout_settings').select('*').eq('is_active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!order) redirect('/dashboard')

  const resolvedFiles = await resolveOrderFilesForDisplay((files ?? []) as OrderFileRow[])
  const inputFiles = resolvedFiles.filter((file) => isCustomerInputCategory(file.file_category))
  const finalFiles = resolvedFiles.filter((file) => isFinalOutputCategory(file.file_category))

  const displayAmount = formatMoney(order.quote_amount_cents ?? invoice?.amount_cents, order.price)

  let paymentState: 'awaiting_payment' | 'pending_approval' | 'approved' | 'rejected' =
    'awaiting_payment'

  if (approval?.rejected_at) {
    paymentState = 'rejected'
  } else if (approval?.approved_at) {
    paymentState = 'approved'
  } else if (
    ['payment_submitted', 'pending_approval', 'verification_pending'].includes(order.payment_status || '')
  ) {
    paymentState = 'pending_approval'
  }

  const hideApprovedBanner = paymentState === 'approved' && !!approval?.approval_note_seen_at

  return (
    <DashboardShell
      workspaceLabel="Customer Workspace"
      activeItem="Order Details"
      header={
        <Reveal className="glass-panel flex flex-col gap-4 rounded-[30px] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <Link href="/dashboard" className="subtle-link text-sm">
              ← Back to dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{order.title}</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Course Subject: {order.course_subject}
            </p>
          </div>
          <div className="status-chip capitalize">
            {prettifyLabel(order.status_key || order.status)}
          </div>
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
          <h2 className="text-xl font-semibold text-white">Request details</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Support Type</p>
              <p className="mt-2 text-sm text-white">
                {prettifyLabel(order.support_type_key || order.support_type)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Output Format</p>
              <p className="mt-2 text-sm text-white">
                {prettifyLabel(order.requested_output_format_key || order.requested_output_format)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Quote</p>
              <p className="mt-2 text-sm text-white">{displayAmount || 'Pending review'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Payment Status</p>
              <p className="mt-2 text-sm text-white">{prettifyLabel(order.payment_status)}</p>
            </div>
          </div>

          {(order.description || order.instructions) ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Description</p>
              <p className="mt-3 text-sm leading-7 text-zinc-300">
                {order.description || order.instructions}
              </p>
            </div>
          ) : null}
        </Reveal>

        <Reveal delay={0.05}>
          {displayAmount && paymentState === 'awaiting_payment' ? (
            <div className="premium-card p-6 md:p-8">
              <h2 className="text-xl font-semibold text-white">Payment required</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Complete the bank transfer below, then submit it for approval.
              </p>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
                {payoutSettings ? (
                  <>
                    <p className="font-medium text-white">{payoutSettings.bank_name}</p>
                    <p>Account Holder: {payoutSettings.account_holder_name}</p>
                    <p>IBAN: {payoutSettings.iban}</p>
                    {payoutSettings.bic_swift ? <p>BIC/SWIFT: {payoutSettings.bic_swift}</p> : null}
                    {invoice?.reference_code ? (
                      <p className="mt-2">
                        Reference: <span className="text-white">{invoice.reference_code}</span>
                      </p>
                    ) : null}
                    {payoutSettings.payment_reference_instructions ? (
                      <p className="mt-2 text-zinc-400">{payoutSettings.payment_reference_instructions}</p>
                    ) : null}
                  </>
                ) : (
                  <p>Bank transfer instructions will appear once admin configures payout settings.</p>
                )}
              </div>

              <ActionForm action={notifyPaymentMade} successTitle="Payment submitted" successDescription="Admins have been notified for approval." className="mt-5 space-y-3">
                <input type="hidden" name="order_id" value={order.id} />
                <input type="hidden" name="order_title" value={order.title} />
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
          ) : !hideApprovedBanner && approval ? (
            <PaymentStatusNote
              state={
                paymentState === 'rejected'
                  ? 'rejected'
                  : paymentState === 'approved'
                    ? 'approved'
                    : 'pending_approval'
              }
              approvalId={approval.id}
            />
          ) : null}
        </Reveal>

        <Reveal delay={0.08} className="premium-card p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">Submitted files</h2>
          <div className="mt-5 space-y-3">
            {inputFiles.length > 0 ? (
              inputFiles.map((file) => (
                <a
                  key={file.id}
                  href={file.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300 hover:bg-white/[0.05]"
                >
                  <div>
                    <p className="font-medium text-white">{file.display_name}</p>
                    <p className="mt-1 text-xs text-zinc-400">{prettifyFileCategory(file.file_category)}</p>
                  </div>
                  <span className="subtle-link">Open</span>
                </a>
              ))
            ) : (
              <p className="text-sm text-zinc-400">No uploaded files found.</p>
            )}
          </div>
        </Reveal>

        <Reveal delay={0.1} className="premium-card p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">Final outputs</h2>
          <div className="mt-5 space-y-3">
            {finalFiles.length > 0 ? (
              order.final_output_locked ? (
                <div className="alert alert-warn">
                  Final outputs are currently locked until billing conditions are satisfied.
                </div>
              ) : (
                finalFiles.map((file) => (
                  <a
                    key={file.id}
                    href={file.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300 hover:bg-white/[0.05]"
                  >
                    <div>
                      <p className="font-medium text-white">{file.display_name}</p>
                      <p className="mt-1 text-xs text-zinc-400">{prettifyFileCategory(file.file_category)}</p>
                    </div>
                    <span className="subtle-link">Download</span>
                  </a>
                ))
              )
            ) : (
              <p className="text-sm text-zinc-400">No final outputs have been uploaded yet.</p>
            )}
          </div>
        </Reveal>

        <Reveal delay={0.12} className="premium-card p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">Messages</h2>

          <OrderThread
            orderId={order.id}
            currentUserId={user.id}
            messages={(messages ?? []).map((message: { id: string; sender_id: string; body: string; created_at?: string; reply_to?: string | null }) => ({
              id: message.id,
              sender_id: message.sender_id,
              body: message.body,
              created_at: message.created_at,
              reply_to: message.reply_to,
            }))}
            placeholder="No messages yet."
            composerPlaceholder="Write a message to the admin…"
            otherPartyLabel="Admin"
          />
        </Reveal>
      </div>
    </DashboardShell>
  )
}