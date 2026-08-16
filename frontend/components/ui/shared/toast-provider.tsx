'use client'

import * as Toast from '@radix-ui/react-toast'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { CheckCircle2Icon, XCircleIcon, InfoIcon } from 'lucide-react'

export type ToastVariant = 'success' | 'error' | 'info'

type ToastData = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

type ToastOptions = {
  title: string
  description?: string
  variant?: ToastVariant
}

type ToastContextValue = {
  toast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within <ToastProvider>')
  }
  return context
}

const ICONS: Record<ToastVariant, typeof CheckCircle2Icon> = {
  success: CheckCircle2Icon,
  error: XCircleIcon,
  info: InfoIcon,
}

const ACCENT: Record<ToastVariant, string> = {
  success: 'var(--success, #34D399)',
  error: 'var(--error, #F87171)',
  info: 'var(--info, #60A5FA)',
}

const BORDER: Record<ToastVariant, string> = {
  success: 'rgba(52,211,153,0.30)',
  error: 'rgba(248,113,113,0.30)',
  info: 'rgba(96,165,250,0.30)',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [
      ...prev,
      {
        id,
        title: options.title,
        description: options.description,
        variant: options.variant ?? 'info',
      },
    ])
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}

      <Toast.Provider swipeDirection="right" duration={4500}>
        {toasts.map((t) => {
          const Icon = ICONS[t.variant]
          const rootStyle: CSSProperties = {
            backgroundColor: 'var(--surface-raised, #151C1A)',
            border: `1px solid ${BORDER[t.variant]}`,
            borderRadius: '0.75rem',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            padding: '0.85rem 1rem',
            width: '100%',
          }
          return (
            <Toast.Root
              key={t.id}
              open
              onOpenChange={(open) => {
                if (!open) dismiss(t.id)
              }}
              style={rootStyle}
            >
              <div className="flex items-start gap-3">
                <Icon
                  size={17}
                  className="mt-0.5 shrink-0"
                  style={{ color: ACCENT[t.variant] }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <Toast.Title
                    className="text-[13px] font-semibold leading-5"
                    style={{ color: 'var(--ink, #F4F7F5)' }}
                  >
                    {t.title}
                  </Toast.Title>
                  {t.description ? (
                    <Toast.Description
                      className="mt-0.5 text-[12px] leading-5"
                      style={{ color: 'var(--ink-muted, #A7B0AC)' }}
                    >
                      {t.description}
                    </Toast.Description>
                  ) : null}
                </div>
                <Toast.Close
                  aria-label="Dismiss"
                  className="shrink-0 rounded p-1 outline-none transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                  style={{ color: 'var(--ink-faint, #737D78)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </Toast.Close>
              </div>
            </Toast.Root>
          )
        })}
        <Toast.Viewport className="fixed bottom-4 right-4 z-[120] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}
