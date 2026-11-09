"use client"

import React, { Component, type ReactNode } from "react"
import * as Sentry from "@sentry/nextjs"

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo)
    try {
      Sentry.captureException(error, {
        extra: { componentStack: errorInfo.componentStack },
      })
    } catch {
      // Ignore Sentry errors
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[50vh] w-full flex-col items-center justify-center p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
          <p className="mt-2 max-w-md text-sm text-zinc-400">
            An unexpected error occurred while rendering this section. Please refresh the page or return home.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="premium-button-primary px-4 py-2 text-sm"
            >
              Reload Page
            </button>
            <a
              href="/"
              className="premium-button px-4 py-2 text-sm"
            >
              Back to Home
            </a>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}