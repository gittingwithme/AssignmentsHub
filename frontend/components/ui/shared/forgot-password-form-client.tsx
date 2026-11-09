'use client'

import { requestPasswordReset } from '@/app/auth-actions'

export default function ForgotPasswordFormClient({ error, message }: { error?: string; message?: string }) {
  return (
    <form action={requestPasswordReset} className="space-y-4" suppressHydrationWarning>
      {message ? (
        <div className="alert alert-info mb-5">{message}</div>
      ) : null}

      {error ? (
        <div className="alert alert-error mb-5">{error}</div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-zinc-200">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="premium-input"
          placeholder="you@example.com"
          autoComplete="email"
          suppressHydrationWarning
        />
      </div>

      <button type="submit" className="premium-button-primary mt-2 w-full">
        Send Reset Link
      </button>
    </form>
  )
}