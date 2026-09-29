// Клиент Steam Web API — используется только для преобразования короткой
// ссылки профиля (steamcommunity.com/id/<имя>) в SteamID64 через
// ISteamUser/ResolveVanityURL. Всё остальное — STRATZ.
//
// Запрос идёт через серверный endpoint /api/steam/resolve, чтобы ключ Steam
// никогда не попадал в клиентскую сборку.

import { accountFromSteam64 } from '@/lib/playerInput'

export class SteamError extends Error {}

/**
 * Преобразовать vanity-имя профиля (например, `shozond` из
 * steamcommunity.com/id/shozond) в Dota account_id.
 * Возвращает null, если профиль не найден.
 */
export async function resolveVanityAccountId(vanity: string): Promise<number | null> {
  let res: Response
  try {
    res = await fetch(`/api/steam/resolve?vanity=${encodeURIComponent(vanity)}`)
  } catch {
    throw new SteamError('Не удалось обратиться к серверу Steam')
  }

  const body = (await res.json().catch(() => null)) as { steamid?: string; error?: string } | null
  if (res.status === 404) return null
  if (!res.ok) {
    throw new SteamError(body?.error ?? `Ошибка Steam API (${res.status})`)
  }
  return body?.steamid ? accountFromSteam64(body.steamid) : null
}
