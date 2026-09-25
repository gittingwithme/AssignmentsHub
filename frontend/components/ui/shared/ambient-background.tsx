'use client'

export default function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Very subtle atmospheric crimson glows — ambient light, not surfaces */}
      <div
        className="absolute right-[-14%] top-[-4%] h-[560px] w-[560px]"
        style={{ background: 'radial-gradient(circle, rgba(200,27,28,0.10) 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-10%] left-[-10%] h-[520px] w-[520px]"
        style={{ background: 'radial-gradient(circle, rgba(200,27,28,0.07) 0%, transparent 70%)' }}
      />

      {/* Fine top vignette to anchor the header */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/30 to-transparent" />
    </div>
  )
}
