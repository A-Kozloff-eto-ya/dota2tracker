// Клиентский адаптер STRATZ. Сам GraphQL-запрос проксируется через
// /api/stratz, поэтому JWT остаётся только на сервере.

import { steamId64FromAccount } from '@/lib/playerInput'
import { STORAGE_KEYS, loadJSON, saveJSON } from '@/lib/storage'
import type {
  HeroInfo,
  HeroPlayed,
  PlayerStats,
  RecentMatch,
  SearchEntry,
  Role,
} from '@/types'

const MATCHES_TAKE = 50
const HEROES_TAKE = 126
const HEROES_TTL_MS = 7 * 24 * 60 * 60 * 1000

export class StratzError extends Error {}

interface GraphQLResponse<T> {
  data?: T | null
  errors?: Array<{ message?: string }>
}

async function stratzQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch('/api/stratz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  })

  if (res.status === 401 || res.status === 403) {
    throw new StratzError('STRATZ отклонил серверный ключ — проверьте настройки Vercel')
  }
  if (res.status === 429) {
    throw new StratzError('Превышен лимит запросов STRATZ — подождите немного')
  }
  const json = (await res.json().catch(() => null)) as GraphQLResponse<T> & { error?: string } | null
  if (!res.ok) throw new StratzError(json?.error ?? `Ошибка STRATZ API (${res.status})`)
  if (!json) throw new StratzError('STRATZ вернул некорректный ответ')
  // GraphQL может вернуть и data, и errors одновременно (частичный ответ —
  // например, «Player is anonymous» по отдельным полям). Отбрасываем ответ
  // только если данных нет вовсе.
  if (json.errors && json.errors.length > 0 && json.data == null) {
    throw new StratzError(`STRATZ: ${json.errors[0]?.message ?? 'ошибка запроса'}`)
  }
  if (!json.data) {
    throw new StratzError('STRATZ вернул пустой ответ')
  }
  return json.data
}

/** Поиск игроков по нику */
export async function searchPlayersStratz(query: string, take = 8): Promise<SearchEntry[]> {
  const data = await stratzQuery<{
    stratz?: {
      search?: {
        players?: Array<{ id?: number | null; name?: string | null }> | null
      } | null
    } | null
  }>(
    `query ($query: String!, $take: Int!) {
      stratz {
        search(request: { query: $query, take: $take }) {
          players { id name }
        }
      }
    }`,
    { query, take },
  )
  const players = data.stratz?.search?.players ?? []
  return players
    .filter((p): p is { id: number; name?: string | null } => typeof p.id === 'number')
    .map((p) => ({
      accountId: p.id,
      personaname: p.name ?? `Игрок ${p.id}`,
      avatarfull: null,
      lastMatchTime: null,
    }))
}

// ---------- Справочник героев ----------

/** Картинки героев лежат локально в public/heroes (снимок Valve CDN) */
const HERO_IMG_BASE = '/heroes'
/** Версия формата кэша героев — при изменении URL картинок нужно увеличить */
const HEROES_CACHE_VERSION = 2

interface HeroCacheBox {
  t: number
  v: number
  data: HeroInfo[]
}

/**
 * Список героев через константы STRATZ: id, название (с локализацией по
 * Accept-Language) и картинка. Кэшируется в localStorage на неделю.
 */
export async function fetchHeroes(fresh = false): Promise<HeroInfo[]> {
  const cacheKey = STORAGE_KEYS.heroes
  if (!fresh) {
    const box = loadJSON<HeroCacheBox | null>(cacheKey, null)
    if (
      box &&
      box.v === HEROES_CACHE_VERSION &&
      Date.now() - box.t < HEROES_TTL_MS
    ) {
      return box.data
    }
  }

  const data = await stratzQuery<{
    constants?: {
      heroes?: Array<{
        id?: number | null
        name?: string | null
        shortName?: string | null
        displayName?: string | null
        language?: { displayName?: string | null } | null
      }> | null
    } | null
  }>(
    `query {
      constants {
        heroes {
          id
          name
          shortName
          displayName
          language { displayName }
        }
      }
    }`,
  )

  const heroes: HeroInfo[] = (data.constants?.heroes ?? [])
    .filter((h): h is { id: number; name: string | null; shortName?: string | null; displayName?: string | null; language?: { displayName?: string | null } | null } => typeof h.id === 'number')
    .map((h) => {
      const slug =
        h.shortName || (h.name ? h.name.replace(/^npc_dota_hero_/, '') : '')
      return {
        id: h.id,
        localizedName: h.language?.displayName || h.displayName || `Герой ${h.id}`,
        img: slug ? `${HERO_IMG_BASE}/${slug}.png` : '',
      }
    })

  saveJSON(cacheKey, { t: Date.now(), v: HEROES_CACHE_VERSION, data: heroes })
  return heroes
}

// ---------- Полная статистика игрока из STRATZ ----------

interface StratzPlayerResponse {
  matchCount?: number | null
  winCount?: number | null
  behaviorScore?: number | null
  ranks?: Array<{ rank?: number | null; asOfDateTime?: number | null }> | null
  steamAccount?: {
    name?: string | null
    avatar?: string | null
    countryCode?: string | null
    seasonLeaderboardRank?: number | null
  } | null
  heroesPerformance?: Array<{
    heroId?: number | null
    winCount?: number | null
    matchCount?: number | null
  }> | null
  matches?: Array<{
    id?: number | null
    didRadiantWin?: boolean | null
    durationSeconds?: number | null
    startDateTime?: number | null
    players?: Array<{
      playerSlot?: number | null
      isRadiant?: boolean | null
      heroId?: number | null
      kills?: number | null
      deaths?: number | null
      assists?: number | null
      numLastHits?: number | null
      goldPerMinute?: number | null
      experiencePerMinute?: number | null
      heroDamage?: number | null
      heroHealing?: number | null
      towerDamage?: number | null
      position?: string | null
      isVictory?: boolean | null
      numDenies?: number | null
      networth?: number | null
      level?: number | null
      imp?: number | null
      lane?: string | null
      role?: string | null
      roleBasic?: string | null
      leaverStatus?: string | null
    }> | null
  }> | null
}

// STRATZ отдаёт leaverStatus строкой enum-имени (LEAVER_STATUS_*).
// Числовые значения соответствуют Dota 2 DOTALeaverStatus_t:
//   0 NONE, 1 DISCONNECTED, 2 DISCONNECTED_TOO_LONG, 3 ABANDONED,
//   4 AFK, 5 NEVER_CONNECTED, 6 NEVER_CONNECTED_TOO_LONG.
const LEAVER_STATUS_BY_ENUM: Record<string, number> = {
  LEAVER_STATUS_NONE: 0,
  LEAVER_STATUS_DISCONNECTED: 1,
  LEAVER_STATUS_DISCONNECTED_TOO_LONG: 2,
  LEAVER_STATUS_ABANDONED: 3,
  LEAVER_STATUS_AFK: 4,
  LEAVER_STATUS_NEVER_CONNECTED: 5,
  LEAVER_STATUS_NEVER_CONNECTED_TOO_LONG: 6,
}

function mapLeaverStatus(value: unknown): number {
  if (typeof value === 'string') return LEAVER_STATUS_BY_ENUM[value] ?? 0
  if (typeof value === 'number') return value
  return 0
}

function mapPosition(value: unknown): Role | null {
  if (typeof value !== 'string') return null
  const match = /^POSITION_([1-5])$/.exec(value)
  return match ? (Number(match[1]) as Role) : null
}

const PLAYER_STATS_QUERY = `query ($id: Long!, $take: Int!) {
  player(steamAccountId: $id) {
    matchCount
    winCount
    behaviorScore
    ranks { rank asOfDateTime }
    steamAccount { name avatar countryCode seasonLeaderboardRank }
    heroesPerformance(take: ${HEROES_TAKE}) { heroId winCount matchCount }
    matches(request: { take: $take }) {
      id
      didRadiantWin
      durationSeconds
      startDateTime
      players(steamAccountId: $id) {
        playerSlot
        isRadiant
        heroId
        kills
        deaths
        assists
        numLastHits
        goldPerMinute
        experiencePerMinute
        heroDamage
        heroHealing
        towerDamage
        position
        lane
        role
        roleBasic
        isVictory
        numDenies
        networth
        level
        imp
        leaverStatus
      }
    }
  }
}`

/**
 * Полная статистика игрока из STRATZ — единственного источника данных.
 * Формат результата универсален, поэтому формула рейтинга и балансировка
 * работают без изменений.
 */
export async function fetchPlayerStatsStratz(
  accountId: number,
  opts: { fresh?: boolean; take?: number } = {},
): Promise<PlayerStats> {
  const data = await stratzQuery<{ player?: StratzPlayerResponse | null }>(
    PLAYER_STATS_QUERY,
    { id: accountId, take: opts.take ?? MATCHES_TAKE },
  )
  const player = data.player
  if (!player) {
    throw new StratzError('STRATZ не вернул данные игрока')
  }

  const matchCount = player.matchCount ?? 0
  const winCount = player.winCount ?? 0

  // Свежайший ранк по дате; кодировка совпадает с rank_tier (tier*10 + звёзды)
  let rankTier: number | null = null
  let rankAsOf = -1
  for (const entry of player.ranks ?? []) {
    if (typeof entry.rank === 'number' && (entry.asOfDateTime ?? 0) > rankAsOf) {
      rankAsOf = entry.asOfDateTime ?? 0
      rankTier = entry.rank
    }
  }

  const heroes: HeroPlayed[] = (player.heroesPerformance ?? [])
    .filter((h) => typeof h.heroId === 'number' && (h.matchCount ?? 0) > 0)
    .map((h) => ({
      heroId: h.heroId as number,
      games: h.matchCount ?? 0,
      win: h.winCount ?? 0,
    }))
    .sort((a, b) => b.games - a.games)

  const recentMatches: RecentMatch[] = (player.matches ?? [])
    .filter((m) => typeof m.id === 'number')
    .map((m) => {
      const pm = m.players?.[0] ?? null
      return {
        matchId: m.id as number,
        heroId: pm?.heroId ?? 0,
        startTime: m.startDateTime ?? 0,
        duration: m.durationSeconds ?? 0,
        kills: pm?.kills ?? 0,
        deaths: pm?.deaths ?? 0,
        assists: pm?.assists ?? 0,
        goldPerMin: pm?.goldPerMinute ?? 0,
        xpPerMin: pm?.experiencePerMinute ?? 0,
        heroDamage: pm?.heroDamage ?? 0,
        heroHealing: pm?.heroHealing ?? 0,
        towerDamage: pm?.towerDamage ?? 0,
        lastHits: pm?.numLastHits ?? 0,
        radiantWin: m.didRadiantWin === true,
        position: mapPosition(pm?.position),
        lane: pm?.lane ?? null,
        role: pm?.role ?? null,
        roleBasic: pm?.roleBasic ?? null,
        isVictory: pm?.isVictory ?? null,
        denies: pm?.numDenies ?? 0,
        networth: pm?.networth ?? null,
        level: pm?.level ?? null,
        imp: pm?.imp ?? null,
        // Семантика слота: radiant 0..4, dire 128..132 (важно для формулы)
        playerSlot: pm?.isRadiant ? 0 : 128,
        gameMode: 0,
        leaverStatus: mapLeaverStatus(pm?.leaverStatus),
      }
    })
    .filter((m) => m.heroId > 0)

  const steam64 = steamId64FromAccount(accountId)
  const leaderboardRank = player.steamAccount?.seasonLeaderboardRank

  return {
    profile: {
      accountId,
      personaname: player.steamAccount?.name ?? `Игрок ${accountId}`,
      name: null,
      avatarfull: player.steamAccount?.avatar ?? null,
      steamid: steam64,
      profileurl: `https://steamcommunity.com/profiles/${steam64}`,
      loccountrycode: player.steamAccount?.countryCode ?? null,
      rankTier,
      leaderboardRank: typeof leaderboardRank === 'number' && leaderboardRank > 0 ? leaderboardRank : null,
    },
    wl: { win: winCount, lose: Math.max(0, matchCount - winCount) },
    heroes,
    recentMatches,
    behaviorScore: player.behaviorScore ?? null,
  }
}
