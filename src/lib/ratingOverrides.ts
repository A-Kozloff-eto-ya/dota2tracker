// Ручные переопределения оценок (колонка players.rating_overrides, jsonb)
//
// Значение, заданное вручную, главнее авторасчёта: effectiveEvaluation
// подменяет rating у оценки формулы. Для игрока без статистики (приватный
// профиль, ошибка загрузки) ручное значение становится единственной оценкой —
// собирается минимальная evaluation только с rating.

import type {
  ActivityDetails,
  PerfDetails,
  PlayerEvaluation,
  RatingOverrides,
  Role,
} from '@/types'

export type RatingOverrideScope = 'overall' | Role

const ALL_ROLES: Role[] = [1, 2, 3, 4, 5]

const clampRating = (value: unknown): number | null => {
  const n = typeof value === 'number' ? Math.round(value) : Number.NaN
  return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : null
}

/** Нормализация ручных оценок из произвольного jsonb (ключи ролей приходят
 *  строками, значения могут быть чем угодно). null — переопределений нет. */
export function sanitizeRatingOverrides(value: unknown): RatingOverrides | null {
  if (value == null || typeof value !== 'object') return null
  const raw = value as { overall?: unknown; roles?: unknown }
  const overall = clampRating(raw.overall)
  const roles: Partial<Record<Role, number>> = {}
  if (raw.roles != null && typeof raw.roles === 'object') {
    for (const role of ALL_ROLES) {
      const score = clampRating((raw.roles as Record<string, unknown>)[String(role)])
      if (score != null) roles[role] = score
    }
  }
  const result: RatingOverrides = {}
  if (overall != null) result.overall = overall
  if (Object.keys(roles).length > 0) result.roles = roles
  return Object.keys(result).length > 0 ? result : null
}

/** Ручное значение по scope ('overall' или позиция); null — нет переопределения */
export function overrideFor(
  overrides: RatingOverrides | null | undefined,
  scope: RatingOverrideScope,
): number | null {
  if (overrides == null) return null
  const value = scope === 'overall' ? overrides.overall : overrides.roles?.[scope]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const EMPTY_PERF: PerfDetails = {
  kda: null,
  kdaScore: null,
  gpm: null,
  gpmScore: null,
  xpm: null,
  xpmScore: null,
  dpm: null,
  dpmScore: null,
  recentWinrate: null,
  recentWinrateScore: null,
  sampleSize: 0,
}

const EMPTY_ACTIVITY: ActivityDetails = {
  totalGames: 0,
  winrate: null,
  winrateScore: null,
  confidence: 0,
  heroPool: null,
  heroPoolScore: null,
}

/** Минимальная оценка, когда считать по формуле не из чего (нет статистики) */
export function manualEvaluation(rating: number): PlayerEvaluation {
  return {
    rating,
    tierScore: null,
    perfScore: null,
    activityScore: null,
    contributions: { tier: null, perf: null, activity: null },
    thresholdsSource: 'fixed',
    inactive: false,
    perf: EMPTY_PERF,
    activity: EMPTY_ACTIVITY,
  }
}

/** Оценка с учётом ручного значения: override главнее авторасчёта */
export function effectiveEvaluation(
  evaluation: PlayerEvaluation | null,
  override: number | null,
): PlayerEvaluation | null {
  if (override == null) return evaluation
  if (evaluation) return { ...evaluation, rating: override }
  return manualEvaluation(override)
}