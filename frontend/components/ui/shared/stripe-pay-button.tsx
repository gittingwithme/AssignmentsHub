'use client'

import { useState } from 'react'

/**
 * "Pay with Stripe" button for one-time order payments.
 * Calls the /api/stripe/checkout endpoint and redirects to Stripe Checkout.
 */
export default function StripePayButton({
  orderId,
  invoiceId,
  amount,
  className,
}: {
  orderId: string
  invoiceId?: string
  amount?: string | null
  className?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
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
        setError(data.error || 'Something went wrong.')
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

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="premium-button-primary w-full md:w-auto flex items-center justify-center gap-2"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <rect x="1" y="4" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1 10h22" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {loading
          ? 'Redirecting to Stripe…'
          : amount
            ? `Pay ${amount} with Stripe`
            : 'Pay with Stripe'}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      ) : null}
    </div>
  )
}
