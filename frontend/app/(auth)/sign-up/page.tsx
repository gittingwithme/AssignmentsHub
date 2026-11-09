import Link from 'next/link'
import GoogleAuthButton from '@/components/ui/shared/google-auth-button'
import SignupFormClient from '@/components/ui/shared/signup-form-client'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawError = params?.error
  const error = Array.isArray(rawError) ? rawError[0] : (rawError as string | undefined)

  return (
    <div className="auth-card">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04] text-base font-semibold text-white">
          AH
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">Create account</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
          Start with a secure AssignmentsHub workspace built for academic support requests.
        </p>
      </div>

      <GoogleAuthButton label="Continue with Google" />

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/5" />
        <span className="text-xs uppercase tracking-[0.18em] text-zinc-400">or</span>
        <div className="h-px flex-1 bg-white/5" />
      </div>

      <SignupFormClient error={error} />

      <p className="mt-5 text-center text-sm text-zinc-400">
        Already have an account?{' '}
        <Link href="/login" className="text-white underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
