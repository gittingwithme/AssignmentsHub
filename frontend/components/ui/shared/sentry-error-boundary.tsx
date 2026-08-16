"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

export default function ErrorBoundary({
  children,
  fallback,
}: {
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  useEffect(() => {
    // Recover from errors
    const handler = (event: ErrorEvent) => {
      Sentry.captureException(event.error)
    }
    window.addEventListener("error", handler)
    return () => window.removeEventListener("error", handler)
  }, [])

  return children
}