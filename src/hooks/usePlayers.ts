import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchPlayerStatsStratz } from '@/api/stratz'
import { supabase } from '@/lib/supabase'
import { steamId64FromAccount } from '@/lib/playerInput'
import {
  STORAGE_KEYS,
  loadJSON,
  removeKey,
  saveJSON,
} from '@/lib/storage'
import type {
  PlayerStats,
  PlayerRole,
  PlayerStatus,
  TrackedPlayer,
} from '@/types'

function restoreTracked(): TrackedPlayer[] {
  return loadJSON<TrackedPlayer[]>(STORAGE_KEYS.players, []).map((player) => ({
    ...player,
    roles: player.roles ?? [],
  }))
}

export interface StatsCacheEntry {
  fetchedAt: number
  stats: PlayerStats
}

function restoreStats(): Record<number, StatsCacheEntry> {
  const initial: Record<number, StatsCacheEntry> = {}
  for (const player of loadJSON<TrackedPlayer[]>(STORAGE_KEYS.players, [])) {
    const entry = loadJSON<StatsCacheEntry | null>(STORAGE_KEYS.stats(player.accountId), null)
    if (entry?.stats) {
      initial[player.accountId] = {
        fetchedAt: entry.fetchedAt,
        stats: entry.stats,
      }
    }
  }
  return initial
}

interface PlayersOptions {
  userId?: string | null
  isAdmin?: boolean
}

const STRATZ_REQUEST_DELAY_MS = 350

function waitForStratzSlot(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, STRATZ_REQUEST_DELAY_MS))
}

export function usePlayers({ userId = null, isAdmin = false }: PlayersOptions = {}) {
  const [tracked, setTracked] = useState<TrackedPlayer[]>(() =>
    restoreTracked(),
  )
  const [statsMap, setStatsMap] = useState<Record<number, StatsCacheEntry>>(restoreStats)
  const [statusMap, setStatusMap] = useState<Record<number, PlayerStatus>>({})
  const [errorMap, setErrorMap] = useState<Record<number, string | null>>({})
  const trackedRef = useRef(tracked)
  const statsMapRef = useRef(statsMap)
  const statusMapRef = useRef(statusMap)

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase
      .from('players')
      .select('account_id, personaname, avatar_url, roles, added_at, stats, stats_fetched_at')
      .order('personaname')
      .then(({ data, error }) => {
        if (!active || error) return
        const cloudStats: Record<number, StatsCacheEntry> = {}
        const cloudPlayers = data.map((player) => {
          const accountId = Number(player.account_id)
          if (player.stats && player.stats_fetched_at) {
            cloudStats[accountId] = {
              stats: player.stats as PlayerStats,
              fetchedAt: new Date(player.stats_fetched_at).getTime(),
            }
          }
          return {
            accountId,
            personaname: player.personaname,
            avatarfull: player.avatar_url,
            addedAt: new Date(player.added_at).getTime(),
            roles: (player.roles ?? []) as PlayerRole[],
          }
        })
        setTracked(cloudPlayers)
        setStatsMap((prev) => ({ ...prev, ...cloudStats }))
      })
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    trackedRef.current = tracked
  }, [tracked])

  useEffect(() => {
    statsMapRef.current = statsMap
    statusMapRef.current = statusMap
  }, [statsMap, statusMap])

  useEffect(() => {
    if (!userId) saveJSON(STORAGE_KEYS.players, tracked)
  }, [tracked, userId])

  const loadStats = useCallback(async (accountId: number, fresh = false): Promise<boolean> => {
    setStatusMap((prev) => ({ ...prev, [accountId]: 'loading' }))
    setErrorMap((prev) => ({ ...prev, [accountId]: null }))
    try {
      const stats = await fetchPlayerStatsStratz(accountId, { fresh })
      const entry: StatsCacheEntry = { fetchedAt: Date.now(), stats }
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
      if (userId && isAdmin && supabase) {
        const { error } = await supabase.from('players').upsert(
          {
            account_id: accountId,
            steam_id64: stats.profile.steamid ?? steamId64FromAccount(accountId),
            personaname: stats.profile.personaname || `Игрок ${accountId}`,
            avatar_url: stats.profile.avatarfull,
            roles: trackedRef.current.find((player) => player.accountId === accountId)?.roles ?? [],
            added_by: userId,
            stats,
            stats_fetched_at: new Date(entry.fetchedAt).toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id' },
        )
        if (error) throw new Error(`Не удалось сохранить игрока в базе: ${error.message}`)
      }
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка'
      setErrorMap((prev) => ({ ...prev, [accountId]: message }))
      setStatusMap((prev) => ({ ...prev, [accountId]: 'error' }))
      return false
    }
  }, [isAdmin, userId])

  useEffect(() => {
    if (!supabase) return
    let active = true
    const task = window.setTimeout(() => {
      void (async () => {
        for (const player of tracked) {
          const status = statusMapRef.current[player.accountId]
          if (!active) return
          if (!statsMapRef.current[player.accountId] && (!status || status === 'idle')) {
            await loadStats(player.accountId)
            await waitForStratzSlot()
          }
        }
      })()
    }, 0)
    return () => {
      active = false
      window.clearTimeout(task)
    }
  }, [loadStats, tracked, userId])

  const addAccount = useCallback(
    async (accountId: number, personaname?: string, avatarfull?: string | null): Promise<boolean> => {
      if (userId && !isAdmin) return false
      const exists = trackedRef.current.some((p) => p.accountId === accountId)
      if (!exists) {
        setTracked((prev) => [
          ...prev,
          {
            accountId,
            personaname: personaname ?? `Игрок ${accountId}`,
            avatarfull: avatarfull ?? null,
            addedAt: Date.now(),
            roles: [],
          },
        ])
      }
      return loadStats(accountId)
    },
    [isAdmin, loadStats, userId],
  )

  const removePlayer = useCallback(async (accountId: number): Promise<boolean> => {
    if (userId && (!isAdmin || !supabase)) return false
    if (userId && supabase) {
      const { error } = await supabase.from('players').delete().eq('account_id', accountId)
      if (error) return false
    }
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
    return true
  }, [isAdmin, userId])

  const refreshPlayer = useCallback(
    (accountId: number) => loadStats(accountId, true),
    [loadStats],
  )

  const updatePlayerRoles = useCallback(
    async (accountId: number, roles: PlayerRole[]): Promise<boolean> => {
      if (!userId || !isAdmin || !supabase) return false
      const { error } = await supabase
        .from('players')
        .update({ roles })
        .eq('account_id', accountId)
      if (error) return false
      setTracked((prev) => prev.map((player) => (
        player.accountId === accountId ? { ...player, roles } : player
      )))
      return true
    },
    [isAdmin, userId],
  )

  const refreshAll = useCallback(async (): Promise<{ updated: number; failed: number }> => {
    const players = [...trackedRef.current]
    let updated = 0
    let failed = 0
    for (const player of players) {
      const ok = await loadStats(player.accountId, true)
      if (ok) updated += 1
      else failed += 1
      await waitForStratzSlot()
    }
    return { updated, failed }
  }, [loadStats])

  return {
    tracked,
    statsMap,
    statusMap,
    errorMap,
    addAccount,
    removePlayer,
    refreshPlayer,
    refreshAll,
    updatePlayerRoles,
  }
}
