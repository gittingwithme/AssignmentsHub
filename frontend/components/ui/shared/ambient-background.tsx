'use client'

export default function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="ambient-grid absolute inset-0 opacity-30" />

      {/* Very subtle atmospheric emerald glows — ambient light, not surfaces */}
      <div
        className="spot-glow right-[-14%] top-[-4%] h-[560px] w-[560px] bg-emerald-500/9"
        style={{ animationDelay: '0s' }}
      />
      <div
        className="spot-glow bottom-[-10%] left-[-10%] h-[520px] w-[520px] bg-teal-500/7"
        style={{ animationDelay: '-10s' }}
      />

      {/* Fine top vignette to anchor the header */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/30 to-transparent" />
    </div>
  )
}
