// Разбор пользовательского ввода: ссылка Steam / SteamID64 / account_id / ник
// + клиенты Steam Web API (через dev-прокси /steamapi)

import {
  STORAGE_KEYS,
  getSteamApiKey,
  loadJSON,
  saveJSON,
} from '@/lib/storage'
import type { PlayerStats, RecentMatch } from '@/types'

const STEAM64_OFFSET = 76561197960265728n
const DEFAULT_STEAM_TTL_MS = 10 * 60 * 1000

export type ParsedPlayerInput =
  | { kind: 'empty' }
  | { kind: 'accountId'; accountId: number; hint: string }
  | { kind: 'vanity'; vanity: string; hint: string }
  | { kind: 'query'; query: string; hint: string }

export function parsePlayerInput(raw: string): ParsedPlayerInput {
  const value = raw.trim()
  if (!value) return { kind: 'empty' }

  // steamcommunity.com/profiles/<steam64>
  const profiles = value.match(/steamcommunity\.com\/profiles\/(\d{7,20})/i)
  if (profiles) {
    return { kind: 'accountId', accountId: accountFromSteam64(profiles[1]), hint: 'Ссылка на профиль Steam' }
  }

  // steamcommunity.com/id/<vanity> — vanity-адрес; резолвится через Steam Web API
  const vanity = value.match(/steamcommunity\.com\/id\/([^/?#]+)/i)
  if (vanity) {
    return { kind: 'vanity', vanity: decodeURIComponent(vanity[1]), hint: 'Vanity-адрес Steam (/id/)' }
  }

  // Чистый SteamID64
  if (/^\d{17}$/.test(value)) {
    return { kind: 'accountId', accountId: accountFromSteam64(value), hint: 'SteamID64' }
  }

  // Формат Steam3: [U:1:123456]
  const steam3 = value.match(/U:1:(\d{1,10})/i)
  if (steam3) {
    return { kind: 'accountId', accountId: Number(steam3[1]), hint: 'SteamID3' }
  }

  // Чистый account_id (32 бита)
  if (/^\d{1,10}$/.test(value)) {
    return { kind: 'accountId', accountId: Number(value), hint: 'Account ID' }
  }

  return { kind: 'query', query: value, hint: 'Поиск по нику' }
}

export function accountFromSteam64(steam64: string): number {
  return Number(BigInt(steam64) - STEAM64_OFFSET)
}

export function steamId64FromAccount(accountId: number): string {
  return (BigInt(accountId) + STEAM64_OFFSET).toString()
}

// ---------- Резолв vanity-адресов через Steam Web API ----------

export class SteamApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'SteamApiError'
    this.status = status
  }
}

/**
 * steamcommunity.com/id/<vanity> → account_id.
 *
 * Приоритет: официальный Steam Web API `ResolveVanityURL` (если задан Steam Web API
 * ключ), иначе — публичный XML-профиль `steamcommunity.com/id/<vanity>?xml=1`
 * через dev-прокси `/steamcommunity` (без ключей; у Steam нет CORS).
 * @returns account_id или null, если профиль не найден
 */
export async function resolveVanity(vanity: string): Promise<number | null> {
  const apiKey = getSteamApiKey()
  if (apiKey) return resolveVanityViaApi(vanity, apiKey)
  return resolveVanityViaXml(vanity)
}

async function resolveVanityViaApi(vanity: string, apiKey: string): Promise<number | null> {
  const url = new URL('/steamapi/ISteamUser/ResolveVanityURL/v1/', window.location.origin)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('vanityurl', vanity)

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (res.status === 403) {
    throw new SteamApiError(403, 'Steam отклонил запрос — проверьте Steam Web API ключ в настройках')
  }
  if (!res.ok) {
    throw new SteamApiError(res.status, `Ошибка Steam API (${res.status})`)
  }

  const data = (await res.json()) as {
    response?: { success?: number; steamid?: string; message?: string }
  }
  const response = data.response
  if (response?.success === 1 && response.steamid) {
    return accountFromSteam64(response.steamid)
  }
  // success 42 — профиль с таким vanity не найден
  return null
}

async function resolveVanityViaXml(vanity: string): Promise<number | null> {
  const url = new URL(
    `/steamcommunity/id/${encodeURIComponent(vanity)}`,
    window.location.origin,
  )
  url.searchParams.set('xml', '1')

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) {
    throw new SteamApiError(res.status, `Steam недоступен (${res.status})`)
  }
  const xml = await res.text()
  const match = xml.match(/<steamID64>(\d{7,20})<\/steamID64>/i)
  return match ? accountFromSteam64(match[1]) : null
}

// ---------- Steam как источник данных игрока (переключатель на карточке) ----------

interface SteamCacheBox<T> {
  t: number
  data: T
}

async function steamApiFetch<T>(
  path: string,
  params: Record<string, string>,
  opts: { ttlMs?: number; fresh?: boolean } = {},
): Promise<T> {
  const apiKey = getSteamApiKey()
  if (!apiKey) {
    throw new SteamApiError(0, 'Не задан Steam Web API ключ (настройки приложения)')
  }

  const url = new URL(`/steamapi${path}`, window.location.origin)
  url.searchParams.set('key', apiKey)
  for (const [param, value] of Object.entries(params)) {
    url.searchParams.set(param, value)
  }

  // Кэш по пути и параметрам (ключ в кэш-ключ не включаем)
  const cacheKey = STORAGE_KEYS.cache(
    `steam:${path}?${new URLSearchParams(Object.entries(params)).toString()}`,
  )
  if (!opts.fresh) {
    const box = loadJSON<SteamCacheBox<T> | null>(cacheKey, null)
    if (box && Date.now() - box.t < (opts.ttlMs ?? DEFAULT_STEAM_TTL_MS)) {
      return box.data
    }
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (res.status === 403) {
    throw new SteamApiError(403, 'Steam отклонил ключ — проверьте Steam Web API ключ в настройках')
  }
  if (!res.ok) {
    throw new SteamApiError(res.status, `Ошибка Steam API (${res.status})`)
  }
  const data = (await res.json()) as T
  saveJSON(cacheKey, { t: Date.now(), data })
  return data
}

/**
 * Статистика игрока из Steam Web API: профиль (ник/аватар/страна) + список
 * последних матчей из GetMatchHistory. Подробных статов (KDA/GPM) в этом
 * API нет — на карточке они отобразятся прочерками.
 */
export async function fetchSteamPlayerStats(
  accountId: number,
  opts: { fresh?: boolean; matches?: number } = {},
): Promise<PlayerStats> {
  const steam64 = steamId64FromAccount(accountId)
  const take = opts.matches ?? 25

  const summary = await steamApiFetch<{
    response?: {
      players?: Array<{
        steamid?: string
        personaname?: string
        avatarfull?: string
        loccountrycode?: string
        profileurl?: string
      }>
    }
  }>('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steam64 }, opts)

  const summaryPlayer = summary.response?.players?.[0] ?? null
  if (!summaryPlayer) {
    throw new SteamApiError(0, 'Steam не вернул профиль — возможно, он скрыт')
  }

  const history = await steamApiFetch<{
    result?: {
      error?: string
      num_results?: number
      matches?: Array<{
        match_id?: number
        radiant_win?: boolean
        duration?: number
        start_time?: number
        game_mode?: number
        players?: Array<{
          account_id?: number
          player_slot?: number
          hero_id?: number
        }>
      }>
    }
  }>(
    '/IDOTA2Match_570/GetMatchHistory/v1/',
    { account_id: String(accountId), matches_requested: String(take) },
    opts,
  )

  if (history.result?.error) {
    throw new SteamApiError(0, `Steam: ${history.result.error}`)
  }

  let wins = 0
  let losses = 0
  const recentMatches: RecentMatch[] = (history.result?.matches ?? [])
    .filter((m) => typeof m.match_id === 'number')
    .map((m) => {
      const own = m.players?.find((pl) => pl.account_id === accountId) ?? null
      const playerSlot = own?.player_slot ?? 0
      const isRadiant = (playerSlot & 0x80) === 0
      const isWin = own != null && m.radiant_win === isRadiant
      if (own != null) {
        if (isWin) wins += 1
        else losses += 1
      }
      return {
        matchId: m.match_id as number,
        heroId: own?.hero_id ?? 0,
        startTime: m.start_time ?? 0,
        duration: m.duration ?? 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        goldPerMin: 0,
        xpPerMin: 0,
        heroDamage: 0,
        heroHealing: 0,
        towerDamage: 0,
        lastHits: 0,
        radiantWin: m.radiant_win === true,
        playerSlot,
        gameMode: m.game_mode ?? 0,
        leaverStatus: 0,
      }
    })

  return {
    profile: {
      accountId,
      personaname: summaryPlayer.personaname ?? `Игрок ${accountId}`,
      name: null,
      avatarfull: summaryPlayer.avatarfull ?? null,
      steamid: summaryPlayer.steamid ?? steam64,
      profileurl:
        summaryPlayer.profileurl ?? `https://steamcommunity.com/profiles/${steam64}`,
      loccountrycode: summaryPlayer.loccountrycode ?? null,
      rankTier: null,
      leaderboardRank: null,
      computedMmr: null,
    },
    // Steam не отдаёт глобальный счётчик — винрейт по загруженному окну матчей
    wl: { win: wins, lose: losses },
    heroes: [],
    recentMatches,
    behaviorScore: null,
  }
}

