'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  ChevronsUpDownIcon,
  HelpCircleIcon,
  LogOutIcon,
  LayoutDashboardIcon,
  InboxIcon,
  CreditCardIcon,
  ShieldIcon,
  SettingsIcon,
  UsersIcon,
  FileTextIcon,
  BadgeCheckIcon,
  ActivityIcon,
  BanknoteIcon,
  ReceiptIcon,
  LucideIcon,
} from 'lucide-react'

export type SidebarItem = {
  label: string
  href: string
  icon: LucideIcon
  count?: number
}

type SidebarSection = {
  label: string
  items: SidebarItem[]
}

type DashboardSidebarProps = {
  title?: string
  subtitle?: string
  roleLabel?: string
  items: SidebarItem[]
  workspaceLabel?: string
  sections?: SidebarSection[]
}

export default function DashboardSidebar({
  title = 'AssignmentsHub',
  subtitle,
  roleLabel,
  items,
  workspaceLabel,
  sections,
}: DashboardSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')

  // Build sections from flat items if no sections provided
  const navSections: SidebarSection[] = sections ?? [
    { label: 'Navigation', items },
  ]

  return (
    <div
      className="flex h-full flex-col"
      style={{
        borderRight: '1px solid var(--hairline)',
        backgroundColor: 'var(--surface)',
      }}
    >
      {/* ── Workspace switcher / logo ── */}
      <div className="relative px-3 py-3">
        <div className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[13px] font-bold"
            style={{ backgroundColor: 'var(--brand-500)', color: '#04140E' }}
          >
            AH
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[13px] font-semibold"
              style={{ color: 'var(--ink)' }}
            >
              {title}
            </span>
            <span
              className="block truncate text-[12px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              {subtitle || workspaceLabel || 'AssignmentsHub'}
            </span>
          </span>
          <ChevronsUpDownIcon
            size={14}
            className="shrink-0"
            style={{ color: 'var(--ink-faint)' }}
            aria-hidden
          />
        </div>
      </div>

      {/* ── Nav sections ── */}
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-4">
        {navSections.map((section) => (
          <div key={section.label} className="mb-4">
            <p
              className="px-2 pb-1.5 text-[11px] font-medium uppercase"
              style={{ color: 'var(--ink-faint)', letterSpacing: '0.04em' }}
            >
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const itemUrl = new URL(item.href, 'http://localhost')
                const itemPath = itemUrl.pathname
                const itemTab = itemUrl.searchParams.get('tab')

                const isActive =
                  (pathname === itemPath && currentTab === itemTab) ||
                  (!itemTab && pathname === itemPath && !currentTab) ||
                  (itemPath !== '/dashboard' &&
                    itemPath !== '/admin-dashboard' &&
                    itemPath !== '/super-dashboard' &&
                    pathname.startsWith(itemPath))

                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group relative flex w-full items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] outline-none transition-colors duration-150 ${
                        isActive
                          ? 'bg-[rgba(255,255,255,0.06)] font-semibold text-[var(--ink)]'
                          : 'font-normal text-[var(--ink-muted)] hover:bg-[rgba(255,255,255,0.035)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {/* Active indicator bar */}
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full"
                          style={{ backgroundColor: 'var(--brand-500)' }}
                          aria-hidden
                        />
                      )}

                      <item.icon
                        size={15}
                        aria-hidden
                        style={{
                          color: isActive ? 'var(--brand-400)' : 'var(--ink-faint)',
                        }}
                      />

                      <span className="flex-1 truncate text-left">{item.label}</span>

                      {typeof item.count === 'number' && (
                        <span
                          className="tnum rounded px-1.5 text-[11px] leading-4"
                          style={{
                            border: '1px solid var(--hairline)',
                            backgroundColor: 'var(--surface-sunken)',
                            color: 'var(--ink-faint)',
                          }}
                        >
                          {item.count}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Bottom user card ── */}
      <div style={{ borderTop: '1px solid var(--hairline)', padding: '0.75rem' }}>
        <div
          className="mb-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2"
          style={{
            border: '1px solid var(--hairline)',
            backgroundColor: 'var(--surface-sunken)',
          }}
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{
              border: '1px solid rgba(16,185,129,0.30)',
              backgroundColor: 'var(--brand-900)',
              color: 'var(--brand-300)',
            }}
          >
            {roleLabel ? roleLabel.slice(0, 2).toUpperCase() : 'ME'}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[12px] font-medium"
              style={{ color: 'var(--ink)' }}
            >
              {roleLabel || 'User'}
            </span>
            <span
              className="block truncate text-[11px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              {subtitle || roleLabel || 'AssignmentsHub'}
            </span>
          </span>
          <LogOutIcon size={14} style={{ color: 'var(--ink-faint)' }} aria-hidden />
        </div>

        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-[var(--ink-faint)] outline-none transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--ink-muted)]"
        >
          <HelpCircleIcon size={14} aria-hidden />
          Help & documentation
        </button>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   Pre-built sidebar item sets for each dashboard
   ──────────────────────────────────────────────────────────── */

export const customerSidebarItems: SidebarItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboardIcon },
  { label: 'My Requests', href: '/dashboard?tab=requests', icon: FileTextIcon },
  { label: 'New Request', href: '/dashboard/new-order', icon: InboxIcon },
  { label: 'Subscription', href: '/dashboard/subscription', icon: CreditCardIcon },
  { label: 'Security', href: '/dashboard/security', icon: ShieldIcon },
]

export const adminSidebarItems: SidebarItem[] = [
  { label: 'Overview', href: '/admin-dashboard', icon: LayoutDashboardIcon },
  { label: 'Order Approvals', href: '/admin-dashboard?tab=approvals', icon: BadgeCheckIcon },
  { label: 'Subscriptions', href: '/admin-dashboard?tab=subscriptions', icon: CreditCardIcon },
  { label: 'All Requests', href: '/admin-dashboard?tab=requests', icon: InboxIcon },
]

export const superSidebarItems: SidebarItem[] = [
  { label: 'Overview', href: '/super-dashboard', icon: LayoutDashboardIcon },
  { label: 'Payment Logs', href: '/super-dashboard?tab=payments', icon: ReceiptIcon },
  { label: 'Permissions', href: '/super-dashboard?tab=permissions', icon: UsersIcon },
  { label: 'Maintenance', href: '/super-dashboard?tab=maintenance', icon: ShieldIcon },
  { label: 'Payout Settings', href: '/super-dashboard?tab=payout', icon: BanknoteIcon },
  { label: 'Pricing', href: '/super-dashboard?tab=pricing', icon: ActivityIcon },
  { label: 'Plan Settings', href: '/super-dashboard?tab=plans', icon: SettingsIcon },
]
