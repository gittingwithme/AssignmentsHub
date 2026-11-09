'use client'

import { useState, useRef } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { signup } from '@/app/auth-actions'
import { validatePassword, getPasswordStrengthLabel, getPasswordStrengthColor } from '@/lib/password-validation'

export default function SignupFormClient({ error }: { error?: string }) {
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const passwordValidation = validatePassword(password, email, fullName)
  const showPasswordStrength = password.length > 0

  const handleSubmit = (e: React.FormEvent) => {
    if (!passwordValidation.valid) {
      e.preventDefault()
      return
    }
  }

  return (
    <form ref={formRef} action={signup} onSubmit={handleSubmit} className="space-y-4" suppressHydrationWarning>
      {error ? (
        <div className="alert alert-error mb-5">{error}</div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="full_name" className="text-sm font-medium text-zinc-200">
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="premium-input"
          placeholder="Your full name"
          suppressHydrationWarning
        />
      </div>

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="premium-input pr-10"
            placeholder="Create a password"
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
        {showPasswordStrength && (
          <div className="mt-1 text-xs">
            <span className={getPasswordStrengthColor(passwordValidation.strength)}>
              Strength: {getPasswordStrengthLabel(passwordValidation.strength)}
            </span>
          </div>
        )}
      </div>

      <p className="text-xs leading-6 text-zinc-400">
        Email sign-up requires a reachable email address. You will receive a confirmation link
        before your first sign-in.
      </p>

      <button type="submit" className="premium-button-primary mt-2 w-full">
        Create account
      </button>
    </form>
  )
}
