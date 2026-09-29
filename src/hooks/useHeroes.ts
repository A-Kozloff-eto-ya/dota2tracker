import { useEffect, useState } from 'react'

import { fetchHeroes } from '@/api/stratz'
import type { HeroInfo } from '@/types'

// Кэш в памяти модуля: список героев почти не меняется
let heroesCache: HeroInfo[] | null = null

function toMap(list: HeroInfo[] | null): Map<number, HeroInfo> {
  const map = new Map<number, HeroInfo>()
  if (list) for (const hero of list) map.set(hero.id, hero)
  return map
}

/** hero_id → HeroInfo (имя, картинка). Ошибки сети глушатся — работает без героев. */
export function useHeroes(): Map<number, HeroInfo> {
  const [map, setMap] = useState<Map<number, HeroInfo>>(() => toMap(heroesCache))

  useEffect(() => {
    if (heroesCache) return
    let alive = true
    fetchHeroes()
      .then((list) => {
        heroesCache = list
        if (alive) setMap(toMap(list))
      })
      .catch(() => {
        // без списка героев приложение остаётся работоспособным
      })
    return () => {
      alive = false
    }
  }, [])

  return map
}
