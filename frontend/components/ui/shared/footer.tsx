import Link from 'next/link'
import { siteConfig } from '@/lib/site-config'
import { ShieldCheckIcon, BookOpenIcon } from 'lucide-react'

const footerLinks = [
  { href: '/services', label: 'Services' },
  { href: '/plans', label: 'Plans' },
  { href: '/one-time-work', label: 'One-Time Work' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refund-policy', label: 'Refund Policy' },
  { href: '/revision-policy', label: 'Revision Policy' },
  { href: '/academic-integrity', label: 'Academic Integrity' },
]

const mono = { fontFamily: 'var(--font-jb, "JetBrains Mono", monospace)' }

export default function Footer() {
  return (
    <footer
      className="relative z-10 w-full shrink-0"
      style={{
        borderTop: '1px solid var(--hairline)',
        backgroundColor: 'var(--surface-sunken)',
      }}
    >
      {/* ── Crimson top accent bar ── */}
      <div
        className="h-[2px] w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, var(--brand-600) 25%, var(--brand-500) 50%, var(--brand-600) 75%, transparent 100%)',
          opacity: 0.55,
        }}
      />

      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        {/* ── Main row: brand + nav links ── */}
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">

          {/* Brand block */}
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center text-[13px] font-medium"
              style={{ backgroundColor: 'var(--brand-500)', color: '#fff' }}
            >
              AH
            </span>
            <div>
              <p
                className="text-sm font-semibold leading-tight"
                style={{ color: 'var(--ink)' }}
              >
                {siteConfig.name}
              </p>
              <p
                className="mt-0.5 text-[11px]"
                style={{ ...mono, color: 'var(--ink-faint)' }}
              >
                Academic excellence, delivered.
              </p>
            </div>
          </div>

          {/* Nav links */}
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
            style={mono}
          >
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="footer-nav-link"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* ── Bottom bar: copyright + trust badges ── */}
        <div
          className="mt-6 flex flex-col items-start justify-between gap-3 pt-5 sm:flex-row sm:items-center"
          style={{ borderTop: '1px solid var(--hairline)' }}
        >
          <p
            className="text-[12px]"
            style={{ ...mono, color: 'var(--ink-faint)' }}
          >
            © {new Date().getFullYear()} {siteConfig.name}.{' '}
            {siteConfig.footerNote}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {/* Secure badge */}
            <span
              className="inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-medium"
              style={{
                borderColor: 'rgba(200,27,28,0.35)',
                backgroundColor: 'var(--brand-900)',
                color: 'var(--brand-400)',
              }}
            >
              <ShieldCheckIcon size={11} aria-hidden />
              Secure &amp; confidential
            </span>

            {/* Academic integrity badge */}
            <span
              className="inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-medium"
              style={{
                borderColor: 'var(--hairline-strong)',
                backgroundColor: 'rgba(255,255,255,0.02)',
                color: 'var(--ink-faint)',
              }}
            >
              <BookOpenIcon size={11} aria-hidden />
              Academic integrity policy
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
