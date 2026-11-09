'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Secure lock icon.
 */
function LockIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/**
 * Payment status types that affect how the button renders.
 */
type PaymentStatus =
  | 'awaiting_payment'   // Default — ready to pay
  | 'processing'         // Session created, user redirected to bank
  | 'approved'           // Payment succeeded
  | 'failed'             // Payment failed — can retry
  | 'cancelled'          // User cancelled — can retry
  | 'expired'            // Session expired — can retry

/**
 * "Pay" button for one-time order payments.
 * Calls the /api/stripe/checkout endpoint and redirects to Stripe Checkout
 * with supported payment methods.
 */
export default function StripePayButton({
  orderId,
  invoiceId,
  amount,
  paymentStatus,
  lastError,
  className,
}: {
  orderId: string
  invoiceId?: string
  amount?: string | null
  paymentStatus?: PaymentStatus | string | null
  lastError?: string | null
  className?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  // Determine the effective status for rendering
  const status: PaymentStatus = (() => {
    if (!paymentStatus) return 'awaiting_payment'
    const validStatuses: PaymentStatus[] = ['awaiting_payment', 'processing', 'approved', 'failed', 'cancelled', 'expired']
    return validStatuses.includes(paymentStatus as PaymentStatus)
      ? (paymentStatus as PaymentStatus)
      : 'awaiting_payment'
  })()

  const canPay = ['awaiting_payment', 'failed', 'cancelled', 'expired'].includes(status)
  const isRetry = ['failed', 'cancelled', 'expired'].includes(status)

  /**
   * Verify payment status with Stripe (fallback for delayed webhooks).
   * Used when status is 'processing' and user is waiting.
   */
  const verifyPayment = useCallback(async () => {
    setVerifying(true)
    try {
      const res = await fetch(`/api/stripe/verify-payment?order_id=${orderId}`)
      const data = await res.json()
      if (data.synced && data.payment_status === 'approved') {
        // Payment confirmed! Reload to show updated state
        window.location.reload()
      } else if (data.synced && data.payment_status === 'cancelled') {
        window.location.reload()
      }
    } catch {
      // Silent — this is a background check
    } finally {
      setVerifying(false)
    }
  }, [orderId])

  // Auto-verify every 10 seconds when status is 'processing'
  useEffect(() => {
    if (status !== 'processing') return

    const interval = setInterval(verifyPayment, 10_000)
    // Also verify immediately
    verifyPayment()

    return () => clearInterval(interval)
  }, [status, verifyPayment])

  async function handleClick() {
    if (!canPay) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'one_time',
          order_id: orderId,
          invoice_id: invoiceId || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 429) {
          setError('Too many payment attempts. Please wait a few minutes before trying again.')
        } else {
          setError(data.error || 'Something went wrong.')
        }
        return
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setError('Failed to initiate payment. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Already paid — show success state
  if (status === 'approved') {
    return (
      <div className={className}>
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
          style={{
            backgroundColor: 'rgba(52, 199, 89, 0.1)',
            color: 'rgb(52, 199, 89)',
            border: '1px solid rgba(52, 199, 89, 0.2)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17L4 12" />
          </svg>
          Payment confirmed
        </div>
      </div>
    )
  }

  // Processing — show waiting state with verify button
  if (status === 'processing') {
    return (
      <div className={className}>
        <div
          className="flex flex-col gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: 'rgba(255, 179, 0, 0.08)',
            border: '1px solid rgba(255, 179, 0, 0.2)',
          }}
        >
          <div className="flex items-center gap-2 font-medium" style={{ color: 'rgb(255, 179, 0)' }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="animate-spin"
              aria-hidden="true"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Payment in progress…
          </div>
          <p style={{ color: 'var(--ink-faint)' }}>
            Your payment is being processed. This usually completes within a few moments.
          </p>
          <button
            type="button"
            onClick={verifyPayment}
            disabled={verifying}
            className="mt-1 text-xs underline"
            style={{ color: 'var(--ink-faint)', opacity: verifying ? 0.5 : 1 }}
          >
            {verifying ? 'Checking…' : 'Check payment status'}
          </button>
        </div>
      </div>
    )
  }

  // Payable state (initial, retry after failure/cancel/expire)
  return (
    <div className={className}>
      {/* Show previous error if retrying */}
      {isRetry && (lastError || status === 'cancelled' || status === 'expired') ? (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: status === 'failed'
              ? 'rgba(255, 69, 58, 0.08)'
              : 'rgba(255, 179, 0, 0.08)',
            border: `1px solid ${
              status === 'failed'
                ? 'rgba(255, 69, 58, 0.2)'
                : 'rgba(255, 179, 0, 0.2)'
            }`,
            color: status === 'failed'
              ? 'rgb(255, 100, 90)'
              : 'rgb(255, 179, 0)',
          }}
        >
          {status === 'failed' && (lastError || 'Previous payment attempt failed.')}
          {status === 'cancelled' && 'Your previous payment was cancelled. You can try again.'}
          {status === 'expired' && 'Your payment session expired. Please try again.'}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="premium-button-primary w-full md:w-auto flex items-center justify-center gap-2"
      >
        <LockIcon size={18} />
        {loading
          ? 'Redirecting…'
          : isRetry
            ? amount
              ? `Retry Payment (${amount})`
              : 'Retry Payment'
            : amount
              ? `Pay (${amount})`
              : 'Pay'}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      ) : null}
    </div>
  )
}
