import type { ReactNode } from 'react'
import Link from 'next/link'
import Reveal from '@/components/ui/shared/reveal'

export default function LegalShell({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <div className="page-wrap py-8 md:py-12 flex-1">
        <Link href="/" className="text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors hover:-translate-x-0.5">
          ← Back home
        </Link>

        <Reveal onMount className="mp-card mt-6 p-6 md:p-10 border-[var(--hairline-strong)] bg-[var(--surface-sunken)]">
          <h1 className="text-3xl font-semibold text-[var(--ink)] md:text-4xl">{title}</h1>
          <div className="mt-6 space-y-4 text-sm leading-8 text-[var(--ink-muted)] prose prose-invert max-w-none">
            {children}
          </div>
        </Reveal>
      </div>
    </div>
  )
}
