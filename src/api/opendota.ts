// Клиент OpenDota API: кэш с TTL, ретраи на 429, опциональный api_key
// Документация: https://docs.opendota.com/

import {
  STORAGE_KEYS,
  clearApiCache,
  getApiKey,
  loadJSON,
  saveJSON,
} from '@/lib/storage'
import type {
  HeroInfo,
  OpenDotaProfile,
  PlayerStats,
  RecentMatch,
  SearchEntry,
} from '@/types'

const API_BASE = 'https://api.opendota.com/api'
const DEFAULT_TTL_MS = 10 * 60 * 1000
const SEARCH_TTL_MS = 2 * 60 * 1000
const HEROES_TTL_MS = 7 * 24 * 60 * 60 * 1000

export class OpenDotaError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'OpenDotaError'
    this.status = status
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

interface CacheBox<T> {
  t: number
  data: T
}

async function odFetch<T>(
  path: string,
  opts: { ttlMs?: number; fresh?: boolean } = {},
): Promise<T> {
  const cacheKey = STORAGE_KEYS.cache(path)
  if (!opts.fresh) {
    const box = loadJSON<CacheBox<T> | null>(cacheKey, null)
    if (box && Date.now() - box.t < (opts.ttlMs ?? DEFAULT_TTL_MS)) return box.data
  }

  const url = new URL(API_BASE + path)
  const apiKey = getApiKey()
  if (apiKey) url.searchParams.set('api_key', apiKey)

  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'))
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 6000)
        lastError = new OpenDotaError(
          429,
          'Превышен лимит запросов OpenDota — подождите около минуты и нажмите «Повторить»',
        )
        continue
      }
      if (res.status === 404) {
        throw new OpenDotaError(404, 'Профиль не найден или скрыт настройками приватности')
      }
      if (!res.ok) {
        throw new OpenDotaError(res.status, `Ошибка OpenDota API (${res.status})`)
      }
      const data = (await res.json()) as T
      saveJSON(cacheKey, { t: Date.now(), data })
      return data
    } catch (error) {
      if (error instanceof OpenDotaError && error.status !== 429) throw error
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new OpenDotaError(0, 'Не удалось выполнить запрос')
}

// ---------- Поиск игроков ----------

interface RawSearchEntry {
  account_id: number
  personaname: string
  avatarfull?: string | null
  last_match_time?: string | null
}

export async function searchPlayers(query: string, fresh = false): Promise<SearchEntry[]> {
  const raw = await odFetch<RawSearchEntry[]>(`/search?q=${encodeURIComponent(query)}`, {
    ttlMs: SEARCH_TTL_MS,
    fresh,
  })
  return raw
    .filter((entry) => typeof entry.account_id === 'number')
    .map((entry) => ({
      accountId: entry.account_id,
      personaname: entry.personaname ?? `Игрок ${entry.account_id}`,
      avatarfull: entry.avatarfull ?? null,
      lastMatchTime: entry.last_match_time ?? null,
      source: 'opendota' as const,
    }))
}

// ---------- Статистика игрока ----------

interface RawProfileInfo {
  account_id: number
  personaname?: string | null
  name?: string | null
  avatarfull?: string | null
  steamid?: string | null
  profileurl?: string | null
  loccountrycode?: string | null
}

interface RawProfileResponse {
  profile?: RawProfileInfo | null
  rank_tier?: number | null
  leaderboard_rank?: number | null
  computed_mmr?: number | null
  mmr_estimate?: { estimate?: number | null } | null
}

interface RawHeroPlayed {
  hero_id: number
  games: number
  win: number
}

interface RawRecentMatch {
  match_id: number
  hero_id: number
  start_time: number
  duration: number
  kills: number
  deaths: number
  assists: number
  gold_per_min: number
  xp_per_min: number
  hero_damage: number
  hero_healing: number
  tower_damage: number
  last_hits: number
  radiant_win: boolean
  player_slot: number
  game_mode: number
  leaver_status: number
}

type OptionalResult<T> = { ok: true; data: T } | { ok: false; error: unknown }

/** Не бросает исключение: позволяет отличить «пусто» (приватный профиль) от «сломалось» */
async function odFetchOptional<T>(
  path: string,
  opts: { ttlMs?: number; fresh?: boolean } = {},
): Promise<OptionalResult<T>> {
  try {
    return { ok: true, data: await odFetch<T>(path, opts) }
  } catch (error) {
    return { ok: false, error }
  }
}

export async function fetchPlayerStats(
  accountId: number,
  opts: { fresh?: boolean } = {},
): Promise<PlayerStats> {
  const [profileResult, wlResult, heroesResult, recentResult] = await Promise.all([
    odFetchOptional<RawProfileResponse>(`/players/${accountId}`, { fresh: opts.fresh }),
    odFetchOptional<{ win: number; lose: number }>(`/players/${accountId}/wl`, {
      fresh: opts.fresh,
    }),
    odFetchOptional<RawHeroPlayed[]>(`/players/${accountId}/heroes`, { fresh: opts.fresh }),
    odFetchOptional<RawRecentMatch[]>(`/players/${accountId}/recentMatches`, {
      fresh: opts.fresh,
    }),
  ])

  if (!profileResult.ok) {
    throw profileResult.error instanceof Error
      ? profileResult.error
      : new OpenDotaError(0, 'Не удалось загрузить профиль')
  }
  const profileResp = profileResult.data
  // Ошибки необязательных запросов не глотаем: иначе временный сбой или лимит
  // выглядел бы как «пустой скрытый профиль»
  const wl = wlResult.ok ? wlResult.data : null
  const heroes = heroesResult.ok ? heroesResult.data : null
  const recent = recentResult.ok ? recentResult.data : null
  if (wl == null || heroes == null || recent == null) {
    const firstError = [wlResult, heroesResult, recentResult].find((r) => !r.ok)?.error
    throw firstError instanceof Error
      ? firstError
      : new OpenDotaError(0, 'Не удалось загрузить статистику игрока')
  }

  const rawProfile = profileResp.profile ?? null
  const profile: OpenDotaProfile = {
    accountId,
    personaname: rawProfile?.personaname ?? `Игрок ${accountId}`,
    name: rawProfile?.name ?? null,
    avatarfull: rawProfile?.avatarfull ?? null,
    steamid: rawProfile?.steamid ?? null,
    profileurl: rawProfile?.profileurl ?? null,
    loccountrycode: rawProfile?.loccountrycode ?? null,
    rankTier: profileResp.rank_tier ?? null,
    leaderboardRank: profileResp.leaderboard_rank ?? null,
    computedMmr: profileResp.computed_mmr ?? profileResp.mmr_estimate?.estimate ?? null,
  }

  const recentMatches: RecentMatch[] = recent
    .filter((m) => typeof m.match_id === 'number')
    .map((m) => ({
      matchId: m.match_id,
      heroId: m.hero_id,
      startTime: m.start_time,
      duration: m.duration,
      kills: m.kills,
      deaths: m.deaths,
      assists: m.assists,
      goldPerMin: m.gold_per_min,
      xpPerMin: m.xp_per_min,
      heroDamage: m.hero_damage,
      heroHealing: m.hero_healing,
      towerDamage: m.tower_damage,
      lastHits: m.last_hits,
      radiantWin: m.radiant_win,
      playerSlot: m.player_slot,
      gameMode: m.game_mode,
      leaverStatus: m.leaver_status,
    }))

  return {
    profile,
    wl: { win: wl.win, lose: wl.lose },
    // У скрытых профилей OpenDota отдаёт всех героев с нулями — отбрасываем их
    heroes: heroes
      .filter((h) => typeof h.hero_id === 'number' && h.games > 0)
      .map((h) => ({ heroId: h.hero_id, games: h.games, win: h.win })),
    recentMatches,
  }
}

// ---------- Герои ----------

interface RawHero {
  id: number
  name: string
  localized_name: string
  primary_attr: string
  roles: string[]
}

export const HERO_IMG_BASE =
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes'

export function heroImgFromName(name: string): string {
  const slug = name.replace(/^npc_dota_hero_/, '')
  return `${HERO_IMG_BASE}/${slug}.png`
}

export async function fetchHeroes(fresh = false): Promise<HeroInfo[]> {
  const raw = await odFetch<RawHero[]>('/heroes', { ttlMs: HEROES_TTL_MS, fresh })
  return raw.map((h) => ({
    id: h.id,
    name: h.name,
    localizedName: h.localized_name,
    img: heroImgFromName(h.name),
    primaryAttr: h.primary_attr,
    roles: h.roles,
  }))
}

// ---------- Служебное ----------

/** Очистить кэш API-ответов (localStorage) */
export function resetApiCache(): number {
  return clearApiCache()
}

