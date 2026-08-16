'use client'

import { useEffect, useState } from 'react'

type PaymentStatusNoteProps = {
  state: 'pending_approval' | 'approved' | 'rejected'
  approvalId?: string | null
}

export default function PaymentStatusNote({
  state,
  approvalId,
}: PaymentStatusNoteProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (state !== 'approved' || !approvalId) return

    let cancelled = false

    const markSeen = async () => {
      try {
        await fetch(`/api/payment-approvals/${approvalId}/seen`, {
          method: 'POST',
        })
      } catch (error) {
        console.error('Failed to mark payment approval note as seen', error)
      }
    }

    const markDismissed = async () => {
      try {
        await fetch(`/api/payment-approvals/${approvalId}/dismiss`, {
          method: 'POST',
        })
      } catch (error) {
        console.error('Failed to mark payment approval note as dismissed', error)
      }
    }

    markSeen()

    const timer = setTimeout(async () => {
      if (cancelled) return
      await markDismissed()
      if (!cancelled) setVisible(false)
    }, 20000)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [state, approvalId])

  if (!visible) return null

  if (state === 'pending_approval') {
    return (
      <div className="alert alert-warn">
        <p className="font-medium">Waiting for payment approval</p>
        <p className="mt-1 opacity-90">
          Your payment has been submitted and is awaiting review.
        </p>
      </div>
    )
  }

  if (state === 'approved') {
    return (
      <div className="alert alert-success">
        <p className="font-medium">Payment approved</p>
        <p className="mt-1 opacity-90">
          Your payment has been confirmed successfully.
        </p>
      </div>
    )
  }

  return (
    <div className="alert alert-error">
      <p className="font-medium">Payment could not be confirmed</p>
      <p className="mt-1">Please check your payment reference or contact support.</p>
    </div>
  )
}
