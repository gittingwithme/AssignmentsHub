'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[error] unhandled route error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="mp-card w-full max-w-md p-8 text-center">
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-xl"
          style={{
            border: '1px solid rgba(248,113,113,0.3)',
            backgroundColor: 'rgba(248,113,113,0.1)',
          }}
          aria-hidden
        >
          ⚠️
        </span>
        <h1
          className="mt-4 text-lg font-semibold tracking-[-0.02em]"
          style={{ color: 'var(--ink)' }}
        >
          Something went wrong
        </h1>
        <p className="mt-2 text-[13px] leading-6" style={{ color: 'var(--ink-muted)' }}>
          An unexpected error occurred while loading this page. Your data is safe —
          try reloading, or head back to your dashboard.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="mp-btn mp-btn-primary mp-btn-md"
          >
            Try again
          </button>
          <Link href="/" className="mp-btn mp-btn-ghost mp-btn-md">
            Go home
          </Link>
        </div>
        {error?.digest ? (
          <p className="mt-6 font-mono text-[11px]" style={{ color: 'var(--ink-faint)' }}>
            Error ID: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  )
}
