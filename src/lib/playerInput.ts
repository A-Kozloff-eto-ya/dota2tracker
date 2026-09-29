// Разбор пользовательского ввода: ссылка на профиль / SteamID64 / SteamID3 / account_id / ник
// (только парсинг строк — никаких запросов к Steam)

const STEAM64_OFFSET = 76561197960265728n

export type ParsedPlayerInput =
  | { kind: 'empty' }
  | { kind: 'accountId'; accountId: number; hint: string }
  | { kind: 'vanity'; vanity: string; hint: string }
  | { kind: 'query'; query: string; hint: string }

export function parsePlayerInput(raw: string): ParsedPlayerInput {
  const value = raw.trim()
  if (!value) return { kind: 'empty' }

  // Ссылка вида steamcommunity.com/id/<vanity> — короткое имя профиля,
  // конвертируется в SteamID через Steam Web API (см. src/api/steam.ts)
  const vanity = value.match(/steamcommunity\.com\/id\/([A-Za-z0-9_.-]+)/i)
  if (vanity) {
    return {
      kind: 'vanity',
      vanity: decodeURIComponent(vanity[1]),
      hint: 'Ссылка на профиль',
    }
  }

  // Ссылка вида steamcommunity.com/profiles/<steam64> — просто парсим число
  const profiles = value.match(/steamcommunity\.com\/profiles\/(\d{7,20})/i)
  if (profiles) {
    return {
      kind: 'accountId',
      accountId: accountFromSteam64(profiles[1]),
      hint: 'Ссылка на профиль',
    }
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
