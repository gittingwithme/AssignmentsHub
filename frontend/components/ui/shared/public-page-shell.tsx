import type { ReactNode } from 'react'
import SiteHeader from '@/components/ui/shared/site-header'
import Reveal from '@/components/ui/shared/reveal'

export default function PublicPageShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col w-full">
      <SiteHeader />

      <section className="page-wrap pt-12 pb-8 md:pt-16">
        <Reveal onMount className="mp-card relative overflow-hidden p-6 md:p-8 xl:p-10 border-[var(--hairline-strong)] bg-[var(--surface-sunken)]">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(200,27,28,0.1) 0%, transparent 70%)' }} />
          <div className="relative">
            {eyebrow ? <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-faint)]">{eyebrow}</p> : null}
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--ink)] md:text-5xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-4 max-w-3xl text-sm leading-8 text-[var(--ink-muted)] md:text-base">
                {description}
              </p>
            ) : null}
          </div>
        </Reveal>
      </section>

      <section className="page-wrap pb-16 md:pb-24 flex-1">
        <Reveal delay={0.05}>{children}</Reveal>
      </section>
    </div>
  )
}
