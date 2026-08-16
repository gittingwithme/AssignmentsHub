import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/ui/shared/dashboard-shell'
import DashboardSidebar, { adminSidebarItems } from '@/components/ui/shared/dashboard-sidebar'
import ActionForm from '@/components/ui/shared/action-form'
import Reveal from '@/components/ui/shared/reveal'
import { updateOrderStatus, uploadAdminOutput } from '@/app/admin-actions'
import { confirmPayment, rejectPayment, setOrderPrice } from '@/app/payment-actions'
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

export default async function AdminOrderDetailPage({
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

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!['admin', 'super_admin'].includes(profile?.role || 'customer')) {
    redirect('/dashboard')
  }

  const [{ data: order }, { data: files }, { data: messages }, { data: invoice }, { data: approval }] =
    await Promise.all([
      supabase.from('orders').select('*').eq('id', id).maybeSingle(),
      supabase.from('order_files').select('*').eq('order_id', id).order('created_at', { ascending: true }),
      supabase.from('messages').select('*').eq('order_id', id).order('created_at', { ascending: true }),
      supabase.from('invoices').select('*').eq('order_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('payment_approvals').select('*').order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
    ])

  if (!order) redirect('/admin-dashboard')

  const resolvedFiles = await resolveOrderFilesForDisplay((files ?? []) as OrderFileRow[])
  const inputFiles = resolvedFiles.filter((file) => isCustomerInputCategory(file.file_category))
  const finalFiles = resolvedFiles.filter((file) => isFinalOutputCategory(file.file_category))

  const displayAmount = formatMoney(order.quote_amount_cents ?? invoice?.amount_cents, order.price)
  const paymentPending = ['payment_submitted', 'pending_approval', 'verification_pending'].includes(order.payment_status || '')

  return (
    <DashboardShell
      workspaceLabel="Admin Workspace"
      activeItem="Order Details"
      header={
        <Reveal className="glass-panel flex flex-col gap-4 rounded-[30px] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <Link href="/admin-dashboard" className="subtle-link text-sm">
              ← Back to admin dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{order.title}</h1>
            <p className="mt-2 text-sm text-zinc-400">User ID: {order.user_id}</p>
          </div>
          <div className="status-chip capitalize">{prettifyLabel(order.status_key || order.status)}</div>
        </Reveal>
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
      <div className="space-y-6">
        <Reveal className="premium-card p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">Request overview</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Course Subject</p>
              <p className="mt-2 text-sm text-white">{order.course_subject}</p>
            </div>
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
              <p className="mt-2 text-sm text-white">{displayAmount || 'Pending quote'}</p>
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

        <Reveal delay={0.05} className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="premium-card p-6 md:p-8">
            <h2 className="text-xl font-semibold text-white">Billing control</h2>

            <div className="mt-5 space-y-4">
              {!displayAmount ? (
                <ActionForm action={setOrderPrice} successTitle="Quote set" successDescription="Invoice created for the customer." className="space-y-3">
                  <input type="hidden" name="order_id" value={order.id} />
                  <input
                    type="number"
                    name="price"
                    placeholder="Set quote in EUR"
                    required
                    min="1"
                    step="0.01"
                    className="premium-input"
                  />
                  <button type="submit" className="premium-button-primary">
                    Set quote
                  </button>
                </ActionForm>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
                  <p>Invoice Reference: {invoice?.reference_code || 'N/A'}</p>
                  <p className="mt-2">Payment Status: {prettifyLabel(order.payment_status)}</p>
                  {approval?.payment_reference ? (
                    <p className="mt-2">Submitted Reference: {approval.payment_reference}</p>
                  ) : null}
                </div>
              )}

              {paymentPending ? (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <ActionForm action={confirmPayment} successTitle="Payment approved" successDescription="Order unlocked for delivery.">
                    <input type="hidden" name="order_id" value={order.id} />
                    <button type="submit" className="premium-button-primary">
                      Approve payment
                    </button>
                  </ActionForm>
                  <ActionForm action={rejectPayment} successTitle="Payment declined">
                    <input type="hidden" name="order_id" value={order.id} />
                    <button type="submit" className="premium-button">
                      Reject payment
                    </button>
                  </ActionForm>
                </div>
              ) : null}
            </div>
          </div>

          <div className="premium-card p-6 md:p-8">
            <h2 className="text-xl font-semibold text-white">Status & final output</h2>

            <div className="mt-5 space-y-4">
              <ActionForm action={updateOrderStatus} successTitle="Status updated" className="space-y-3">
                <input type="hidden" name="order_id" value={order.id} />
                <select
                  name="status"
                  defaultValue={order.status_key || order.status}
                  className="premium-select"
                >
                  <option value="review_pending" className="bg-[#0C1210] text-white">
                    Review Pending
                  </option>
                  <option value="awaiting_payment" className="bg-[#0C1210] text-white">
                    Awaiting Payment
                  </option>
                  <option value="payment_submitted" className="bg-[#0C1210] text-white">
                    Payment Submitted
                  </option>
                  <option value="in_progress" className="bg-[#0C1210] text-white">
                    In Progress
                  </option>
                  <option value="completed" className="bg-[#0C1210] text-white">
                    Completed
                  </option>
                  <option value="revision_requested" className="bg-[#0C1210] text-white">
                    Revision Requested
                  </option>
                  <option value="locked" className="bg-[#0C1210] text-white">
                    Locked
                  </option>
                </select>
                <button type="submit" className="premium-button">
                  Update status
                </button>
              </ActionForm>

              <ActionForm action={uploadAdminOutput} successTitle="Final output uploaded" successDescription="Customer can now download it." className="space-y-3">
                <input type="hidden" name="order_id" value={order.id} />
                <select name="output_format" defaultValue="PDF" className="premium-select">
                  <option value="DOCX" className="bg-[#0C1210] text-white">
                    DOCX
                  </option>
                  <option value="PDF" className="bg-[#0C1210] text-white">
                    PDF
                  </option>
                  <option value="Image" className="bg-[#0C1210] text-white">
                    Image
                  </option>
                </select>
                <input
                  type="file"
                  name="output_file"
                  required
                  accept=".docx,.pdf,image/*"
                  className="premium-file-input"
                />
                <button type="submit" className="premium-button-primary">
                  Upload final output
                </button>
              </ActionForm>
            </div>
          </div>
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
              <p className="text-sm text-zinc-400">No submitted files found.</p>
            )}
          </div>
        </Reveal>

        <Reveal delay={0.1} className="premium-card p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">Final outputs</h2>
          <div className="mt-5 space-y-3">
            {finalFiles.length > 0 ? (
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
                  <span className="subtle-link">Open</span>
                </a>
              ))
            ) : (
              <p className="text-sm text-zinc-400">No final outputs uploaded yet.</p>
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
            composerPlaceholder="Write a message to the customer…"
            otherPartyLabel="Customer"
          />
        </Reveal>
      </div>
    </DashboardShell>
  )
}