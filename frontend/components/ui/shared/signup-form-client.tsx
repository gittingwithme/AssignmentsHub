'use client'

import { useState, useRef } from 'react'
import { signup } from '@/app/auth-actions'
import TurnstileCaptcha from './turnstile-captcha'
import { validatePassword, getPasswordStrengthLabel, getPasswordStrengthColor } from '@/lib/password-validation'

export default function SignupFormClient({ error }: { error?: string }) {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaError, setCaptchaError] = useState(false)
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  const passwordValidation = validatePassword(password, email, fullName)
  const showPasswordStrength = password.length > 0

  const handleSubmit = (e: React.FormEvent) => {
    if (!captchaToken) {
      e.preventDefault()
      setCaptchaError(true)
      return
    }
    if (!passwordValidation.valid) {
      e.preventDefault()
      return
    }
    setCaptchaError(false)
  }

  return (
    <form ref={formRef} action={signup} onSubmit={handleSubmit} className="space-y-4">
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
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="premium-input"
          placeholder="Your full name"
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="premium-input"
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-zinc-200">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="premium-input"
          placeholder="Create a secure password"
        />
        {showPasswordStrength && (
          <div className="mt-1 text-xs">
            <span className={getPasswordStrengthColor(passwordValidation.strength)}>
              {getPasswordStrengthLabel(passwordValidation.strength)}
            </span>
            {passwordValidation.errors.length > 0 && (
              <ul className="mt-1 text-red-400">
                {passwordValidation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <TurnstileCaptcha
          onVerify={(token) => {
            setCaptchaToken(token)
            setCaptchaError(false)
          }}
          onExpire={() => setCaptchaToken(null)}
          onError={() => setCaptchaError(true)}
        />
      </div>

      {captchaError && (
        <p className="text-center text-sm text-red-400">Please complete the captcha verification</p>
      )}

      <input type="hidden" name="cf-turnstile-response" value={captchaToken || ''} />

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
