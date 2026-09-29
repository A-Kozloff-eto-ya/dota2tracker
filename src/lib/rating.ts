// Формула персонального рейтинга
//
//   Rating = scaleMax · ( wTier·TierScore + wPerf·PerfScore + wAct·ActivityScore ) / Σw
//
// Все три компоненты — числа 0..100. Если какая-то компонента недоступна
// (приватный профиль, нет матчей), её вес перераспределяется между остальными.

import type {
  ActivityDetails,
  BenchmarkThresholds,
  MatchesAggregate,
  PerfDetails,
  PlayerEvaluation,
  PlayerStats,
  PoolBenchmarks,
  RatingConfig,
  RecentMatch,
  Role,
} from '@/types'

export const DEFAULT_RATING_CONFIG: RatingConfig = {
  weights: { tier: 0.5, perf: 0.35, activity: 0.15 },
  scaleMax: 10000,
  recentMatchesCount: 20,
  thresholds: {
    kda: 5,
    gpm: 750,
    xpm: 800,
    dpm: 650,
    sampleGames: 400,
    heroPool: 30,
  },
  scoring: 'pool',
  benchmark: { mode: 'p75', minMatches: 3, rankGap: 2 },
  recencyMonths: 3,
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const toScore = (value: number, good: number) => clamp01(value / good) * 100
const round1 = (x: number) => Math.round(x * 10) / 10

/** Номер медали из rank_tier: 1 Herald … 8 Immortal (null — без медали) */
export function medalTierOf(rankTier: number | null | undefined): number | null {
  if (rankTier == null || rankTier <= 0) return null
  return Math.min(8, Math.max(1, Math.floor(rankTier / 10)))
}

/** Матчи для оценки формы и эталонов: без ливеров, при позиции — только на ней,
 * и не старше окна актуальности (recencyMonths, 0 — без ограничения). */
export function positionMatches(
  matches: RecentMatch[],
  position?: Role | null,
  recencyMonths = 0,
  nowMs = Date.now(),
): RecentMatch[] {
  const cutoffMs =
    recencyMonths > 0 ? nowMs - recencyMonths * 30 * 24 * 60 * 60 * 1000 : 0
  return matches
    // Исключаем ливеров: учитываем только матчи, где игрок доиграл
    // (0 NONE / 1 DISCONNECTED), отбрасывая DISCONNECTED_TOO_LONG,
    // ABANDONED, AFK и NEVER_CONNECTED.
    .filter((m) => m.leaverStatus < 2)
    .filter((m) => position == null || m.position === position)
    .filter((m) => m.startTime * 1000 >= cutoffMs)
}

/** Агрегация метрик по набору матчей — общая для «формы» и эталонов пула */
export function aggregateMatches(matches: RecentMatch[]): MatchesAggregate | null {
  if (matches.length === 0) return null

  let kills = 0, deaths = 0, assists = 0, gold = 0, xp = 0, damage = 0, duration = 0, wins = 0, lastHits = 0
  const imps: number[] = []
  for (const m of matches) {
    kills += m.kills
    deaths += m.deaths
    assists += m.assists
    gold += m.goldPerMin
    xp += m.xpPerMin
    damage += m.heroDamage
    duration += m.duration
    lastHits += m.lastHits
    if (m.imp != null) imps.push(m.imp)
    const isRadiant = (m.playerSlot & 0x80) === 0
    if (m.isVictory ?? (m.radiantWin === isRadiant)) wins += 1
  }

  return {
    count: matches.length,
    kda: (kills + assists) / Math.max(1, deaths),
    goldPerMin: gold / matches.length,
    xpPerMin: xp / matches.length,
    damagePerMin: duration > 0 ? (damage / duration) * 60 : 0,
    winrate: wins / matches.length,
    imp: imps.length > 0 ? imps.reduce((sum, v) => sum + v, 0) / imps.length : null,
    lastHitsPerMin: duration > 0 ? (lastHits / duration) * 60 : 0,
  }
}

/** TierScore: публичная медаль (rank_tier) + бонус лидерборда */
export function tierScoreOf(stats: PlayerStats): number | null {
  const { rankTier, leaderboardRank } = stats.profile
  let score: number | null = null

  const tier = medalTierOf(rankTier)
  if (tier != null && rankTier != null) {
    const stars = Math.min(5, Math.max(0, rankTier % 10))
    if (tier >= 8) {
      // Immortal: базовые 88 очков, дальше усиливается бонусом лидерборда
      score = 88
    } else {
      const position = (tier - 1) + stars / 6 // 0 .. 7.833
      score = (position / 7.833) * 88
    }
    if (leaderboardRank != null && leaderboardRank > 0) {
      // топ-1 → +12, топ-100 → ~+6, топ-1000 → ~+3, топ-10000 → 0
      const bonus = Math.max(0, 12 - 3 * Math.log10(Math.max(1, leaderboardRank)))
      score = Math.min(100, score + bonus)
    }
  }

  return score == null ? null : round1(score)
}

/** PerfScore: агрегаты по последним матчам.
 * `poolThresholds` — пороги из эталонов пула (перекрывают фиксированные). */
export function perfOf(
  stats: PlayerStats,
  config: RatingConfig,
  position?: Role | null,
  poolThresholds?: BenchmarkThresholds | null,
): PerfDetails {
  const matches = positionMatches(stats.recentMatches, position, config.recencyMonths)
    .slice(0, config.recentMatchesCount)
  const agg = aggregateMatches(matches)

  if (!agg) {
    return {
      kda: null, kdaScore: null,
      gpm: null, gpmScore: null,
      xpm: null, xpmScore: null,
      dpm: null, dpmScore: null,
      recentWinrate: null, recentWinrateScore: null,
      sampleSize: 0,
    }
  }

  const th = { ...config.thresholds, ...(poolThresholds ?? {}) }
  return {
    kda: round1(agg.kda),
    kdaScore: round1(toScore(agg.kda, th.kda)),
    gpm: Math.round(agg.goldPerMin),
    gpmScore: round1(toScore(agg.goldPerMin, th.gpm)),
    xpm: Math.round(agg.xpPerMin),
    xpmScore: round1(toScore(agg.xpPerMin, th.xpm)),
    dpm: Math.round(agg.damagePerMin),
    dpmScore: round1(toScore(agg.damagePerMin, th.dpm)),
    recentWinrate: agg.winrate,
    recentWinrateScore: round1(agg.winrate * 100),
    sampleSize: agg.count,
  }
}

/** ActivityScore: общий винрейт + доверие к выборке + размер пула героев */
export function activityOf(stats: PlayerStats, config: RatingConfig): ActivityDetails {
  const totalGames = stats.wl.win + stats.wl.lose
  const th = config.thresholds
  const heroPool = stats.heroes.filter((h) => h.games > 0).length
  const heroPoolScore = clamp01(heroPool / th.heroPool) * 100

  if (totalGames <= 0) {
    return {
      totalGames: 0,
      winrate: null,
      winrateScore: null,
      confidence: 0,
      heroPool: heroPool || null,
      heroPoolScore: heroPool > 0 ? round1(heroPoolScore) : null,
    }
  }

  const winrate = stats.wl.win / totalGames
  const confidence = clamp01(Math.log10(1 + totalGames) / Math.log10(1 + th.sampleGames))
  // Винрейт тянется к 50%, пока выборка мала
  const winrateScore = 50 + (winrate * 100 - 50) * (0.4 + 0.6 * confidence)

  return {
    totalGames,
    winrate,
    winrateScore: round1(winrateScore),
    confidence: round1(confidence * 100),
    heroPool,
    heroPoolScore: round1(heroPoolScore),
  }
}

const PERF_WEIGHTS = { kda: 0.3, gpm: 0.25, xpm: 0.15, dpm: 0.15, winrate: 0.15 } as const

/** Полный расчёт рейтинга игрока.
 * `benchmarks` — эталоны пула: при scoring: 'pool' пороги формы берутся
 * из эталона позиции (или общие, если позиция не выбрана). */
export function evaluatePlayer(
  stats: PlayerStats | null,
  config: RatingConfig,
  position?: Role | null,
  benchmarks?: PoolBenchmarks | null,
): PlayerEvaluation | null {
  if (!stats) return null

  // Мин. свежих матчей для рейтинга (тот же порог, что у эталонов): игрок
  // должен играть в окне, иначе медаль и lifetime-винрейт тащат
  // «титана на пенсии» в топ на паре случайных матчей.
  const totalGames = stats.wl.win + stats.wl.lose
  const isPrivate = totalGames === 0 && stats.recentMatches.length === 0
  const recentCount = positionMatches(
    stats.recentMatches,
    position,
    config.recencyMonths,
  ).length
  const inactive = !isPrivate && recentCount < config.benchmark.minMatches

  const poolBench = config.scoring === 'pool' && benchmarks
    ? (position != null ? benchmarks.byRole[position] : benchmarks.overall)
    : null
  const poolThresholds = poolBench?.thresholds ?? null

  const tier = tierScoreOf(stats)
  const perf = perfOf(stats, config, position, poolThresholds)
  const perfScore =
    perf.sampleSize > 0 && perf.kdaScore != null
      ? round1(
          PERF_WEIGHTS.kda * perf.kdaScore +
            PERF_WEIGHTS.gpm * (perf.gpmScore ?? 0) +
            PERF_WEIGHTS.xpm * (perf.xpmScore ?? 0) +
            PERF_WEIGHTS.dpm * (perf.dpmScore ?? 0) +
            PERF_WEIGHTS.winrate * (perf.recentWinrateScore ?? 0),
        )
      : null

  const activity = activityOf(stats, config)
  const actParts: Array<[number, number]> = []
  if (activity.winrateScore != null) actParts.push([0.5, activity.winrateScore])
  if (activity.totalGames > 0) actParts.push([0.25, activity.confidence])
  if (activity.heroPoolScore != null) actParts.push([0.25, activity.heroPoolScore])
  const actWeight = actParts.reduce((sum, [w]) => sum + w, 0)
  const activityScore =
    actWeight > 0 ? round1(actParts.reduce((sum, [w, v]) => sum + w * v, 0) / actWeight) : null

  const parts: Array<{ key: 'tier' | 'perf' | 'activity'; score: number | null; weight: number }> = [
    { key: 'tier', score: tier, weight: config.weights.tier },
    { key: 'perf', score: perfScore, weight: config.weights.perf },
    { key: 'activity', score: activityScore, weight: config.weights.activity },
  ]

  const available = parts.filter((p) => p.score != null && p.weight > 0)
  const contributions: PlayerEvaluation['contributions'] = {
    tier: null,
    perf: null,
    activity: null,
  }

  let rating: number | null = null
  if (available.length > 0 && !inactive) {
    const weightSum = available.reduce((sum, p) => sum + p.weight, 0)
    const base =
      available.reduce((sum, p) => sum + (p.score as number) * p.weight, 0) / weightSum
    rating = Math.round((base / 100) * config.scaleMax)
    for (const p of available) {
      contributions[p.key] = Math.round(
        ((p.score as number) * p.weight) / weightSum / 100 * config.scaleMax,
      )
    }
  }

  return {
    rating,
    tierScore: tier,
    perfScore,
    activityScore,
    contributions,
    thresholdsSource: poolThresholds ? 'pool' : 'fixed',
    inactive,
    perf,
    activity,
  }
}
