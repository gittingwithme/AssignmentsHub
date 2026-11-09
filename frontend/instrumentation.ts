import * as Sentry from "@sentry/nextjs"

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    debug: false,
    environment: process.env.NODE_ENV || "development",
    release: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
  
  beforeSend(event) {
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
})
}