'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MenuIcon,
  XIcon,
  BellIcon,
  SearchIcon,
  ShieldIcon,
  ChevronRightIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import RealtimeNotifications from '@/components/ui/shared/realtime-notifications'

export type DashboardNotification = {
  id: string
  title: string
  description?: string
  href: string
  tone?: 'brand' | 'warning' | 'error' | 'info'
}

type DashboardShellProps = {
  sidebar: ReactNode
  children: ReactNode
  header?: ReactNode
  workspaceLabel?: string
  activeItem?: string
  roleLabel?: string
  notifications?: DashboardNotification[]
  /** Viewer's auth uid — enables live chat + payment notifications */
  currentUserId?: string
  /** Role string for scoping realtime subscriptions */
  role?: string
  /** Orders the viewer can see: { orderId: orderTitle } (for chat notifications) */
  orderContext?: Record<string, string>
}

const NOTIF_TONE: Record<
  NonNullable<DashboardNotification['tone']>,
  { dot: string; chip: string }
> = {
  brand: { dot: 'var(--brand-400)', chip: 'rgba(16,185,129,0.12)' },
  warning: { dot: 'var(--warn-400)', chip: 'rgba(245,185,66,0.12)' },
  error: { dot: 'var(--error, #F87171)', chip: 'rgba(248,113,113,0.12)' },
  info: { dot: 'var(--info, #60A5FA)', chip: 'rgba(96,165,250,0.12)' },
}

export default function DashboardShell({
  sidebar,
  children,
  header,
  workspaceLabel = 'Workspace',
  activeItem = 'Overview',
  roleLabel,
  notifications = [],
  currentUserId,
  role,
  orderContext,
}: DashboardShellProps) {
  const [navOpen, setNavOpen] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [liveNotifications, setLiveNotifications] = useState<DashboardNotification[]>([])

  const searchRef = useRef<HTMLInputElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  const pathname = usePathname()
  const router = useRouter()

  const isStaffArea =
    pathname.startsWith('/admin-dashboard') || pathname.startsWith('/super-dashboard')

  // Track the viewport so the single toggle only flips the pane that is
  // actually visible — closing the sidebar on desktop must not leave a
  // latent "open" mobile drawer behind (and vice versa).
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  function handleNavToggle() {
    if (isDesktop) setNavOpen((v) => !v)
    else setMobileNavOpen((v) => !v)
  }

  function submitSearch() {
    const q = searchValue.trim()
    if (!q) return
    const dest = isStaffArea
      ? `/admin-dashboard?tab=requests&q=${encodeURIComponent(q)}`
      : `/dashboard?tab=requests&q=${encodeURIComponent(q)}`
    setSearchOpen(false)
    setSearchValue('')
    router.push(dest)
  }

  // ⌘K / Ctrl+K toggles search, Escape closes popovers
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setNotifOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Focus the search input when it expands
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  // Close the notifications dropdown on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  // Static (server-computed) + live (realtime) notifications, live first
  const allNotifications = [...liveNotifications, ...notifications]
  const hasNotifications = allNotifications.length > 0

  function handleLiveNotification(n: DashboardNotification) {
    setLiveNotifications((prev) => [n, ...prev.filter((p) => p.id !== n.id)].slice(0, 12))
  }

  return (
    <div
      className="flex w-full"
      style={{ minHeight: '100vh', backgroundColor: 'var(--canvas)' }}
    >
      {/* ── Fixed left sidebar (desktop) ── */}
      {navOpen && (
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 lg:block">
          {sidebar}
        </aside>
      )}

      {/* ── Mobile nav drawer ── */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 h-full w-[264px]">
            {sidebar}
          </div>
        </div>
      )}

      {/* ── Main column: topbar + scrollable content ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="mp-topbar">
          {/* Single nav toggle — works for desktop sidebar and mobile drawer */}
          <button
            type="button"
            className="mp-btn mp-btn-ghost mp-btn-icon shrink-0"
            aria-label={isDesktop
              ? navOpen ? 'Close sidebar' : 'Open sidebar'
              : mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            onClick={handleNavToggle}
          >
            {(isDesktop ? navOpen : mobileNavOpen) ? (
              <XIcon size={16} aria-hidden />
            ) : (
              <MenuIcon size={16} aria-hidden />
            )}
          </button>

          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="min-w-0 items-center gap-2 flex">
            <span
              className="truncate text-[13px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              {workspaceLabel}
            </span>
            <span style={{ color: 'var(--ink-faint)' }} aria-hidden>/</span>
            <span
              className="truncate text-[13px] font-medium"
              style={{ color: 'var(--ink)' }}
            >
              {activeItem}
            </span>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Search */}
            {searchOpen ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  submitSearch()
                }}
                className="relative flex items-center"
              >
                <SearchIcon
                  size={14}
                  className="pointer-events-none absolute left-2.5"
                  style={{ color: 'var(--ink-faint)' }}
                  aria-hidden
                />
                <input
                  ref={searchRef}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search requests…"
                  aria-label="Search requests"
                  className="h-9 w-52 rounded-md border pl-8 pr-8 text-[13px] outline-none transition-all sm:w-64"
                  style={{
                    borderColor: 'rgba(16,185,129,0.45)',
                    backgroundColor: 'var(--surface-sunken)',
                    color: 'var(--ink)',
                  }}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                />
                <kbd
                  className="absolute right-2.5 rounded px-1.5 py-0.5 font-mono text-[10px]"
                  style={{
                    border: '1px solid var(--hairline)',
                    color: 'var(--ink-faint)',
                  }}
                >
                  ⏎
                </kbd>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="hidden h-9 items-center gap-2 rounded-md border px-2.5 text-[13px] outline-none transition-colors md:flex hover:border-[var(--hairline-strong)] hover:text-[var(--ink-muted)] text-[var(--ink-faint)] border-[var(--hairline)] bg-[var(--surface)]"
                aria-label="Search requests"
              >
                <SearchIcon size={14} aria-hidden />
                <span className="pr-6">Search…</span>
                <kbd
                  className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                  style={{
                    border: '1px solid var(--hairline)',
                    backgroundColor: 'var(--surface-sunken)',
                    color: 'var(--ink-faint)',
                  }}
                >
                  ⌘K
                </kbd>
              </button>
            )}

            {/* Role pill */}
            {roleLabel && (
              <span
                className="hidden items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium sm:inline-flex"
                style={{
                  borderColor: 'rgba(16,185,129,0.25)',
                  backgroundColor: 'var(--brand-900)',
                  color: 'var(--brand-300)',
                }}
              >
                <ShieldIcon size={12} aria-hidden />
                {roleLabel}
              </span>
            )}

            {/* Live realtime notifications (chat messages) — rendered once per shell */}
            {currentUserId && role && (
              <RealtimeNotifications
                role={role}
                userId={currentUserId}
                orderContext={orderContext || {}}
                onLiveNotification={handleLiveNotification}
              />
            )}

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                className="mp-btn mp-btn-ghost mp-btn-icon relative"
                aria-label={
                  hasNotifications
                    ? `Notifications (${allNotifications.length})`
                    : 'Notifications'
                }
                aria-expanded={notifOpen}
                onClick={() => setNotifOpen((v) => !v)}
              >
                <BellIcon size={16} aria-hidden />                    {hasNotifications && (
                      <span
                        className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: 'var(--warn-400)' }}
                        aria-hidden
                      />
                    )}
              </button>

              {notifOpen && (
                <div
                  className="absolute right-0 top-11 z-50 w-[320px] overflow-hidden rounded-xl border shadow-2xl"
                  style={{
                    borderColor: 'var(--hairline-strong)',
                    backgroundColor: 'var(--surface-raised)',
                  }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderBottom: '1px solid var(--hairline)' }}
                  >
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                      Notifications
                    </p>
                    {hasNotifications && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ backgroundColor: 'var(--brand-900)', color: 'var(--brand-300)' }}
                      >
                        {allNotifications.length} new
                      </span>
                    )}
                  </div>

                  <div className="max-h-[320px] overflow-y-auto">
                    {hasNotifications ? (
                      allNotifications.map((n) => {
                        const tone = NOTIF_TONE[n.tone ?? 'brand']
                        return (
                          <Link
                            key={n.id}
                            href={n.href}
                            onClick={() => setNotifOpen(false)}
                            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                            style={{ borderBottom: '1px solid var(--hairline)' }}
                          >
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: tone.dot }}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                              <span
                                className="block text-[13px] font-medium leading-5"
                                style={{ color: 'var(--ink)' }}
                              >
                                {n.title}
                              </span>
                              {n.description && (
                                <span
                                  className="mt-0.5 block text-[12px] leading-5"
                                  style={{ color: 'var(--ink-faint)' }}
                                >
                                  {n.description}
                                </span>
                              )}
                            </span>
                            <ChevronRightIcon
                              size={14}
                              className="mt-1 shrink-0"
                              style={{ color: 'var(--ink-faint)' }}
                              aria-hidden
                            />
                          </Link>
                        )
                      })
                    ) : (
                      <div className="px-4 py-8 text-center">
                        <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                          You&apos;re all caught up.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 pb-14 pt-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1180px]">
            {header && <div className="mb-6">{header}</div>}
            <div className="space-y-4">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
