'use client'

import { useState, useRef } from 'react'
import { verifyLoginMfa } from '@/app/mfa-verify-actions'
import { EyeIcon, EyeOffIcon, Loader2Icon, KeyIcon, AlertCircleIcon } from 'lucide-react'

export default function MfaChallengeForm({
  factorId,
  challengeId,
  error,
}: {
  factorId: string
  challengeId: string
  error?: string
}) {
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [useBackup, setUseBackup] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const formData = new FormData()
    formData.append('factorId', factorId)
    formData.append('challengeId', challengeId)
    formData.append('code', code)
    formData.append('useBackup', String(useBackup))
    await verifyLoginMfa(formData)
    setSubmitting(false)
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <div className="alert alert-error mb-2 flex items-center gap-2">
          <AlertCircleIcon size={14} aria-hidden />
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label
          htmlFor={useBackup ? 'backup-code' : 'totp-code'}
          className="text-sm font-medium text-zinc-200"
        >
          {useBackup ? 'Backup Code' : 'Authenticator Code'}
        </label>
        <div className="relative">
          <input
            id={useBackup ? 'backup-code' : 'totp-code'}
            name="code"
            type={showCode && !useBackup ? 'text' : 'text'}
            inputMode={useBackup ? 'text' : 'numeric'}
            pattern={useBackup ? '[A-Z0-9]*' : '[0-9]*'}
            maxLength={useBackup ? 8 : 6}
            required
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={`premium-input font-mono text-2xl tracking-widest text-center pr-12 ${useBackup ? 'text-base' : ''
              }`}
            style={{
              letterSpacing: useBackup ? '0.2em' : '0.5em',
            }}
            placeholder={useBackup ? 'ABCD1234' : '000000'}
            disabled={submitting}
          />
          {!useBackup && (
            <button
              type="button"
              onClick={() => setShowCode(!showCode)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              aria-label={showCode ? 'Hide code' : 'Show code'}
            >
              {showCode ? <EyeOffIcon size={18} aria-hidden /> : <EyeIcon size={18} aria-hidden />}
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500 text-center">
          {useBackup
            ? 'Enter one of your 8-character backup codes'
            : 'Enter the 6-digit code from your authenticator app'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useBackup}
            onChange={(e) => setUseBackup(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-600 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm text-zinc-300">Use backup code instead</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting || !code}
        className="premium-button-primary mt-2 w-full disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2Icon size={14} className="mr-2 animate-spin" aria-hidden />
            Verifying…
          </>
        ) : (
          <>
            <KeyIcon size={14} className="mr-2" aria-hidden />
            Verify & Sign In
          </>
        )}
      </button>

      <p className="text-xs text-center text-zinc-500">
        Lost access to your authenticator app?{' '}
        <button
          type="button"
          onClick={() => setUseBackup(true)}
          className="text-white underline-offset-4 hover:underline"
        >
          Use a backup code
        </button>
      </p>
    </form>
  )
}