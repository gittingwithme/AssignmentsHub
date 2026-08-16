import type { ReactNode } from 'react'
import Link from 'next/link'
import Reveal from '@/components/ui/shared/reveal'

export default function AuthShell({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col w-full">
      <div className="spot-glow left-[-8%] top-[10%] h-[320px] w-[320px]" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)' }} />
      <div className="spot-glow right-[-10%] top-[-5%] h-[420px] w-[420px]" style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 70%)' }} />
      <div className="spot-glow bottom-[-10%] left-[25%] h-[300px] w-[300px]" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)' }} />

      <div className="page-wrap flex-1 relative z-10 flex flex-col py-6">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors hover:-translate-x-0.5">
            ← Home
          </Link>

          <div className="mp-badge hidden md:inline-flex">
            AssignmentsHub
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <Reveal onMount className="w-full max-w-md">
            {children}
          </Reveal>
        </div>
      </div>
    </div>
  )
}
