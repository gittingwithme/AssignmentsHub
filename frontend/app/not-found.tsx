import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="mp-card w-full max-w-md p-8 text-center">
        <p className="tnum text-5xl font-semibold" style={{ color: 'var(--brand-400)' }}>
          404
        </p>
        <h1
          className="mt-3 text-lg font-semibold tracking-[-0.02em]"
          style={{ color: 'var(--ink)' }}
        >
          Page not found
        </h1>
        <p className="mt-2 text-[13px] leading-6" style={{ color: 'var(--ink-muted)' }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/" className="mp-btn mp-btn-primary mp-btn-md">
            Go home
          </Link>
          <Link href="/dashboard" className="mp-btn mp-btn-ghost mp-btn-md">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
