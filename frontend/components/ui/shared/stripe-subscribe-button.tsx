'use client'

import { useState } from 'react'

/**
 * "Subscribe via Stripe" button for subscription plan purchases.
 * Calls the /api/stripe/checkout endpoint and redirects to Stripe Checkout.
 */
export default function StripeSubscribeButton({
  planId,
  planName,
  price,
  className,
}: {
  planId: number
  planName: string
  price?: string | null
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
          type: 'subscription',
          plan_id: planId,
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
      setError('Failed to initiate subscription. Please try again.')
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
        className="premium-button w-full flex items-center justify-center gap-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <rect x="1" y="4" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1 10h22" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {loading
          ? 'Redirecting…'
          : price
            ? `Subscribe ${price} via Stripe`
            : `Subscribe via Stripe`}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      ) : null}
    </div>
  )
}
