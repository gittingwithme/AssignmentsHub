'use client'

import { useState } from 'react'
import { confirmPasswordReset } from '@/app/auth-actions'

export default function ResetPasswordFormClient({ error, message }: { error?: string; message?: string }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [clientErrors, setClientErrors] = useState<string[]>([])

  const handleSubmit = (e: React.FormEvent) => {
    const errors: string[] = []

    if (password.length < 12) {
      errors.push('Password must be at least 12 characters')
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter')
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter')
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number')
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character')
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
    <form action={confirmPasswordReset} onSubmit={handleSubmit} className="space-y-4">
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
            className="premium-input pr-10"
            placeholder="Enter your new password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-white"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? '👁' : '👁‍🗨'}
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
          className="premium-input"
          placeholder="Confirm your new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-zinc-400">
        <p className="font-medium text-zinc-300 mb-1">Password requirements:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li className={password.length >= 12 ? 'text-green-400' : ''}>At least 12 characters</li>
          <li className={/[A-Z]/.test(password) ? 'text-green-400' : ''}>One uppercase letter</li>
          <li className={/[a-z]/.test(password) ? 'text-green-400' : ''}>One lowercase letter</li>
          <li className={/[0-9]/.test(password) ? 'text-green-400' : ''}>One number</li>
          <li className={/[!@#$%^&*(),.?":{}|<>]/.test(password) ? 'text-green-400' : ''}>One special character</li>
        </ul>
      </div>

      <button type="submit" className="premium-button-primary mt-2 w-full">
        Update Password
      </button>
    </form>
  )
}