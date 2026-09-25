'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { XIcon, MessageSquareIcon } from 'lucide-react'
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

  // Keep the latest props available to the subscription without restarting it
  useEffect(() => {
    orderTitlesRef.current = orderContext
    roleRef.current = role
    onLiveNotificationRef.current = onLiveNotification
  }, [orderContext, role, onLiveNotification])

  // Auto-dismiss each toast after a few seconds
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((toast) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
      }, 6000)
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts])

  useEffect(() => {
    const isStaff = roleRef.current !== 'customer'
    const emit = onLiveNotificationRef.current


    // Resolve a sender's display name (cached per message)
    async function resolveSender(senderId: string): Promise<string> {
      const { data } = await supabase.from('users').select('full_name').eq('id', senderId).maybeSingle()
      return data?.full_name || (senderId === userId ? 'You' : 'A user')
    }

    // Scope the channel: staff see every conversation, customers only their own
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
          const row = payload.new as { id?: string; order_id?: string; sender_id?: string; body?: string; created_at?: string }
          if (!row?.id || !row.order_id || !row.sender_id) return
          if (row.sender_id === userId) return // own messages don't notify

          const orderTitle = orderTitlesRef.current[row.order_id] || 'a request'
          const preview = (row.body || '').replace(/[#*`>_~-]/g, '').trim().slice(0, 60)
          const sender = await resolveSender(row.sender_id)
          const isIncoming = isStaff ? row.sender_id !== undefined : true

          const title = isIncoming
            ? isStaff
              ? `New message from a customer`
              : `You have a message from ${sender}`
            : `New message from ${sender}`

          emit({
            id: `msg-${row.id}`,
            title,
            description: preview
              ? `${orderTitle}: “${preview}${preview.length >= 60 ? '…' : ''}”`
              : `New message on ${orderTitle}`,
            href: isStaff
              ? `/admin-dashboard/orders/${row.order_id}`
              : `/dashboard/orders/${row.order_id}`,
            tone: 'brand',
          })

          setToasts((prev) => [
            {
              id: row.id as string,
              title,
              description: `New message on ${orderTitle}`,
              href: isStaff
                ? `/admin-dashboard/orders/${row.order_id}`
                : `/dashboard/orders/${row.order_id}`,
            },
            ...prev,
          ].slice(0, 3))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // The subscription reads live values through refs, so it never needs
    // to restart for new props — only for a different user/session.
  }, [supabase, userId])

  // ── Payment lifecycle notifications ──────────────────────────────────────
  // Customer: payment approved / needs attention. Staff: new payment awaiting review.
  useEffect(() => {
    const isStaff = roleRef.current !== 'customer'
    const emit = onLiveNotificationRef.current

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
          const row = payload.new as { id?: string; user_id?: string; approved_at?: string | null; rejected_at?: string | null }
          if (!row?.id) return

          if (isStaff) {
            // A new payment was submitted for review (INSERT); skip updates
            if (payload.eventType !== 'INSERT') return
            emit({
              id: `pay-${row.id}`,
              title: 'New payment awaiting review',
              description: 'A customer submitted a bank-transfer payment. Review it in the approval queue.',
              href: '/admin-dashboard?tab=approvals',
              tone: 'warning',
            })
          } else {
            // Customer: only react to approvals / rejections (not their own submission)
            if (payload.eventType === 'INSERT') return
            const approved = !!row.approved_at
            const rejected = !!row.rejected_at
            if (!approved && !rejected) return
            emit({
              id: `pay-${row.id}-${approved ? 'a' : 'r'}`,
              title: approved ? 'Payment approved' : 'Payment needs attention',
              description: approved
                ? 'Your payment was approved — your request is now in progress.'
                : 'Your payment could not be approved. Check the payment details and try again.',
              href: '/dashboard?tab=requests',
              tone: approved ? 'brand' : 'error',
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  return (
    <>
      {/* Toast stack — bottom right, above everything */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[320px] flex-col gap-2">
        {toasts.map((toast) => (
          <Link
            key={toast.id}
            href={toast.href}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border p-3 shadow-2xl transition-transform"
            style={{
              borderColor: 'rgba(200,27,28,0.35)',
              backgroundColor: 'var(--surface-raised)',
            }}
          >
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--brand-900)', color: 'var(--brand-300)' }}
              aria-hidden
            >
              <MessageSquareIcon size={13} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                {toast.title}
              </span>
              <span className="mt-0.5 block truncate text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                {toast.description}
              </span>
            </span>
            <button
              type="button"
              aria-label="Dismiss notification"
              className="pointer-events-auto shrink-0 rounded p-0.5"
              style={{ color: 'var(--ink-faint)' }}
              onClick={(e) => {
                e.preventDefault()
                setToasts((prev) => prev.filter((t) => t.id !== toast.id))
              }}
            >
              <XIcon size={13} aria-hidden />
            </button>
          </Link>
        ))}
      </div>
    </>
  )
}
