import Link from 'next/link'
import GoogleAuthButton from '@/components/ui/shared/google-auth-button'
import LoginFormClient from '@/components/ui/shared/login-form-client'

export default async function LoginPage({
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
        <h1 className="text-3xl font-semibold tracking-tight text-white">Log in</h1>
        <p className="mt-2 text-sm leading-7 text-zinc-400">
          Access your support requests, subscription plans, payment updates, and account dashboard.
        </p>
      </div>

      <GoogleAuthButton label="Continue with Google" />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/5" />
        <span className="text-xs uppercase tracking-[0.18em] text-zinc-400">or</span>
        <div className="h-px flex-1 bg-white/5" />
      </div>

      <LoginFormClient error={error} message={message} />

      <p className="mt-6 text-center text-sm text-zinc-400">
        Don&apos;t have an account?{' '}
        <Link href="/sign-up" className="text-white underline-offset-4 hover:underline">
          Sign up
        </Link>
      </p>

      <p className="mt-3 text-center text-sm text-zinc-400">
        <Link href="/forgot-password" className="text-white underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      </p>
    </div>
  )
}
