'use client'

import { useState, useActionState, useEffect } from 'react'
import { enrollMfa, verifyMfa, unenrollMfa, generateBackupCodes } from '@/app/mfa-actions'
import {
  SmartphoneIcon,
  QrCodeIcon,
  KeyIcon,
  CopyIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  Loader2Icon,
  XIcon,
  EyeIcon,
  EyeOffIcon,
  Trash2Icon,
  RotateCcwIcon,
  MonitorIcon,
  LogOutIcon,
} from 'lucide-react'

type EnrollState = {
  step: 'generate' | 'verify'
  qrCode?: string
  secret?: string
  uri?: string
  error?: string
  challengeId?: string
  factorId?: string
}

type VerifyState = {
  ok: boolean
  error?: string
} | null

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

export default function MfaEnrollment({ initialStep = 'generate' }: { initialStep?: 'generate' | 'verify' }) {
  const [enrollData, setEnrollData] = useState<EnrollState>({ step: initialStep })
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyMfaAction, null)
  const [unenrollState, unenrollAction, unenrollPending] = useActionState(unenrollMfaAction, null)

  async function verifyMfaAction(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
    const code = String(formData.get('code') || '').trim()
    const challengeId = String(formData.get('challengeId') || '')
    const factorId = String(formData.get('factorId') || '')

    if (!code || code.length !== 6) {
      return { ok: false, error: 'Please enter a 6-digit code' }
    }

    if (!challengeId) {
      return { ok: false, error: 'Invalid challenge' }
    }

    if (!factorId) {
      return { ok: false, error: 'Invalid factor' }
    }

    try {
      const result = await verifyMfa(factorId, code, challengeId)
      if (result.error) {
        return { ok: false, error: result.error }
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: 'Failed to verify code' }
    }
  }

  async function unenrollMfaAction(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
    const factorId = String(formData.get('factorId') || '')

    if (!factorId) {
      return { ok: false, error: 'Invalid factor' }
    }

    try {
      const result = await unenrollMfa(factorId)
      if (result.error) {
        return { ok: false, error: result.error }
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: 'Failed to disable 2FA' }
    }
  }

  async function handleEnroll() {
    setEnrollData({ step: 'generate' })
    try {
      const result = await enrollMfa()
      if (result.error) {
        setEnrollData({ step: 'generate', error: result.error })
        return
      }

      if (!result.factorId) {
        setEnrollData({ step: 'generate', error: 'Failed to get factor ID from enrollment' })
        return
      }

      // Create a challenge for verification using the factor ID
      const challengeResult = await fetch('/api/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factorId: result.factorId }),
      })

      const challengeData = await challengeResult.json()

      if (challengeData.error) {
        setEnrollData({ step: 'generate', error: challengeData.error })
        return
      }

      setEnrollData({
        step: 'verify',
        qrCode: result.qrCode,
        secret: result.secret,
        uri: result.uri,
        challengeId: challengeData.challengeId,
        factorId: result.factorId,
      })
    } catch (error) {
      setEnrollData({ step: 'generate', error: 'Failed to generate QR code' })
    }
  }

  async function handleVerify(formData: FormData) {
    const code = String(formData.get('code') || '').trim()
    if (!code || code.length !== 6) {
      return { ok: false, error: 'Please enter a 6-digit code' }
    }

    // For verification, we need the factor ID
    // The challenge needs to be created first with the factor ID
    // Let's adjust - we need to get the factor ID after enrollment
    return { ok: false, error: 'Verification requires factor ID. Please refresh and try again.' }
  }

  // Render based on step
  if (enrollData.step === 'generate' && !enrollData.qrCode) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleEnroll}
          className="premium-button-primary w-full md:w-auto"
          disabled={enrollData.error !== undefined}
        >
          <SmartphoneIcon size={14} className="mr-2" aria-hidden />
          Generate QR Code & Setup Key
        </button>
        {enrollData.error && (
          <p className="text-sm text-red-400">{enrollData.error}</p>
        )}
      </div>
    )
  }

  if (enrollData.step === 'verify' && enrollData.qrCode) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(200,27,28,0.2)', color: 'var(--brand-400)' }}>
              <CheckCircleIcon size={20} aria-hidden />
            </div>
            <div>
              <p className="font-medium text-white">QR Code Generated</p>
              <p className="text-sm text-zinc-400">Scan with your authenticator app, then enter the 6-digit code below</p>
            </div>
          </div>
        </div>

        {/* QR Code Display */}
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-4">
            {enrollData.qrCode && (
              <div className="rounded-xl bg-white p-4">
                <img
                  src={`data:image/png;base64,${enrollData.qrCode}`}
                  alt="2FA QR Code"
                  className="w-64 h-64"
                />
              </div>
            )}

            <div className="w-full max-w-md">
              <p className="text-sm text-zinc-400 text-center mb-2">Or enter this setup key manually:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={enrollData.secret || ''}
                  className="flex-1 premium-input font-mono text-center text-lg tracking-widest"
                  style={{ letterSpacing: '0.3em' }}
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(enrollData.secret || '')}
                  className="premium-button-secondary"
                  title="Copy to clipboard"
                >
                  <CopyIcon size={16} aria-hidden />
                </button>
              </div>
            </div>
          </div>

          {/* Verification Form */}
          <form action={verifyAction} className="space-y-4">
            <input type="hidden" name="challengeId" value={enrollData.challengeId || ''} />
            <input type="hidden" name="factorId" value={enrollData.factorId || ''} />
            <div>
              <label htmlFor="mfa-code" className="block text-sm font-medium text-zinc-300 mb-2">
                Enter 6-digit code from authenticator app
              </label>
              <input
                id="mfa-code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoComplete="one-time-code"
                className="premium-input font-mono text-2xl tracking-widest text-center"
                style={{ letterSpacing: '0.5em' }}
                placeholder="000000"
              />
            </div>
            {verifyState && !verifyState.ok && (
              <p className="text-sm text-red-400">{verifyState.error}</p>
            )}
            <button
              type="submit"
              disabled={verifyPending}
              className="premium-button-primary w-full md:w-auto"
            >
              {verifyPending ? (
                <>
                  <Loader2Icon size={14} className="mr-2 animate-spin" aria-hidden />
                  Verifying…
                </>
              ) : (
                <>
                  <CheckCircleIcon size={14} className="mr-2" aria-hidden />
                  Verify & Enable 2FA
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return null
}

// Separate component for displaying enabled MFA with disable option
export function MfaEnabledDisplay({ factorId, friendlyName }: { factorId: string; friendlyName: string }) {
  const [unenrollState, unenrollAction, unenrollPending] = useActionState(unenrollMfaAction, null)

  async function unenrollMfaAction(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
    const fid = String(formData.get('factorId') || '')
    try {
      const result = await unenrollMfa(fid)
      if (result.error) return { ok: false, error: result.error }
      return { ok: true }
    } catch {
      return { ok: false, error: 'Failed to disable 2FA' }
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(200,27,28,0.2)', color: 'var(--brand-400)' }}>
            <CheckCircleIcon size={20} aria-hidden />
          </div>
          <div>
            <p className="font-medium text-white">2FA is enabled</p>
            <p className="text-sm text-zinc-400">Authenticator: {friendlyName}</p>
          </div>
        </div>
      </div>

      <form action={unenrollAction} className="mt-4">
        <input type="hidden" name="factorId" value={factorId} />
        <button
          type="submit"
          disabled={unenrollPending}
          className="premium-button-secondary w-full md:w-auto"
        >
          {unenrollPending ? (
            <>
              <Loader2Icon size={14} className="mr-2 animate-spin" aria-hidden />
              Disabling…
            </>
          ) : (
            <>
              <Trash2Icon size={14} className="mr-2" aria-hidden />
              Disable 2FA
            </>
          )}
        </button>
        {unenrollState && !unenrollState.ok && (
          <p className="mt-2 text-sm text-red-400">{unenrollState.error}</p>
        )}
      </form>

      <p className="mt-3 text-xs text-zinc-500">
        Disabling 2FA will remove the extra layer of security from your account.
      </p>
    </div>
  )
}

// Backup codes manager: plaintext codes are only shown at generation time and
// are never re-fetched from the server (only hashes are stored).
export function BackupCodesManager() {
  const [codes, setCodes] = useState<string[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const result = await generateBackupCodes()
      if (result.error) {
        setError(result.error)
        return
      }
      setCodes(result.codes || [])
    } catch {
      setError('Failed to generate backup codes')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating}
        className="premium-button-secondary w-full md:w-auto"
      >
        {generating ? (
          <>
            <Loader2Icon size={14} className="mr-2 animate-spin" aria-hidden />
            Generating…
          </>
        ) : (
          <>
            <RotateCcwIcon size={14} className="mr-2" aria-hidden />
            {codes ? 'Generate New Codes' : 'Generate Backup Codes'}
          </>
        )}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {codes ? (
        <>
          <p className="text-sm text-amber-400">
            These codes are only shown once. Store them securely — generating a new set invalidates
            the previous one.
          </p>
          <BackupCodesDisplay codes={codes} />
        </>
      ) : (
        <p className="text-sm text-zinc-400">
          Backup codes are never stored in plaintext and are only shown once at generation. Generate
          a set now to use if you lose access to your authenticator app.
        </p>
      )}
    </div>
  )
}

// Backup codes display component
export function BackupCodesDisplay({ codes }: { codes: string[] }) {
  const [showCodes, setShowCodes] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  function copyCode(code: string, index: number) {
    navigator.clipboard.writeText(code)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  function copyAll() {
    navigator.clipboard.writeText(codes.join('\n'))
    setCopiedIndex(-1)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowCodes(!showCodes)}
          className="premium-button-secondary"
        >
          {showCodes ? <EyeOffIcon size={14} className="mr-2" aria-hidden /> : <EyeIcon size={14} className="mr-2" aria-hidden />}
          {showCodes ? 'Hide codes' : 'Show codes'}
        </button>
        <button
          type="button"
          onClick={copyAll}
          className="premium-button-secondary"
          disabled={!showCodes}
        >
          <CopyIcon size={14} className="mr-2" aria-hidden />
          Copy all
        </button>
      </div>

      {showCodes && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-zinc-400 mb-3">
            Each code can be used once. Store them securely.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {codes.map((code, index) => (
              <div key={index} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <code className="font-mono text-lg tracking-widest text-white" style={{ letterSpacing: '0.2em' }}>
                  {code}
                </code>
                <button
                  type="button"
                  onClick={() => copyCode(code, index)}
                  className="text-zinc-400 hover:text-white transition-colors"
                  disabled={copiedIndex === index}
                >
                  {copiedIndex === index ? (
                    <CheckCircleIcon size={16} className="text-green-400" aria-hidden />
                  ) : (
                    <CopyIcon size={16} aria-hidden />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Active Sessions View Component
export function ActiveSessionsView() {
  const [sessions, setSessions] = useState<Array<{
    id: string
    device: string
    browser: string
    ip: string
    lastActive: string
    isCurrent: boolean
  }>>([])
  const [loading, setLoading] = useState(true)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSessions() {
      try {
        const response = await fetch('/api/auth/sessions')
        if (response.ok) {
          const data = await response.json()
          setSessions(data.sessions || [])
        }
      } catch (error) {
        console.error('Failed to fetch sessions:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchSessions()
  }, [])

  async function revokeSession(sessionId: string) {
    setRevokingId(sessionId)
    try {
      const response = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (response.ok) {
        setSessions(sessions.filter(s => s.id !== sessionId))
      }
    } catch (error) {
      console.error('Failed to revoke session:', error)
    } finally {
      setRevokingId(null)
    }
  }

  async function revokeAllOtherSessions() {
    const otherSessions = sessions.filter(s => !s.isCurrent)
    for (const session of otherSessions) {
      try {
        await fetch('/api/auth/sessions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id }),
        })
      } catch (error) {
        console.error('Failed to revoke session:', error)
      }
    }
    setSessions(sessions.filter(s => s.isCurrent))
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-white/5 rounded-xl" />
          <div className="h-16 bg-white/5 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sessions.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="text-zinc-400">No active sessions found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--brand-500)', color: '#fff' }}>
                  <MonitorIcon size={18} aria-hidden />
                </div>
                <div>
                  <p className="font-medium text-white">
                    {session.device} {session.isCurrent && (
                      <span className="ml-2 rounded px-1.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--brand-500)', color: '#fff' }}>
                        Current
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-zinc-400">
                    {session.browser} • {session.ip} • Last active: {new Date(session.lastActive).toLocaleString()}
                  </p>
                </div>
              </div>
              {!session.isCurrent && (
                <button
                  type="button"
                  onClick={() => revokeSession(session.id)}
                  disabled={revokingId === session.id}
                  className="premium-button-secondary text-sm"
                >
                  {revokingId === session.id ? (
                    <>
                      <Loader2Icon size={12} className="mr-1 animate-spin" aria-hidden />
                      Revoking…
                    </>
                  ) : (
                    <>
                      <LogOutIcon size={12} className="mr-1" aria-hidden />
                      Revoke
                    </>
                  )}
                </button>
              )}
            </div>
          ))}
          {sessions.some(s => !s.isCurrent) && (
            <button
              type="button"
              onClick={revokeAllOtherSessions}
              className="premium-button-secondary text-sm w-full md:w-auto"
            >
              <LogOutIcon size={12} className="mr-1" aria-hidden />
              Revoke All Other Sessions
            </button>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        Revoking a session will sign you out on that device. Your current session cannot be revoked from here.
      </p>
    </div>
  )
}