'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { siteConfig } from '@/lib/site-config'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/services', label: 'Services' },
  { href: '/plans', label: 'Plans' },
  { href: '/one-time-work', label: 'One-Time Work' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
]

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
    <header className="page-wrap sticky top-3 z-50 pt-4 md:pt-5">
      <div
        className={cn(
          'mp-card flex items-center justify-between px-4 py-3 transition-all duration-500 md:px-5 shadow-none border-b',
          scrolled && 'border-[var(--hairline-strong)] shadow-[0_18px_50px_rgba(0,0,0,0.45)]',
        )}
        style={{
          backgroundColor: scrolled ? 'var(--surface)' : 'var(--surface-raised)',
        }}
      >
        <Link href="/" className="group flex items-center gap-3" onClick={() => setOpen(false)}>
          <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-sunken)] text-sm font-semibold text-[var(--ink)] transition-all duration-300 group-hover:border-[rgba(16,185,129,0.30)] group-hover:bg-[var(--brand-900)] group-hover:text-[var(--brand-300)]">
            <span className="relative">AH</span>
          </div>
          <div className="leading-tight transition-all duration-300 group-hover:translate-x-0.5">
            <p className="text-sm font-semibold text-[var(--ink)]">{siteConfig.name}</p>
            <p className="text-[11px] text-[var(--ink-faint)]">{siteConfig.footerNote}</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-0 after:bg-[var(--brand-400)] after:transition-all after:duration-300 hover:after:w-full"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors md:inline-flex"
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
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--hairline)] bg-[var(--surface-sunken)] text-[var(--ink-muted)] transition-colors hover:border-[rgba(16,185,129,0.30)] hover:bg-[var(--brand-900)] hover:text-[var(--brand-300)] lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          'lg:hidden overflow-hidden transition-[max-height,opacity] duration-400 ease-out',
          open ? 'mt-2 max-h-[460px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="mp-card space-y-1 p-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm font-medium text-[var(--ink-muted)] transition-all duration-200 hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]"
            >
              {item.label}
            </Link>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-2">
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
