'use client'

import { useEffect, useState, useRef, useMemo, useActionState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { sendOrderMessage } from '@/app/message-actions'
import {
  SendIcon,
  ReplyIcon,
  XIcon,
} from 'lucide-react'

type OrderThreadMessage = {
  id: string
  sender_id: string
  body: string
  created_at?: string
  reply_to?: string | null
}

type SwipeState = {
  messageId: string | null
  startX: number
  startY: number
  moved: boolean
}

function stripMarkdown(text: string) {
  return text.replace(/[#*`>_~\-\[\]]/g, '').replace(/\s+/g, ' ').trim()
}

type ComposerState = { ok: boolean; error?: string } | null

async function submitMessage(
  _prev: ComposerState,
  formData: FormData
): Promise<ComposerState> {
  try {
    await sendOrderMessage(formData)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to send message.',
    }
  }
}

function formatTime(iso?: string) {
  if (!iso) return ''
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function OrderThread({
  orderId,
  currentUserId,
  messages: initialMessages,
  placeholder,
  composerPlaceholder,
  otherPartyLabel,
}: {
  orderId: string
  currentUserId: string
  messages: OrderThreadMessage[]
  placeholder: string
  composerPlaceholder: string
  otherPartyLabel: string
}) {
  // Live messages arrive via realtime; server-rendered messages re-fetch on
  // revalidation. Merge both (deduped, sorted) instead of syncing state.
  const [liveMessages, setLiveMessages] = useState<OrderThreadMessage[]>([])
  const [replyTo, setReplyTo] = useState<OrderThreadMessage | null>(null)
  const swipeRef = useRef<SwipeState>({ messageId: null, startX: 0, startY: 0, moved: false })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const endOfMessagesRef = useRef<HTMLDivElement>(null)
  const supabase = useMemo(() => createClient(), [])

  // ── Swipe-right-to-reply gestures ────────────────────────────────────────
  function handlePointerDown(message: OrderThreadMessage) {
    return (e: React.PointerEvent) => {
      swipeRef.current = {
        messageId: message.id,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const swipe = swipeRef.current
    if (!swipe.messageId) return

    const dx = e.clientX - swipe.startX
    const dy = e.clientY - swipe.startY
    // Horizontal intent only — vertical scrolls must not trigger a reply
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 12) return
    if (swipe.moved) return

    swipe.moved = true
    const parent = messages.find((m) => m.id === swipe.messageId)
    if (parent) {
      setReplyTo(parent)
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }

  function handlePointerUp() {
    swipeRef.current = { messageId: null, startX: 0, startY: 0, moved: false }
  }

  // Merge server-rendered + live messages (deduped, sorted) at render time;
  // the React Compiler memoizes this for us, so no manual useMemo is needed.
  const messages = (() => {
    const uniqueIds = new Set(initialMessages.map((m) => m.id))
    const combined = [
      ...initialMessages,
      ...liveMessages.filter((m) => !uniqueIds.has(m.id)),
    ]
    return [...combined].sort(
      (a, b) =>
        new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()
    )
  })()

  const [composerState, formAction, pending] = useActionState(submitMessage, null)

  // Scroll to bottom when messages update
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  // Clear composer after a successful send (textarea is uncontrolled)
  useEffect(() => {
    if (composerState?.ok) {
      const el = textareaRef.current
      if (el) el.value = ''
      textareaRef.current?.focus()
    }
  }, [composerState])

  useEffect(() => {
    const markRead = async () => {
      try {
        await fetch(`/api/orders/${orderId}/messages/read`, {
          method: 'POST',
        })
      } catch (error) {
        console.error('Failed to mark messages as read', error)
      }
    }
    markRead()

    // Subscribe to realtime messages
    const channel = supabase
      .channel(`realtime:messages:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const newMessage = payload.new as OrderThreadMessage
          setLiveMessages((prev) => {
            if (prev.find((m) => m.id === newMessage.id)) return prev
            return [...prev, newMessage]
          })
          markRead()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, supabase])



  return (
    <div className="mt-5">
      {/* ── Message pane ── */}
      <div className="flex max-h-[520px] min-h-[240px] flex-col overflow-y-auto rounded-2xl px-2 py-4" style={{ backgroundColor: 'var(--surface-sunken)' }}>
        {messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((message, index) => {
              const isOwn = message.sender_id === currentUserId
              const isAdminSender = isOwn
                ? otherPartyLabel !== 'Admin' // the viewer is the admin here
                : otherPartyLabel === 'Admin' // the other party is the admin
              const isClient = !isAdminSender
              const prev = messages[index - 1]
              const showHeader = !prev || prev.sender_id !== message.sender_id
              const parent = message.reply_to
                ? messages.find((m) => m.id === message.reply_to)
                : undefined
              return (
                <div
                  key={message.id}
                  className={`group flex w-full touch-pan-y select-text ${isClient ? 'justify-end' : 'justify-start'}`}
                  onPointerDown={handlePointerDown(message)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                >
                  <div className={`max-w-[85%] sm:max-w-[70%] ${showHeader ? 'mt-1' : 'mt-0.5'}`}>
                    {/* Sender label + time */}
                    {showHeader && (
                      <div
                        className={`mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium ${
                          isClient ? 'justify-end' : 'justify-start'
                        }`}
                        style={{ color: isClient ? '#93C5FD' : 'var(--brand-400)' }}
                      >
                        <span>{isOwn ? 'You' : otherPartyLabel}</span>
                        <span aria-hidden>·</span>
                        <span className="font-normal" style={{ color: 'var(--ink-faint)' }}>
                          {formatTime(message.created_at)}
                        </span>
                      </div>
                    )}
                    {(parent || message.reply_to) && (
                      <div
                        className={`mb-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] ${
                          isClient ? 'rounded-br-md' : 'rounded-bl-md'
                        }`}
                        style={
                          isClient
                            ? { backgroundColor: 'rgba(30,64,175,0.55)', borderLeft: '3px solid #93C5FD' }
                            : {
                                backgroundColor: 'rgba(200,27,28,0.08)',
                                borderLeft: '3px solid var(--brand-400)',
                              }
                        }
                      >
                        <ReplyIcon
                          size={12}
                          className="mt-0.5 shrink-0"
                          style={{ color: isClient ? '#BFDBFE' : 'var(--brand-400)' }}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span
                            className="block font-semibold"
                            style={{ color: isClient ? '#DBEAFE' : 'var(--brand-400)' }}
                          >
                            {parent
                              ? `Replying to ${parent.sender_id === currentUserId ? 'yourself' : otherPartyLabel}`
                              : 'Replied to a message'}
                          </span>
                          <span
                            className="mt-0.5 block line-clamp-2"
                            style={{ color: isClient ? '#BFDBFE' : 'var(--ink-muted)' }}
                          >
                            {parent ? stripMarkdown(parent.body) || '…' : 'Original message not loaded'}
                          </span>
                        </span>
                      </div>
                    )}
                    <div
                      className={`px-4 py-2.5 text-[14px] leading-relaxed shadow-sm ${
                        isClient
                          ? 'rounded-2xl rounded-br-md'
                          : 'rounded-2xl rounded-bl-md'
                      }`}
                      style={
                        isClient
                          ? { backgroundColor: '#1E40AF', color: '#FFFFFF' }
                          : { backgroundColor: 'var(--brand-500)', color: '#fff' }
                      }
                    >
                      <div
                        className={
                          isClient
                            ? '[&_a]:text-[#93C5FD] [&_a]:underline [&_strong]:font-bold [&_pre]:bg-black/30 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-[12px]'
                            : '[&_a]:text-[#06281C] [&_a]:underline [&_strong]:font-bold [&_pre]:bg-black/20 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-[12px]'
                        }
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.body}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {/* Reply affordance — visible on hover; swipe right also works */}
                    <button
                      type="button"
                      onClick={() => setReplyTo(message)}
                      title="Reply to this message"
                      aria-label={`Reply to message from ${isClient ? 'you' : otherPartyLabel}`}
                      className={`mt-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium opacity-0 transition-opacity group-hover:opacity-100 ${
                        isClient ? 'ml-auto' : ''
                      }`}
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      <ReplyIcon size={11} aria-hidden />
                      Reply
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
              {placeholder}
            </p>
          </div>
        )}
        <div ref={endOfMessagesRef} className="h-1" />
      </div>

      {/* ── Composer ── */}
      <form action={formAction} className="mt-3">
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="reply_to" value={replyTo?.id || ''} />

        {/* Reply banner — shown while a message is selected for reply */}
        {replyTo && (
          <div
            className="flex items-start gap-2 rounded-t-xl border border-b-0 px-3 py-2"
            style={{ borderColor: 'var(--hairline)', backgroundColor: 'rgba(200,27,28,0.07)' }}
          >
            <ReplyIcon size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--brand-400)' }} aria-hidden />
            <p className="min-w-0 flex-1 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
              <span className="font-semibold" style={{ color: 'var(--brand-400)' }}>
                Replying to {replyTo.sender_id === currentUserId ? 'yourself' : otherPartyLabel}
              </span>
              <span className="ml-1">“{stripMarkdown(replyTo.body) || '…'}”</span>
            </p>
            <button
              type="button"
              aria-label="Cancel reply"
              className="shrink-0 rounded p-0.5"
              style={{ color: 'var(--ink-faint)' }}
              onClick={() => setReplyTo(null)}
            >
              <XIcon size={13} aria-hidden />
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          name="body"
          rows={2}
          required
          defaultValue=""
          placeholder={composerPlaceholder}
          className="premium-textarea"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="min-h-[16px] text-[12px]" style={{ color: 'var(--error, #F87171)' }} role="alert">
            {composerState && !composerState.ok ? composerState.error : ''}
          </p>
          <button
            type="submit"
            disabled={pending}
            className="mp-btn mp-btn-primary mp-btn-md inline-flex items-center gap-2 disabled:opacity-50"
          >
            <SendIcon size={14} aria-hidden />
            {pending ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </form>
    </div>
  )
}
