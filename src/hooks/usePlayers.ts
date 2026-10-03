import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { DEFAULT_STATS_PERIOD_MONTHS, fetchPlayerStatsStratz } from '@/api/stratz'
import { supabase } from '@/lib/supabase'
import { steamId64FromAccount } from '@/lib/playerInput'
import {
  sanitizeRatingOverrides,
  type RatingOverrideScope,
} from '@/lib/ratingOverrides'
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
  RatingOverrides,
  TrackedPlayer,
} from '@/types'

/** Колонки игроков из облака; rating_overrides запрашивается отдельно,
 *  чтобы приложение работало и до добавления колонки в базе */
const PLAYER_COLUMNS_BASE =
  'account_id, personaname, avatar_url, roles, added_at, stats, stats_fetched_at'
const PLAYER_COLUMNS = `${PLAYER_COLUMNS_BASE}, rating_overrides`

function restoreTracked(): TrackedPlayer[] {
  return loadJSON<TrackedPlayer[]>(STORAGE_KEYS.players, []).map((player) => ({
    ...player,
    roles: player.roles ?? [],
    ratingOverrides: sanitizeRatingOverrides(player.ratingOverrides ?? null),
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

function needsStatsRefresh(entry: StatsCacheEntry | undefined, periodMonths: number): boolean {
  return Boolean(
    entry && (
      entry.stats.periodMonths !== periodMonths ||
      (entry.stats.recentMatches.length > 0 &&
        !entry.stats.recentMatches.some((match) => match.position != null))
    ),
  )
}

/** Профиль старше этого возраста считается устаревшим и обновляется в фоне */
const STALE_STATS_MS = 24 * 60 * 60 * 1000
/** Задержка между фоновыми обновлениями (щадим лимиты STRATZ и Vercel) */
const BACKGROUND_SYNC_DELAY_MS = 500
/** Пауза перед стартом фоновой синхронизации после монтирования */
const BACKGROUND_SYNC_START_DELAY_MS = 2000

/**
 * Устаревший профиль: пустой (Perf недоступен — ноль матчей, т.е. данные
 * STRATZ ещё не пришли) либо не обновлялся дольше STALE_STATS_MS.
 */
export function isStaleStatsEntry(entry: StatsCacheEntry | undefined): boolean {
  if (!entry) return true
  const stats = entry.stats
  const totalGames = stats.wl.win + stats.wl.lose
  const isEmptyProfile = totalGames === 0 && stats.recentMatches.length === 0
  return isEmptyProfile || Date.now() - entry.fetchedAt > STALE_STATS_MS
}

export function usePlayers({ userId = null, isAdmin = false }: PlayersOptions = {}) {
  const [tracked, setTracked] = useState<TrackedPlayer[]>(() =>
    restoreTracked(),
  )
  const [statsMap, setStatsMap] = useState<Record<number, StatsCacheEntry>>(restoreStats)
  const [statusMap, setStatusMap] = useState<Record<number, PlayerStatus>>({})
  const [errorMap, setErrorMap] = useState<Record<number, string | null>>({})
  const [statsPeriodMonths, setStatsPeriodMonths] = useState(DEFAULT_STATS_PERIOD_MONTHS)
  const trackedRef = useRef(tracked)
  const statsMapRef = useRef(statsMap)
  const statusMapRef = useRef(statusMap)
  /** accountId-ы, статистика которых грузится прямо сейчас (guard от гонок) */
  const loadStatsInFlight = useRef(new Set<number>())

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true

    async function fetchCloudPlayers() {
      let response = await client
        .from('players')
        .select(PLAYER_COLUMNS)
        .order('personaname')
      // Колонку rating_overrides могли ещё не добавить в базу — тогда
      // работаем без неё и подсказываем, как добавить.
      let overridesMissing = false
      if (
        response.error != null &&
        /rating_overrides/.test(response.error.message) &&
        /column/i.test(response.error.message)
      ) {
        overridesMissing = true
        const fallback = await client
          .from('players')
          .select(PLAYER_COLUMNS_BASE)
          .order('personaname')
        response = {
          data: fallback.data as typeof response.data,
          error: fallback.error,
        } as typeof response
      }
      const { data, error } = response
      if (!active || error || data == null) return
      if (overridesMissing) {
        toast.warning('В базе нет колонки rating_overrides', {
          description:
            'Ручные оценки не сохранятся в облаке. Выполните в SQL-редакторе Supabase: ' +
            'alter table public.players add column if not exists rating_overrides jsonb;',
        })
      }
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
          ratingOverrides: sanitizeRatingOverrides(player.rating_overrides),
        }
      })
      // Мержим с локальным списком: гости могли добавить игроков до входа —
      // полная замена молча теряла бы их записи.
      const cloudIds = new Set(cloudPlayers.map((p) => p.accountId))
      const localOnly = trackedRef.current.filter((p) => !cloudIds.has(p.accountId))
      setTracked([...localOnly, ...cloudPlayers])
      setStatsMap((prev) => ({ ...prev, ...cloudStats }))
    }

    void fetchCloudPlayers()
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
    // Guard от гонок: авто-загрузка, refreshAll и ручное обновление могут
    // сработать одновременно — повторный запрос сжигает квоту STRATZ.
    if (loadStatsInFlight.current.has(accountId)) return false
    loadStatsInFlight.current.add(accountId)
    setStatusMap((prev) => ({ ...prev, [accountId]: 'loading' }))
    setErrorMap((prev) => ({ ...prev, [accountId]: null }))
    try {
      const stats = await fetchPlayerStatsStratz(accountId, { fresh, periodMonths: statsPeriodMonths })
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
        const roles =
          trackedRef.current.find((player) => player.accountId === accountId)?.roles ?? []
        const { error } = await supabase.from('players').upsert(
          {
            account_id: accountId,
            steam_id64: stats.profile.steamid ?? steamId64FromAccount(accountId),
            personaname: stats.profile.personaname || `Игрок ${accountId}`,
            avatar_url: stats.profile.avatarfull,
            // Отдельный upsert только ролей, если listTracked ещё не обновился
            roles,
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
    } finally {
      loadStatsInFlight.current.delete(accountId)
    }
  }, [isAdmin, statsPeriodMonths, userId])

  const loadStatsRef = useRef(loadStats)
  useEffect(() => {
    loadStatsRef.current = loadStats
  }, [loadStats])

  useEffect(() => {
    if (!supabase) return
    let active = true
    const task = window.setTimeout(() => {
      void (async () => {
        for (const player of tracked) {
          const status = statusMapRef.current[player.accountId]
          const cached = statsMapRef.current[player.accountId]
          if (!active) return
          if ((!cached || needsStatsRefresh(cached, statsPeriodMonths)) && (!status || status === 'idle')) {
            await loadStatsRef.current(player.accountId, Boolean(cached))
            await waitForStratzSlot()
          }
        }
      })()
    }, 0)
    return () => {
      active = false
      window.clearTimeout(task)
    }
  }, [statsPeriodMonths, tracked, userId])

  /**
   * Фоновая синхронизация устаревших профилей: раз за сессию (после загрузки
   * списка из Supabase) тихо перезапрашиваем игроков, чьи данные пустые или
   * старше 24 часов. UI не блокируется: таблица сразу показывает кэшированные
   * из Supabase данные, ячейки обновляемых игроков мягко переходят в
   * «loading» по мере продвижения очереди (по одному, с задержкой 500 мс).
   */
  const backgroundSyncAbort = useRef(false)
  useEffect(() => {
    if (!supabase || (userId != null && !isAdmin)) return
    // Один прогон на монтирование списка; abort при размонтировании/рефетче
    backgroundSyncAbort.current = false
    const task = window.setTimeout(() => {
      void (async () => {
        const stale = tracked.filter(
          (player) =>
            !loadStatsInFlight.current.has(player.accountId) &&
            isStaleStatsEntry(statsMapRef.current[player.accountId]),
        )
        for (let i = 0; i < stale.length; i++) {
          if (!backgroundSyncAbort.current) {
            await loadStats(stale[i].accountId, true)
            if (i < stale.length - 1) {
              await new Promise((resolve) => window.setTimeout(resolve, BACKGROUND_SYNC_DELAY_MS))
            }
          }
        }
      })()
    }, BACKGROUND_SYNC_START_DELAY_MS)
    return () => {
      backgroundSyncAbort.current = true
      window.clearTimeout(task)
    }
    // loadStats/statsMap/tracked намеренно не в зависимостях: синхронизация
    // запускается один раз за сессию (список из Supabase уже загружен)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked.length, isAdmin, userId])

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

  /** Заменить все ручные оценки игрока. У админа — запись в облако
   *  (players.rating_overrides), у гостя — локальное состояние, которое
   *  и так персистится вместе со списком игроков. */
  const setRatingOverrides = useCallback(
    async (accountId: number, overrides: RatingOverrides | null): Promise<boolean> => {
      if (userId && !isAdmin) return false
      const clean = sanitizeRatingOverrides(overrides)
      setTracked((prev) => prev.map((player) => (
        player.accountId === accountId ? { ...player, ratingOverrides: clean } : player
      )))
      if (userId && supabase) {
        const { error } = await supabase
          .from('players')
          .update({ rating_overrides: clean })
          .eq('account_id', accountId)
        if (error) {
          toast.error(`Не удалось сохранить ручные оценки: ${error.message}`)
          return false
        }
      }
      return true
    },
    [isAdmin, userId],
  )

  /** Изменить одну оценку: 'overall' или позицию 1..5; value = null — сброс */
  const setRatingOverride = useCallback(
    async (accountId: number, scope: RatingOverrideScope, value: number | null): Promise<boolean> => {
      const current = trackedRef.current.find(
        (player) => player.accountId === accountId,
      )?.ratingOverrides ?? null
      const next: RatingOverrides = { ...(current ?? {}) }
      if (scope === 'overall') {
        if (value == null) delete next.overall
        else next.overall = value
      } else {
        const roles = { ...(next.roles ?? {}) }
        if (value == null) delete roles[scope]
        else roles[scope] = value
        if (Object.keys(roles).length > 0) next.roles = roles
        else delete next.roles
      }
      return setRatingOverrides(accountId, next)
    },
    [setRatingOverrides],
  )

  const refreshAll = useCallback(async (): Promise<{ updated: number; failed: number }> => {
    const players = [...trackedRef.current]
    let updated = 0
    let failed = 0
    for (let i = 0; i < players.length; i++) {
      // Повторный клик «Обновить всех» во время идущей загрузки не должен
      // дублировать запросы — loadStats уже отсекает in-flight, здесь
      // дополнительно не делаем лишнюю паузу после последнего игрока.
      const ok = await loadStats(players[i].accountId, true)
      if (ok) updated += 1
      else failed += 1
      if (i < players.length - 1) await waitForStratzSlot()
    }
    return { updated, failed }
  }, [loadStats])

  const periodInitialized = useRef(false)
  useEffect(() => {
    if (!periodInitialized.current) {
      periodInitialized.current = true
      return
    }
    void refreshAll()
  }, [refreshAll, statsPeriodMonths])

  return {
    tracked,
    statsMap,
    statusMap,
    errorMap,
    addAccount,
    removePlayer,
    refreshPlayer,
    refreshAll,
    statsPeriodMonths,
    setStatsPeriodMonths,
    updatePlayerRoles,
    setRatingOverride,
  }
}
