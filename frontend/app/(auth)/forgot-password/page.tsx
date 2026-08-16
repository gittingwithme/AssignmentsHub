import Link from 'next/link'
import ForgotPasswordFormClient from '@/components/ui/shared/forgot-password-form-client'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const error = params?.error as string | undefined
  const message = params?.message as string | undefined

  return (
    <div className="auth-card">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.04] text-lg font-semibold text-white ">
          AH
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Forgot Password</h1>
        <p className="mt-2 text-sm leading-7 text-zinc-400">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      <ForgotPasswordFormClient error={error} message={message} />

      <p className="mt-6 text-center text-sm text-zinc-400">
        Remember your password?{' '}
        <Link href="/login" className="text-white underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}