'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { CreditCard, Layers } from 'lucide-react'

type RequestMode = 'subscription' | 'one_time'

type RequestModeSelectorProps = {
  value: RequestMode
  onChange: (mode: RequestMode) => void
  hasActiveSubscription: boolean
  activePlanName?: string | null
}

export default function RequestModeSelector({
  value,
  onChange,
  hasActiveSubscription,
  activePlanName,
}: RequestModeSelectorProps) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-zinc-200">Request Mode *</p>
        <p className="mt-1 text-xs text-zinc-400">
          Choose how this support request should be billed and processed.
        </p>
      </div>

      <input type="hidden" name="submission_mode_choice" value={value} />

      <div className="grid gap-4 md:grid-cols-2">
        <motion.button
          type="button"
          disabled={!hasActiveSubscription}
          onClick={() => hasActiveSubscription && onChange('subscription')}
          whileHover={hasActiveSubscription ? { y: -4, scale: 1.01 } : undefined}
          whileTap={hasActiveSubscription ? { scale: 0.99 } : undefined}
          className={`relative overflow-hidden rounded-[24px] p-5 text-left transition border ${
            value === 'subscription'
              ? 'border-[var(--brand-500)] bg-[var(--brand-900)]'
              : hasActiveSubscription
                ? 'border-[var(--hairline)] bg-[var(--surface)] hover:bg-[var(--surface-raised)]'
                : 'border-[var(--hairline)] bg-[var(--surface)] opacity-60'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] border border-[var(--hairline)]">
              <Layers className="h-5 w-5" style={{ color: 'var(--brand-400)' }} />
            </div>
            {value === 'subscription' ? (
              <span className="mp-badge mp-badge-brand">Selected</span>
            ) : null}
          </div>

          <h3 className="mt-4 text-lg font-semibold" style={{ color: 'var(--ink)' }}>Use Active Subscription</h3>
          <p className="mt-2 text-[13px] leading-5" style={{ color: 'var(--ink-muted)' }}>
            {hasActiveSubscription
              ? `Bill through ${activePlanName || 'your active plan'} using subscription credits.`
              : 'Requires an active weekly or monthly plan.'}
          </p>

          {!hasActiveSubscription ? (
            <Link
              href="/dashboard/subscription"
              onClick={(e) => e.stopPropagation()}
              className="mp-btn mp-btn-secondary mp-btn-sm mt-4"
            >
              View subscription plans
            </Link>
          ) : null}
        </motion.button>

        <motion.button
          type="button"
          onClick={() => onChange('one_time')}
          whileHover={{ y: -4, scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={`relative overflow-hidden rounded-[24px] p-5 text-left transition border ${
            value === 'one_time'
              ? 'border-[var(--ink)] bg-[var(--surface-raised)]'
              : 'border-[var(--hairline)] bg-[var(--surface)] hover:bg-[var(--surface-raised)]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] border border-[var(--hairline)]">
              <CreditCard className="h-5 w-5" style={{ color: 'var(--ink)' }} />
            </div>
            {value === 'one_time' ? (
              <span className="mp-badge mp-badge-neutral">Selected</span>
            ) : null}
          </div>

          <h3 className="mt-4 text-lg font-semibold" style={{ color: 'var(--ink)' }}>One-Time Work</h3>
          <p className="mt-2 text-[13px] leading-5" style={{ color: 'var(--ink-muted)' }}>
            Submit a single request with manual bank-transfer billing and admin quote review.
          </p>
        </motion.button>
      </div>
    </div>
  )
}
