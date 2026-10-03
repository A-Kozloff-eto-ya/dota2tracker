// Типобезопасная обёртка над localStorage

export const STORAGE_KEYS = {
  players: 'd2t.players',
  config: 'd2t.ratingConfig',
  heroes: 'd2t.heroesCache',
  /** Выделенные в таблице ростера игроки (для распределения по командам) */
  selection: 'd2t.selectedPlayers',
  stats: (id: number) => `d2t.stats.${id}`,
} as const

/** Ключи, оставшиеся от удалённых источников (OpenDota/Steam) — чистим при старте */
const LEGACY_KEYS = ['d2t.apiKey', 'd2t.steamApiKey'] as const

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

/** Удалить ключи, оставшиеся от старых источников данных */
export function clearLegacyKeys(): void {
  for (const key of LEGACY_KEYS) removeKey(key)
}

/**
 * Сбросить регистрационные данные PWA/service worker и кэш браузера.
 * Это помогает при обновлениях, когда старый SW продолжает отдавать устаревший
 * bundle/script даже после деплоя новой версии приложения.
 */
export async function clearServiceWorkers(): Promise<void> {
  if (typeof window === 'undefined') return

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(
        registrations.map(async (registration) => {
          const unregistered = await registration.unregister()
          return unregistered
        }),
      )
    } catch {
      // ignore; service worker support may be unavailable or blocked
    }
  }

  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
    } catch {
      // ignore; cache API may be unavailable or restricted
    }
  }
}
