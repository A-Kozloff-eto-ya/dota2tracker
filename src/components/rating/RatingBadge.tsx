import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect } from 'react'

import { ratingTierClass } from '@/lib/ratingTier'
import { cn } from '@/lib/utils'

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

  const tier = ratingTierClass(rating)

  return (
    <motion.span
      className={cn('font-display tabular-nums tracking-tight', SIZES[size], tier, className)}
      title={`Рейтинг: ${rating.toLocaleString('ru-RU')}`}
    >
      {text}
    </motion.span>
  )
}
