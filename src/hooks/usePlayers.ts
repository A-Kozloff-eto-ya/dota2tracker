import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchPlayerStats } from '@/api/opendota'
import { fetchPlayerStatsStratz } from '@/api/stratz'
import { fetchSteamPlayerStats } from '@/api/steam'
import { mergeStats } from '@/lib/mergeStats'
import {
  STORAGE_KEYS,
  getSteamApiKey,
  getStratzApiKey,
  loadJSON,
  removeKey,
  saveJSON,
} from '@/lib/storage'
import type {
  PlayerStats,
  PlayerStatus,
  SourceBundle,
  TrackedPlayer,
} from '@/types'

export interface StatsCacheEntry {
  fetchedAt: number
  stats: PlayerStats
  /** Данные по источникам; в старом кэше может отсутствовать */
  sources?: SourceBundle
}

function restoreStats(): Record<number, StatsCacheEntry> {
  const initial: Record<number, StatsCacheEntry> = {}
  for (const player of loadJSON<TrackedPlayer[]>(STORAGE_KEYS.players, [])) {
    const entry = loadJSON<StatsCacheEntry | null>(STORAGE_KEYS.stats(player.accountId), null)
    if (entry?.stats) {
      initial[player.accountId] = {
        fetchedAt: entry.fetchedAt,
        stats: entry.stats,
        // Старый кэш без источников считаем OpenDota/сводными данными
        sources: entry.sources ?? { steam: null, opendota: entry.stats, stratz: null },
      }
    }
  }
  return initial
}

export function usePlayers() {
  const [tracked, setTracked] = useState<TrackedPlayer[]>(() =>
    loadJSON<TrackedPlayer[]>(STORAGE_KEYS.players, []),
  )
  const [statsMap, setStatsMap] = useState<Record<number, StatsCacheEntry>>(restoreStats)
  const [statusMap, setStatusMap] = useState<Record<number, PlayerStatus>>({})
  const [errorMap, setErrorMap] = useState<Record<number, string | null>>({})
  const trackedRef = useRef(tracked)

  useEffect(() => {
    trackedRef.current = tracked
  }, [tracked])

  useEffect(() => {
    saveJSON(STORAGE_KEYS.players, tracked)
  }, [tracked])

  const loadStats = useCallback(async (accountId: number, fresh = false): Promise<boolean> => {
    setStatusMap((prev) => ({ ...prev, [accountId]: 'loading' }))
    setErrorMap((prev) => ({ ...prev, [accountId]: null }))
    try {
      const hasStratz = getStratzApiKey() !== ''
      const hasSteam = getSteamApiKey() !== ''
      let stats: PlayerStats
      let sources: SourceBundle
      if (hasStratz || hasSteam) {
        // Все доступные источники параллельно; рейтинг и балансировка считаются
        // по объединённым данным, переключатель на карточке показывает по отдельности
        const [stratzStats, odStats, steamStats] = await Promise.all([
          hasStratz
            ? fetchPlayerStatsStratz(accountId, { fresh }).catch(() => null)
            : Promise.resolve(null),
          fetchPlayerStats(accountId, { fresh }).catch(() => null),
          hasSteam
            ? fetchSteamPlayerStats(accountId, { fresh }).catch(() => null)
            : Promise.resolve(null),
        ])
        sources = { steam: steamStats, opendota: odStats, stratz: stratzStats }
        if (stratzStats && odStats) {
          stats = mergeStats(stratzStats, odStats)
        } else if (stratzStats) {
          stats = stratzStats
        } else if (odStats) {
          stats = odStats
        } else if (steamStats) {
          stats = steamStats
        } else {
          throw new Error('Не удалось получить данные из STRATZ, OpenDota и Steam')
        }
      } else {
        stats = await fetchPlayerStats(accountId, { fresh })
        sources = { steam: null, opendota: stats, stratz: null }
      }
      const entry: StatsCacheEntry = { fetchedAt: Date.now(), stats, sources }
      setStatsMap((prev) => ({ ...prev, [accountId]: entry }))
      saveJSON(STORAGE_KEYS.stats(accountId), entry)
      setStatusMap((prev) => ({ ...prev, [accountId]: 'loaded' }))
      setTracked((prev) =>
        prev.map((p) =>
          p.accountId === accountId
            ? {
                ...p,
                personaname: stats.profile.personaname || p.personaname,
                avatarfull: stats.profile.avatarfull ?? p.avatarfull,
              }
            : p,
        ),
      )
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка'
      setErrorMap((prev) => ({ ...prev, [accountId]: message }))
      setStatusMap((prev) => ({ ...prev, [accountId]: 'error' }))
      return false
    }
  }, [])

  const addAccount = useCallback(
    async (accountId: number, personaname?: string, avatarfull?: string | null): Promise<boolean> => {
      const exists = trackedRef.current.some((p) => p.accountId === accountId)
      if (!exists) {
        setTracked((prev) => [
          ...prev,
          {
            accountId,
            personaname: personaname ?? `Игрок ${accountId}`,
            avatarfull: avatarfull ?? null,
            addedAt: Date.now(),
          },
        ])
      }
      return loadStats(accountId)
    },
    [loadStats],
  )

  const removePlayer = useCallback((accountId: number) => {
    setTracked((prev) => prev.filter((p) => p.accountId !== accountId))
    removeKey(STORAGE_KEYS.stats(accountId))
    setStatsMap((prev) => {
      const next = { ...prev }
      delete next[accountId]
      return next
    })
    setStatusMap((prev) => {
      const next = { ...prev }
      delete next[accountId]
      return next
    })
    setErrorMap((prev) => {
      const next = { ...prev }
      delete next[accountId]
      return next
    })
  }, [])

  const refreshPlayer = useCallback(
    (accountId: number) => loadStats(accountId, true),
    [loadStats],
  )

  return {
    tracked,
    statsMap,
    statusMap,
    errorMap,
    addAccount,
    removePlayer,
    refreshPlayer,
  }
}
