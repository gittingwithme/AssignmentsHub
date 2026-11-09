import type { Metadata } from 'next'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import './landing.css'
import Footer from '@/components/ui/shared/footer'
import AmbientBackground from '@/components/ui/shared/ambient-background'
import { ToastProvider } from '@/components/ui/shared/toast-provider'
import { siteConfig } from '@/lib/site-config'
import ErrorBoundary from '@/components/ui/shared/sentry-error-boundary'

const sg = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-sg',
  display: 'swap',
})

const jb = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jb',
  display: 'swap',
})

export const metadata: Metadata = {
  title: siteConfig.socialPreviewTitle,
  description: siteConfig.defaultSeoDescription,
  openGraph: {
    title: siteConfig.socialPreviewTitle,
    description: siteConfig.socialPreviewDescription,
    siteName: siteConfig.name,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.socialPreviewTitle,
    description: siteConfig.socialPreviewDescription,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    /* 'intro' arms the landing entrance pre-paint (finished page never flashes).
       LandingStage removes it after the one-shot choreography, or immediately
       for reduced-motion / non-WAAPI clients. Harmless on other routes.
       suppressHydrationWarning: browser extensions frequently rewrite <html>
       attributes (theme classes, data-*) before React hydrates, which otherwise
       triggers a false-positive attribute mismatch on every load. */
    <html lang="en" style={{ backgroundColor: '#080909', color: '#FFFFFF' }} suppressHydrationWarning>
      {/* flex-col so footer always stacks below content, never beside the sidebar */}
      <body
        className={`${sg.variable} ${jb.variable} flex min-h-screen flex-col`}
        style={{ backgroundColor: 'var(--canvas)', color: 'var(--ink)' }}
        suppressHydrationWarning
      >
        <AmbientBackground />
        <ToastProvider>
          <ErrorBoundary>
            <div className="relative z-10 flex min-h-screen flex-col">
              <div className="flex flex-1 flex-col">
                {children}
              </div>
              <Footer />
            </div>
          </ErrorBoundary>
        </ToastProvider>
      </body>
    </html>
  )
}
