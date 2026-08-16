'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type RevealProps = {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  id?: string
  /** Disable the scroll-into-view trigger and animate on mount instead. */
  onMount?: boolean
}

export default function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  id,
  onMount = false,
}: RevealProps) {
  const initial = { opacity: 0, y }

  if (onMount) {
    return (
      <motion.div
        id={id}
        initial={initial}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay, ease: 'easeOut' }}
        className={cn(className)}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <motion.div
      id={id}
      initial={initial}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, delay, ease: 'easeOut' }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  )
}
