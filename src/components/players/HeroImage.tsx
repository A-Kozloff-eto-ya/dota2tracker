import { useState } from 'react'

import { cn } from '@/lib/utils'
import type { HeroInfo } from '@/types'

interface HeroImageProps {
  heroId: number
  heroes?: Map<number, HeroInfo>
  className?: string
  title?: string
}

/** Миниатюра героя с CDN STRATZ + фолбэк при ошибке загрузки */
export function HeroImage({ heroId, heroes, className, title }: HeroImageProps) {
  const [failed, setFailed] = useState(false)
  const hero = heroes?.get(heroId)
  const label = hero?.localizedName ?? `#${heroId}`

  if (failed || !hero) {
    return (
      <div
        title={title ?? label}
        className={cn(
          'grid place-items-center rounded-md bg-muted text-[10px] font-semibold uppercase text-muted-foreground',
          className,
        )}
      >
        {label.slice(0, 3)}
      </div>
    )
  }

  return (
    <img
      src={hero.img}
      alt={hero.localizedName}
      title={title ?? hero.localizedName}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('rounded-md object-cover', className)}
    />
  )
}
