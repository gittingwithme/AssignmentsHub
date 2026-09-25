import Link from 'next/link'
import { Metadata } from 'next'
import MfaChallengeForm from '@/components/ui/shared/mfa-challenge-form'

export const metadata: Metadata = {
  title: 'Two-Factor Authentication — AssignmentsHub',
}

export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const factorId = params?.factorId as string | undefined
  const challengeId = params?.challengeId as string | undefined
  const error = params?.error as string | undefined

  if (!factorId || !challengeId) {
    return (
      <div className="auth-card">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Invalid Session</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Your MFA session has expired or is invalid. Please sign in again.
          </p>
        </div>
        <Link href="/login" className="premium-button-primary w-full">
          Back to Login
        </Link>
      </div>
    )
  }

  return (
    <div className="auth-card">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.04] text-lg font-semibold text-white">
          2FA
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Two-Factor Authentication</h1>
        <p className="mt-2 text-sm leading-7 text-zinc-400">
          Enter the 6-digit code from your authenticator app to complete sign-in.
        </p>
      </div>

      <MfaChallengeForm factorId={factorId} challengeId={challengeId} error={error} />

      <p className="mt-6 text-center text-sm text-zinc-400">
        <Link href="/login" className="text-white underline-offset-4 hover:underline">
          ← Back to login
        </Link>
      </p>
    </div>
  )
}