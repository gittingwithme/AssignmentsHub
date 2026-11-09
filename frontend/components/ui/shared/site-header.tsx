'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { siteConfig } from '@/lib/site-config'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/services', label: 'Services' },
  { href: '/plans', label: 'Plans' },
  { href: '/faq', label: 'FAQ' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
]

const mono = { fontFamily: 'var(--font-jb, "JetBrains Mono", monospace)' }

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className="sticky top-0 z-50 w-full transition-colors duration-300" style={scrolled ? { backgroundColor: 'rgba(8,9,9,0.86)', borderBottom: '1px solid var(--hairline)', backdropFilter: 'blur(14px)' } : { backgroundColor: 'transparent', borderBottom: '1px solid transparent' }}>
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 md:px-6">
        <Link href="/" className="group flex items-center gap-3" onClick={() => setOpen(false)}>
          <div className="flex h-9 w-9 items-center justify-center bg-[var(--brand-500)] text-sm font-medium text-white transition-colors group-hover:bg-[var(--brand-600)]">
            AH
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-[-0.01em] text-[var(--ink)]">{siteConfig.name}</p>
            <p className="text-[11px]" style={{ ...mono, color: 'var(--ink-faint)' }}>
              {siteConfig.footerNote}
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative text-[13px] text-[var(--ink-muted)] transition-colors after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-0 after:bg-[var(--brand-500)] after:transition-all after:duration-300 hover:text-[var(--ink)] hover:after:w-full"
              style={mono}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-[13px] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] md:inline-flex"
            style={mono}
          >
            Log in
          </Link>
          <Link
            href="/sign-up"
            className="mp-btn mp-btn-primary hidden px-5 py-2.5 sm:inline-flex"
          >
            Get started
          </Link>

          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] text-[var(--ink-muted)] transition-colors hover:border-[rgba(200,27,28,0.40)] hover:text-[var(--brand-400)] lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          'lg:hidden overflow-hidden transition-[max-height,opacity] duration-300 ease-out',
          open ? 'max-h-[520px] opacity-100' : 'max-h-0 opacity-0',
        )}
        style={{ backgroundColor: 'rgba(10,11,11,0.97)' }}
      >
        <div className="space-y-0 border-t border-[var(--hairline)] p-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block border-b border-[var(--hairline)] px-4 py-3 text-[13px] text-[var(--ink-muted)] transition-all duration-200 last:border-b-0 hover:pl-5 hover:text-[var(--ink)]"
              style={mono}
            >
              {item.label}
            </Link>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-3">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="mp-btn mp-btn-secondary px-4 py-2.5 text-sm flex justify-center"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              onClick={() => setOpen(false)}
              className="mp-btn mp-btn-primary px-4 py-2.5 text-sm flex justify-center"
            >
              Get started
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
