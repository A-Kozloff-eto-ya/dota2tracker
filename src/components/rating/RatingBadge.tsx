import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect } from 'react'

import { cn } from '@/lib/utils'

const TIERS = [
  { max: 2500, cls: 'text-slate-300' },
  { max: 4000, cls: 'text-emerald-300' },
  { max: 5500, cls: 'text-sky-300' },
  { max: 7000, cls: 'text-violet-300' },
  { max: 8500, cls: 'text-fuchsia-300' },
  { max: Number.POSITIVE_INFINITY, cls: 'text-gold-gradient' },
] as const

const SIZES = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl' } as const

interface RatingBadgeProps {
  rating: number | null
  size?: keyof typeof SIZES
  className?: string
}

/** Анимированное число рейтинга с цветом по величине */
export function RatingBadge({ rating, size = 'md', className }: RatingBadgeProps) {
  const motionValue = useMotionValue(0)

  useEffect(() => {
    const controls = animate(motionValue, rating ?? 0, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
    })
    return () => controls.stop()
  }, [rating, motionValue])

  const text = useTransform(motionValue, (value) =>
    Math.round(value).toLocaleString('ru-RU'),
  )

  if (rating == null) {
    return (
      <span
        className={cn('font-display text-muted-foreground/60', SIZES[size], className)}
        title="Недостаточно данных для расчёта"
      >
        —
      </span>
    )
  }

  const tier = TIERS.find((t) => rating < t.max) ?? TIERS[TIERS.length - 1]

  return (
    <motion.span
      className={cn('font-display tabular-nums tracking-tight', SIZES[size], tier.cls, className)}
      title={`Рейтинг: ${rating.toLocaleString('ru-RU')}`}
    >
      {text}
    </motion.span>
  )
}
