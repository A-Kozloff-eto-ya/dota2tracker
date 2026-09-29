// Типобезопасная обёртка над localStorage

export const STORAGE_KEYS = {
  players: 'd2t.players',
  config: 'd2t.ratingConfig',
  stratzApiKey: 'd2t.stratzApiKey',
  heroes: 'd2t.heroesCache',
  stats: (id: number) => `d2t.stats.${id}`,
  cache: (path: string) => `d2t.cache.${path}`,
} as const

/** Ключи, оставшиеся от удалённых источников (OpenDota/Steam) — чистим при старте */
const LEGACY_KEYS = ['d2t.apiKey', 'd2t.steamApiKey'] as const

const CACHE_PREFIX = 'd2t.cache.'

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // переполнение квоты и т.п. — молча игнорируем
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function clearPrefixed(prefix: string): number {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)
    return doomed.length
  } catch {
    return 0
  }
}

export function clearApiCache(): number {
  return clearPrefixed(CACHE_PREFIX)
}

/** Удалить ключи, оставшиеся от старых источников данных */
export function clearLegacyKeys(): void {
  for (const key of LEGACY_KEYS) removeKey(key)
}

export function getStratzApiKey(): string {
  return getString(STORAGE_KEYS.stratzApiKey)
}

export function setStratzApiKey(value: string): void {
  setString(STORAGE_KEYS.stratzApiKey, value)
}

function getString(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function setString(key: string, value: string): void {
  try {
    const trimmed = value.trim()
    if (trimmed) localStorage.setItem(key, trimmed)
    else localStorage.removeItem(key)
  } catch {
    // ignore
  }
}