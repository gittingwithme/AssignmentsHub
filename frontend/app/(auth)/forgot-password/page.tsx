import Link from 'next/link'
import ForgotPasswordFormClient from '@/components/ui/shared/forgot-password-form-client'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawError = params?.error
  const error = Array.isArray(rawError) ? rawError[0] : (rawError as string | undefined)
  const rawMessage = params?.message
  const message = Array.isArray(rawMessage) ? rawMessage[0] : (rawMessage as string | undefined)

  return (
    <div className="auth-card">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04] text-base font-semibold text-white">
          AH
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">Forgot Password</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      <ForgotPasswordFormClient error={error} message={message} />

      <p className="mt-5 text-center text-sm text-zinc-400">
        Remember your password?{' '}
        <Link href="/login" className="text-white underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}