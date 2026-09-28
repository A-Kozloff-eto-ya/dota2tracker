// Клиент STRATZ GraphQL API (основной источник данных о матчах/героях).
// Ходит напрямую на api.stratz.com — у STRATZ есть CORS (access-control-allow-origin: *),
// облачный фильтр пропускает запросы с браузерным клиентом.
// Ключ: stratz.com → войти через Steam → страница API.

import { steamId64FromAccount } from '@/api/steam'
import { getStratzApiKey } from '@/lib/storage'
import type { HeroPlayed, PlayerStats, RecentMatch, SearchEntry } from '@/types'

const STRATZ_GRAPHQL = 'https://api.stratz.com/graphql'
const MATCHES_TAKE = 50
const HEROES_TAKE = 126

export class StratzError extends Error {}

interface GraphQLResponse<T> {
  data?: T | null
  errors?: Array<{ message?: string }>
}

async function stratzQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const apiKey = getStratzApiKey()
  if (!apiKey) {
    throw new StratzError('Не задан STRATZ API ключ (настройки приложения)')
  }

  const res = await fetch(STRATZ_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  })

  if (res.status === 401 || res.status === 403) {
    throw new StratzError('STRATZ отклонил ключ — проверьте STRATZ API ключ в настройках')
  }
  if (res.status === 429) {
    throw new StratzError('Превышен лимит запросов STRATZ — подождите немного')
  }
  if (!res.ok) {
    throw new StratzError(`Ошибка STRATZ API (${res.status})`)
  }

  const json = (await res.json()) as GraphQLResponse<T>
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

/** Поиск игроков по нику Steam-профиля (OpenDota ищет только по Dota-нику) */
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
      source: 'stratz' as const,
    }))
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
      leaverStatus?: string | null
    }> | null
  }> | null
}

const LEAVER_STATUS_BY_ENUM: Record<string, number> = {
  LEAVER_STATUS_NONE: 0,
  LEAVER_STATUS_LEFT_SAFE: 1,
  LEAVER_STATUS_AFK: 2,
  LEAVER_STATUS_DISCONNECTED: 3,
  LEAVER_STATUS_NEVER_CONNECTED: 3,
  LEAVER_STATUS_LEAVER: 4,
}

function mapLeaverStatus(value: unknown): number {
  return typeof value === 'string' ? (LEAVER_STATUS_BY_ENUM[value] ?? 0) : 0
}

const PLAYER_STATS_QUERY = `query ($id: Long!, $take: Int!) {
  player(steamAccountId: $id) {
    matchCount
    winCount
    behaviorScore
    ranks { rank asOfDateTime }
    steamAccount { name avatar countryCode }
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
        leaverStatus
      }
    }
  }
}`

/**
 * Полная статистика игрока из STRATZ — основного источника данных.
 * Формат результата идентичен OpenDota-клиенту, поэтому формула рейтинга
 * и балансировка работают без изменений.
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

  // Свежайший ранк по дате; кодировка rank_tier совпадает с OpenDota (tier*10 + звёзды)
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
        // OpenDota-семантика слота: radiant 0..4, dire 128..132 (важно для формулы)
        playerSlot: pm?.isRadiant ? 0 : 128,
        gameMode: 0,
        leaverStatus: mapLeaverStatus(pm?.leaverStatus),
      }
    })
    .filter((m) => m.heroId > 0)

  const steam64 = steamId64FromAccount(accountId)

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
      leaderboardRank: null,
      computedMmr: null,
    },
    wl: { win: winCount, lose: Math.max(0, matchCount - winCount) },
    heroes,
    recentMatches,
    behaviorScore: player.behaviorScore ?? null,
  }
}
