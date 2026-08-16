"use client"

import * as Sentry from "@sentry/nextjs"

export function register() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 1.0,
      debug: process.env.NODE_ENV === "development",
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      integrations: [
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
        Sentry.browserTracingIntegration(),
      ],
      beforeSend(event) {
        // Remove sensitive data
        if (event.request?.cookies) {
          delete event.request.cookies
        }
        if (event.request?.headers?.authorization) {
          delete event.request.headers.authorization
        }
        return event
      },
      ignoreErrors: [
        "NEXT_REDIRECT",
        "NEXT_NOT_FOUND",
        "Network request failed",
        "Failed to fetch",
      ],
      environment: process.env.NODE_ENV || "development",
      release: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
    })
  }
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart