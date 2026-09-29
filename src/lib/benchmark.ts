// Эталоны показателей пула игроков
//
// Эталон считается по матчам на позиции внутри окна актуальности
// (RatingConfig.recencyMonths; 0 — весь период загрузки статистики).
// Игрок попадает в расчёт, если сыграл на позиции минимум
// `benchmark.minMatches` матчей за окно.
//
// При `benchmark.rankGap > 0` в расчёт попадают только игроки, чья медаль
// не ниже топ-медали роли минус `rankGap` ступеней (1 Herald … 8 Immortal):
// доминирование в низком ранге не задаёт планку всему пулу. Если среди
// подходящих по матчам игроков нет ни одной публичной медали, охват
// по рангу не применяется.
//
// Режим задаёт агрегат по пулу на каждый показатель:
//   p50 / p75 / p90 — перцентиль, best — лучшее значение в пуле.
//
// Пороги формы (что считать 100/100) выводятся из эталона позиции и
// используются относительным скорингом (RatingConfig.scoring: 'pool').

import { aggregateMatches, medalTierOf, positionMatches } from '@/lib/rating'
import type {
  BenchmarkMetrics,
  BenchmarkMode,
  BenchmarkThresholds,
  MatchesAggregate,
  PlayerStats,
  PoolBenchmarks,
  RatingConfig,
  Role,
  RoleBenchmark,
} from '@/types'

export const BENCHMARK_ROLES: Role[] = [1, 2, 3, 4, 5]

/** Вход пула для расчёта эталонов */
export interface BenchmarkPlayerInput {
  accountId: number
  personaname: string
  stats: PlayerStats | null
}

const PERCENTILE_BY_MODE: Record<Exclude<BenchmarkMode, 'best'>, number> = {
  p50: 50,
  p75: 75,
  p90: 90,
}

/** Перцентиль с линейной интерполяцией по возрастающему массиву */
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null
  if (sortedAsc.length === 1) return sortedAsc[0] ?? null
  const idx = ((sortedAsc.length - 1) * p) / 100
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const lower = sortedAsc[lo]
  const upper = sortedAsc[hi]
  if (lower == null || upper == null) return null
  if (lo === hi) return lower
  return lower + (upper - lower) * (idx - lo)
}

/** Эталонная величина показателя по массиву значений пула */
export function benchmarkValue(values: number[], mode: BenchmarkMode): number | null {
  if (values.length === 0) return null
  if (mode === 'best') return Math.max(...values)
  return percentile([...values].sort((a, b) => a - b), PERCENTILE_BY_MODE[mode])
}

/** Игрок, квалифицировавшийся на роль */
export interface QualifiedPlayer {
  input: BenchmarkPlayerInput
  matches: number
  agg: MatchesAggregate
}

/** Игроки, квалифицировавшиеся на роль: ≥ minMatches матчей на позиции
 *  внутри окна актуальности; при rankGap > 0 — только те, чья медаль
 *  не ниже топ-медали роли минус rankGap ступеней (без медали — мимо,
 *  если в пуле есть хоть один калиброванный игрок). */
export function qualifiedPlayers(
  players: BenchmarkPlayerInput[],
  role: Role | null,
  config: RatingConfig,
): QualifiedPlayer[] {
  const byMatches: QualifiedPlayer[] = []
  for (const input of players) {
    if (!input.stats) continue
    const matches = positionMatches(
      input.stats.recentMatches,
      role,
      config.recencyMonths,
    )
    if (matches.length < config.benchmark.minMatches) continue
    const agg = aggregateMatches(matches)
    if (!agg) continue
    byMatches.push({ input, matches: matches.length, agg })
  }

  const gap = config.benchmark.rankGap
  if (gap > 0) {
    const tiers = byMatches
      .map((q) => medalTierOf(q.input.stats?.profile.rankTier))
      .filter((t): t is number => t != null)
    if (tiers.length > 0) {
      const top = Math.max(...tiers)
      return byMatches.filter((q) => {
        const tier = medalTierOf(q.input.stats?.profile.rankTier)
        return tier != null && top - tier <= gap
      })
    }
  }
  return byMatches
}

function metricValues(players: QualifiedPlayer[], pick: (agg: MatchesAggregate) => number | null): number[] {
  return players
    .map((p) => pick(p.agg))
    .filter((v): v is number => v != null && Number.isFinite(v))
}

/** Эталонные значения всех метрик по квалифицированному пулу */
function metricsOf(players: QualifiedPlayer[], mode: BenchmarkMode): BenchmarkMetrics {
  return {
    kda: benchmarkValue(metricValues(players, (a) => a.kda), mode),
    gpm: benchmarkValue(metricValues(players, (a) => a.goldPerMin), mode),
    xpm: benchmarkValue(metricValues(players, (a) => a.xpPerMin), mode),
    dpm: benchmarkValue(metricValues(players, (a) => a.damagePerMin), mode),
    imp: benchmarkValue(metricValues(players, (a) => a.imp), mode),
    lhpm: benchmarkValue(metricValues(players, (a) => a.lastHitsPerMin), mode),
  }
}

/** Пороги скоринга: эталон позиции, но только если пул не вырожден (≥ 2 игроков) */
function thresholdsOf(metrics: BenchmarkMetrics, playersCount: number): BenchmarkThresholds | null {
  if (playersCount < 2) return null
  const { kda, gpm, xpm, dpm } = metrics
  if (kda == null || gpm == null || xpm == null || dpm == null) return null
  if (kda <= 0 || gpm <= 0 || xpm <= 0 || dpm <= 0) return null
  return { kda, gpm, xpm, dpm }
}

function roleBenchmark(
  players: BenchmarkPlayerInput[],
  role: Role | null,
  config: RatingConfig,
): RoleBenchmark {
  const qualified = qualifiedPlayers(players, role, config)
  const metrics = metricsOf(qualified, config.benchmark.mode)
  const topRankTier = qualified.reduce<number | null>((top, q) => {
    const rt = q.input.stats?.profile.rankTier ?? null
    return rt != null && rt > 0 && (top == null || rt > top) ? rt : top
  }, null)
  return {
    role,
    players: qualified.length,
    matches: qualified.reduce((sum, q) => sum + q.matches, 0),
    topRankTier,
    metrics,
    thresholds: thresholdsOf(metrics, qualified.length),
  }
}

/** Эталоны пула: по каждой позиции + агрегат по всем позициям.
 *  Считаются по матчам внутри окна актуальности (RatingConfig.recencyMonths). */
export function computeBenchmarks(
  players: BenchmarkPlayerInput[],
  config: RatingConfig,
): PoolBenchmarks {
  const byRole = {} as Record<Role, RoleBenchmark>
  for (const role of BENCHMARK_ROLES) {
    byRole[role] = roleBenchmark(players, role, config)
  }
  return { byRole, overall: roleBenchmark(players, null, config) }
}
