'use client'

import dynamic from 'next/dynamic'

const HeroVisual = dynamic(() => import('@/components/ui/shared/hero-cube'), {
  ssr: false,
  loading: () => (
    <div
      className="mx-auto aspect-[4/5] w-full max-w-[420px] animate-pulse rounded-[28px] bg-white/[0.04]"
      aria-hidden
    />
  ),
})

export default HeroVisual
