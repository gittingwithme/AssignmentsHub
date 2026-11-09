'use client'

import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { login } from '@/app/auth-actions'

export default function LoginFormClient({ error, message }: { error?: string; message?: string }) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <form action={login} className="space-y-4" suppressHydrationWarning>
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
          autoComplete="email"
          className="premium-input"
          placeholder="you@example.com"
          suppressHydrationWarning
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-zinc-200">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            className="premium-input pr-10"
            placeholder="Enter your password"
            suppressHydrationWarning
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-200 transition-colors focus:outline-none"
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

      <button type="submit" className="premium-button-primary mt-2 w-full">
        Log in
      </button>
    </form>
  )
}
