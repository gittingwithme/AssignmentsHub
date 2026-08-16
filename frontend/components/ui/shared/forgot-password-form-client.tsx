'use client'

import { useState, useRef } from 'react'
import { requestPasswordReset } from '@/app/auth-actions'
import TurnstileCaptcha from './turnstile-captcha'

export default function ForgotPasswordFormClient({ error, message }: { error?: string; message?: string }) {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaError, setCaptchaError] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    if (!captchaToken) {
      e.preventDefault()
      setCaptchaError(true)
      return
    }
    setCaptchaError(false)
  }

  return (
    <form ref={formRef} action={requestPasswordReset} onSubmit={handleSubmit} className="space-y-4">
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
        />
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

      <button type="submit" className="premium-button-primary mt-2 w-full">
        Send Reset Link
      </button>
    </form>
  )
}