import type { ReactNode } from 'react'
import Link from 'next/link'

export default function AuthShell({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col w-full relative">
      {/* Background ambient accents */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-[-8%] top-[10%] h-[320px] w-[320px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(200,27,28,0.06) 0%, transparent 70%)' }} />
        <div className="absolute right-[-10%] top-[-5%] h-[420px] w-[420px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(222,92,92,0.08) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-10%] left-[25%] h-[300px] w-[300px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(200,27,28,0.08) 0%, transparent 70%)' }} />
      </div>

      <div className="page-wrap flex-1 relative z-10 flex flex-col py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors hover:-translate-x-0.5">
            ← Home
          </Link>

          <div className="mp-badge hidden md:inline-flex">
            AssignmentsHub
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md animate-fade-up">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
