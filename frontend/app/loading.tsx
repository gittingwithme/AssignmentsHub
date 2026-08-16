export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <span
          className="h-8 w-8 animate-spin rounded-full"
          style={{
            border: '2px solid var(--hairline-strong)',
            borderTopColor: 'var(--brand-500)',
          }}
          aria-hidden
        />
        <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
          Loading…
        </p>
      </div>
    </div>
  )
}
