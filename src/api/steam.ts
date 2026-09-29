// Клиент Steam Web API — используется только для преобразования короткой
// ссылки профиля (steamcommunity.com/id/<имя>) в SteamID64 через
// ISteamUser/ResolveVanityURL. Всё остальное — STRATZ.
//
// У Steam Web API нет CORS-заголовков, поэтому запрос идёт через прокси
// /steamapi: в dev — vite.config.ts, на Vercel — rewrite из vercel.json.
// Ключ Steam берётся из окружения сборки (VITE_STEAM_API_KEY).

import { accountFromSteam64 } from '@/lib/playerInput'
import { getSteamApiKey } from '@/lib/storage'

const STEAM_VANITY_RESOLVE = '/steamapi/ISteamUser/ResolveVanityURL/v1/'

export class SteamError extends Error {}

interface ResolveVanityResponse {
  response?: {
    steamid?: string
    success?: number
  }
}

/**
 * Преобразовать vanity-имя профиля (например, `shozond` из
 * steamcommunity.com/id/shozond) в Dota account_id.
 * Возвращает null, если профиль не найден.
 */
export async function resolveVanityAccountId(vanity: string): Promise<number | null> {
  const key = getSteamApiKey()
  if (!key) {
    throw new SteamError('Не задан Steam Web API ключ (VITE_STEAM_API_KEY)')
  }

  let res: Response
  try {
    res = await fetch(
      `${STEAM_VANITY_RESOLVE}?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(vanity)}`,
      { signal: AbortSignal.timeout(10000) },
    )
  } catch {
    throw new SteamError(
      'Не удалось обратиться к Steam Web API — проверьте, что прокси /steamapi настроен',
    )
  }

  if (res.status === 403) {
    throw new SteamError('Steam отклонил ключ — проверьте VITE_STEAM_API_KEY')
  }
  if (!res.ok) {
    throw new SteamError(`Ошибка Steam Web API (${res.status})`)
  }

  const json = (await res.json()) as ResolveVanityResponse
  const response = json.response
  if (response?.success !== 1 || !response.steamid) {
    return null
  }
  return accountFromSteam64(response.steamid)
}


