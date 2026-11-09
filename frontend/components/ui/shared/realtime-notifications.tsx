'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  XIcon,
  MessageSquareIcon,
  CreditCardIcon,
  FileTextIcon,
  SparklesIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { DashboardNotification } from '@/components/ui/shared/dashboard-shell'

type RealtimeNotificationsProps = {
  /** 'customer' | 'admin' | 'super_admin' — changes what the bell watches */
  role: string
  /** Viewer's auth uid */
  userId: string
  /** Orders the viewer can see: { orderId: orderTitle } */
  orderContext: Record<string, string>
  /** Called whenever a new live notification arrives (bell dot + dropdown) */
  onLiveNotification: (notification: DashboardNotification) => void
}

type LiveToast = {
  id: string
  title: string
  description: string
  href: string
  icon?: 'message' | 'payment' | 'order' | 'subscription'
  tone?: 'brand' | 'warning' | 'error' | 'info'
}

export default function RealtimeNotifications({
  role,
  userId,
  orderContext,
  onLiveNotification,
}: RealtimeNotificationsProps) {
  const supabase = useMemo(() => createClient(), [])
  const [toasts, setToasts] = useState<LiveToast[]>([])
  const orderTitlesRef = useRef(orderContext)
  const roleRef = useRef(role)
  const onLiveNotificationRef = useRef(onLiveNotification)

  // Keep the latest props available to the subscriptions without restarting them
  useEffect(() => {
    orderTitlesRef.current = orderContext
    roleRef.current = role
    onLiveNotificationRef.current = onLiveNotification
  }, [orderContext, role, onLiveNotification])

  // Auto-dismiss each toast after 6 seconds
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((toast) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
      }, 6000)
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts])

  // ── 1. Live Chat / Texting Messages Channel ──────────────────────────────
  useEffect(() => {
    const isStaff = roleRef.current !== 'customer'

    async function resolveSender(senderId: string): Promise<string> {
      try {
        const { data } = await supabase.from('users').select('full_name').eq('id', senderId).maybeSingle()
        return data?.full_name || (senderId === userId ? 'You' : 'A user')
      } catch {
        return senderId === userId ? 'You' : 'A user'
      }
    }

    const orderIds = Object.keys(orderTitlesRef.current)
    const channelFilter = isStaff
      ? undefined
      : orderIds.length > 0
        ? `order_id=in.(${orderIds.slice(0, 50).join(',')})`
        : `order_id=in.(00000000-0000-0000-0000-000000000000)`

    const channel = supabase
      .channel('rt:notifications:messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          ...(channelFilter ? { filter: channelFilter } : {}),
        },
        async (payload) => {
          const row = payload.new as {
            id?: string
            order_id?: string
            sender_id?: string
            body?: string
            created_at?: string
          }
          if (!row?.id || !row.order_id || !row.sender_id) return
          if (row.sender_id === userId) return // own messages don't notify

          const orderTitle = orderTitlesRef.current[row.order_id] || 'your request'
          const preview = (row.body || '').replace(/[#*`>_~-]/g, '').trim().slice(0, 65)
          const sender = await resolveSender(row.sender_id)

          const title = isStaff
            ? `New message from ${sender}`
            : `New message from AssignmentsHub Support`

          const description = preview
            ? `${orderTitle}: “${preview}${preview.length >= 65 ? '…' : ''}”`
            : `New message on ${orderTitle}`

          const href = isStaff
            ? `/admin-dashboard/orders/${row.order_id}`
            : `/dashboard/orders/${row.order_id}`

          onLiveNotificationRef.current({
            id: `msg-${row.id}`,
            title,
            description,
            href,
            tone: 'brand',
            createdAt: row.created_at || new Date().toISOString(),
          })

          setToasts((prev) => [
            {
              id: row.id as string,
              title,
              description,
              href,
              icon: 'message' as const,
              tone: 'brand' as const,
            },
            ...prev,
          ].slice(0, 4))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  // ── 2. Payment Lifecycle & Approvals Channel ─────────────────────────────
  useEffect(() => {
    const isStaff = roleRef.current !== 'customer'

    const channel = supabase
      .channel('rt:notifications:payments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_approvals',
          ...(isStaff ? {} : { filter: `user_id=eq.${userId}` }),
        },
        (payload) => {
          const row = payload.new as {
            id?: string
            user_id?: string
            order_id?: string
            approved_at?: string | null
            rejected_at?: string | null
            submitted_at?: string | null
          }
          if (!row?.id) return

          if (isStaff) {
            if (payload.eventType !== 'INSERT') return
            const title = 'New payment awaiting review'
            const description = 'A customer submitted a bank-transfer payment. Review it in the approval queue.'
            const href = '/admin-dashboard?tab=approvals'

            onLiveNotificationRef.current({
              id: `pay-${row.id}`,
              title,
              description,
              href,
              tone: 'warning',
              createdAt: row.submitted_at || new Date().toISOString(),
            })

            setToasts((prev) => [
              {
                id: `pay-${row.id}`,
                title,
                description,
                href,
                icon: 'payment' as const,
                tone: 'warning' as const,
              },
              ...prev,
            ].slice(0, 4))
          } else {
            if (payload.eventType === 'INSERT') return
            const approved = !!row.approved_at
            const rejected = !!row.rejected_at
            if (!approved && !rejected) return

            const title = approved ? 'Payment approved' : 'Payment needs attention'
            const description = approved
              ? 'Your payment was verified and approved. Work on your request is now underway.'
              : 'Your payment could not be approved. Please review the details or contact support.'
            const href = row.order_id ? `/dashboard/orders/${row.order_id}` : '/dashboard?tab=requests'

            onLiveNotificationRef.current({
              id: `pay-${row.id}-${approved ? 'a' : 'r'}`,
              title,
              description,
              href,
              tone: approved ? 'brand' : 'error',
              createdAt: new Date().toISOString(),
            })

            setToasts((prev) => [
              {
                id: `pay-${row.id}-${approved ? 'a' : 'r'}`,
                title,
                description,
                href,
                icon: 'payment' as const,
                tone: approved ? ('brand' as const) : ('error' as const),
              },
              ...prev,
            ].slice(0, 4))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  // ── 3. Orders Lifecycle & Status Updates Channel ─────────────────────────
  useEffect(() => {
    const isStaff = roleRef.current !== 'customer'

    const channel = supabase
      .channel('rt:notifications:orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          ...(isStaff ? {} : { filter: `user_id=eq.${userId}` }),
        },
        (payload) => {
          const row = payload.new as {
            id?: string
            title?: string
            user_id?: string
            status?: string
            status_key?: string
            quote_amount_cents?: number | null
            price?: string | number | null
            created_at?: string
            updated_at?: string
          }
          if (!row?.id) return

          if (isStaff) {
            if (payload.eventType === 'INSERT') {
              const title = 'New request submitted'
              const description = `"${row.title || 'A request'}" submitted by a customer — review and set quote.`
              const href = `/admin-dashboard/orders/${row.id}`

              onLiveNotificationRef.current({
                id: `ord-new-${row.id}`,
                title,
                description,
                href,
                tone: 'warning',
                createdAt: row.created_at || new Date().toISOString(),
              })

              setToasts((prev) => [
                {
                  id: `ord-new-${row.id}`,
                  title,
                  description,
                  href,
                  icon: 'order' as const,
                  tone: 'warning' as const,
                },
                ...prev,
              ].slice(0, 4))
            } else if (payload.eventType === 'UPDATE') {
              const oldRow = payload.old as typeof row | undefined
              if (oldRow && oldRow.status !== row.status && (row.status === 'revision_requested' || row.status_key === 'revision_requested')) {
                const title = 'Revision requested'
                const description = `Customer requested a revision on "${row.title || 'a request'}".`
                const href = `/admin-dashboard/orders/${row.id}`

                onLiveNotificationRef.current({
                  id: `ord-rev-${row.id}-${Date.now()}`,
                  title,
                  description,
                  href,
                  tone: 'warning',
                  createdAt: new Date().toISOString(),
                })

                setToasts((prev) => [
                  {
                    id: `ord-rev-${row.id}`,
                    title,
                    description,
                    href,
                    icon: 'order' as const,
                    tone: 'warning' as const,
                  },
                  ...prev,
                ].slice(0, 4))
              }
            }
          } else {
            // Customer notifications
            if (payload.eventType === 'UPDATE') {
              const oldRow = payload.old as typeof row | undefined
              const hasQuoteNow = (typeof row.quote_amount_cents === 'number' && row.quote_amount_cents > 0) || (row.price != null && row.price !== '')
              const hadQuoteBefore = oldRow ? (typeof oldRow.quote_amount_cents === 'number' && oldRow.quote_amount_cents > 0) || (oldRow.price != null && oldRow.price !== '') : false

              if (hasQuoteNow && !hadQuoteBefore) {
                const title = 'Quote ready for review'
                const description = `A quote has been prepared for "${row.title || 'your request'}". Complete payment to proceed.`
                const href = `/dashboard/orders/${row.id}`

                onLiveNotificationRef.current({
                  id: `ord-quote-${row.id}`,
                  title,
                  description,
                  href,
                  tone: 'brand',
                  createdAt: new Date().toISOString(),
                })

                setToasts((prev) => [
                  {
                    id: `ord-quote-${row.id}`,
                    title,
                    description,
                    href,
                    icon: 'order' as const,
                    tone: 'brand' as const,
                  },
                  ...prev,
                ].slice(0, 4))
              } else if (oldRow && oldRow.status !== row.status) {
                const isDelivered = row.status === 'delivered' || row.status === 'completed' || row.status_key === 'delivered' || row.status_key === 'completed'
                const title = isDelivered ? 'Deliverables ready for download' : 'Request status updated'
                const description = isDelivered
                  ? `Your files for "${row.title || 'your request'}" have been uploaded and are ready for review.`
                  : `Your request "${row.title || 'your request'}" status is now "${(row.status_key || row.status || '').replaceAll('_', ' ')}".`
                const href = `/dashboard/orders/${row.id}`

                onLiveNotificationRef.current({
                  id: `ord-stat-${row.id}-${Date.now()}`,
                  title,
                  description,
                  href,
                  tone: isDelivered ? 'brand' : 'info',
                  createdAt: new Date().toISOString(),
                })

                setToasts((prev) => [
                  {
                    id: `ord-stat-${row.id}`,
                    title,
                    description,
                    href,
                    icon: 'order' as const,
                    tone: isDelivered ? ('brand' as const) : ('info' as const),
                  },
                  ...prev,
                ].slice(0, 4))
              }
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  // ── 4. Subscriptions Lifecycle Channel ───────────────────────────────────
  useEffect(() => {
    const isStaff = roleRef.current !== 'customer'

    const channel = supabase
      .channel('rt:notifications:invoices')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
          filter: isStaff ? `invoice_kind=eq.subscription` : `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string
            user_id?: string
            invoice_kind?: string
            status?: string
            created_at?: string
          }
          if (!row?.id || row.invoice_kind !== 'subscription') return

          if (isStaff) {
            if (payload.eventType === 'INSERT' || (payload.eventType === 'UPDATE' && row.status === 'pending_approval')) {
              const title = 'Subscription payment pending review'
              const description = 'A customer submitted a plan subscription payment. Check the subscriptions queue.'
              const href = '/admin-dashboard?tab=subscriptions'

              onLiveNotificationRef.current({
                id: `sub-${row.id}`,
                title,
                description,
                href,
                tone: 'warning',
                createdAt: row.created_at || new Date().toISOString(),
              })

              setToasts((prev) => [
                {
                  id: `sub-${row.id}`,
                  title,
                  description,
                  href,
                  icon: 'subscription' as const,
                  tone: 'warning' as const,
                },
                ...prev,
              ].slice(0, 4))
            }
          } else {
            if (payload.eventType === 'UPDATE' && (row.status === 'paid' || row.status === 'approved')) {
              const title = 'Subscription plan activated!'
              const description = 'Your subscription payment has been approved and your plan benefits are active.'
              const href = '/dashboard/subscription'

              onLiveNotificationRef.current({
                id: `sub-act-${row.id}`,
                title,
                description,
                href,
                tone: 'brand',
                createdAt: new Date().toISOString(),
              })

              setToasts((prev) => [
                {
                  id: `sub-act-${row.id}`,
                  title,
                  description,
                  href,
                  icon: 'subscription' as const,
                  tone: 'brand' as const,
                },
                ...prev,
              ].slice(0, 4))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  const getToastIcon = (icon?: LiveToast['icon']) => {
    switch (icon) {
      case 'payment':
        return <CreditCardIcon size={14} />
      case 'order':
        return <FileTextIcon size={14} />
      case 'subscription':
        return <SparklesIcon size={14} />
      case 'message':
      default:
        return <MessageSquareIcon size={14} />
    }
  }

  const getToastBadgeStyle = (tone?: LiveToast['tone']) => {
    switch (tone) {
      case 'warning':
        return { backgroundColor: 'rgba(245,185,66,0.15)', color: 'var(--warn-400)' }
      case 'error':
        return { backgroundColor: 'rgba(248,113,113,0.15)', color: 'var(--error, #F87171)' }
      case 'info':
        return { backgroundColor: 'rgba(96,165,250,0.15)', color: 'var(--info, #60A5FA)' }
      case 'brand':
      default:
        return { backgroundColor: 'var(--brand-900)', color: 'var(--brand-300)' }
    }
  }

  return (
    <>
      {/* Toast stack — bottom right, above all content */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[330px] sm:w-[360px] flex-col gap-2.5">
        {toasts.map((toast) => (
          <Link
            key={toast.id}
            href={toast.href}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-2xl transition-all hover:scale-[1.01] animate-fade-up"
            style={{
              borderColor: 'var(--hairline-strong)',
              backgroundColor: 'var(--surface-raised)',
            }}
          >
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
              style={{
                borderColor: 'var(--hairline)',
                ...getToastBadgeStyle(toast.tone),
              }}
              aria-hidden
            >
              {getToastIcon(toast.icon)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
                {toast.title}
              </span>
              <span className="mt-0.5 block line-clamp-2 text-[12px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                {toast.description}
              </span>
            </span>
            <button
              type="button"
              aria-label="Dismiss notification"
              className="pointer-events-auto shrink-0 rounded-md p-1 hover:bg-white/5 transition-colors"
              style={{ color: 'var(--ink-faint)' }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setToasts((prev) => prev.filter((t) => t.id !== toast.id))
              }}
            >
              <XIcon size={14} aria-hidden />
            </button>
          </Link>
        ))}
      </div>
    </>
  )
}
