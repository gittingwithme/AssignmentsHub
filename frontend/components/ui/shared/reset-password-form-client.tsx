'use client'

import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { confirmPasswordReset } from '@/app/auth-actions'

export default function ResetPasswordFormClient({ error, message }: { error?: string; message?: string }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [clientErrors, setClientErrors] = useState<string[]>([])

  const handleSubmit = (e: React.FormEvent) => {
    const errors: string[] = []

    if (password.length < 6) {
      errors.push('Password must be at least 6 characters')
    }
    if (password !== confirmPassword) {
      errors.push('Passwords do not match')
    }

    if (errors.length > 0) {
      e.preventDefault()
      setClientErrors(errors)
      return
    }

    setClientErrors([])
  }

  return (
    <form action={confirmPasswordReset} onSubmit={handleSubmit} className="space-y-4" suppressHydrationWarning>
      {message ? (
        <div className="alert alert-info mb-5">{message}</div>
      ) : null}

      {error ? (
        <div className="alert alert-error mb-5">{error}</div>
      ) : null}

      {clientErrors.length > 0 && (
        <div className="alert alert-error mb-5">
          <ul className="list-disc list-inside">
            {clientErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-zinc-200">
          New Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={6}
            className="premium-input pr-10"
            placeholder="Enter your new password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            suppressHydrationWarning
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-200 transition-colors focus:outline-none"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOffIcon size={16} aria-hidden />
            ) : (
              <EyeIcon size={16} aria-hidden />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="confirm_password" className="text-sm font-medium text-zinc-200">
          Confirm New Password
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type={showPassword ? 'text' : 'password'}
          required
          minLength={6}
          className="premium-input"
          placeholder="Confirm your new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          suppressHydrationWarning
        />
      </div>

      <button type="submit" className="premium-button-primary mt-2 w-full">
        Update Password
      </button>
    </form>
  )
}