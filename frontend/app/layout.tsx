import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Footer from '@/components/ui/shared/footer'
import AmbientBackground from '@/components/ui/shared/ambient-background'
import { ToastProvider } from '@/components/ui/shared/toast-provider'
import { siteConfig } from '@/lib/site-config'
import ErrorBoundary from '@/components/ui/shared/sentry-error-boundary'

const inter = Inter({
  subsets: ['latin'],
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
    <html lang="en">
      {/* flex-col so footer always stacks below content, never beside the sidebar */}
      <body className={`${inter.className} flex min-h-screen flex-col`} style={{ backgroundColor: 'var(--canvas)', color: 'var(--ink)' }}>
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
