// Формула персонального рейтинга
//
//   Rating = ( wTier·TierScore + wPerf·PerfScore + wAct·ActivityScore ) / Σw
//
// Итог округляется до целого числа двузначной шкалы 1..100. Все три компоненты —
// числа 0..100. Если какая-то компонента недоступна (приватный профиль, нет
// матчей), её вес перераспределяется между остальными.

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
  recentMatchesCount: 15,
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

/** Числовые id неклассических режимов Dota 2 (см. GameMode): Турбо, Ability
 *  Draft, ARDM, Solo Mid. Аномальную статистику этих режимов не учитываем. */
const NON_CLASSIC_MODE_IDS = new Set([18, 20, 21, 23])
/** Официальный id Турбо-режима */
const TURBO_MODE_ID = 23

/** Матч проходит фильтр «классической» игры: не Турбо и не Ability Draft/ARDM. */
export function isClassicMatch(match: RecentMatch): boolean {
  if (match.isTurbo === true) return false
  if (match.gameMode === TURBO_MODE_ID) return false
  if (match.gameMode != null && NON_CLASSIC_MODE_IDS.has(match.gameMode)) return false
  return true
}

/**
 * Веса формулы с учётом приватности профиля.
 *
 * Приватный профиль в STRATZ: `rank_tier` публичен, но массив матчей пуст
 * (или null). В этом случае Perf и Activity недоступны — весь вес уходит
 * на TierScore, и игрок оценивается исключительно по медали.
 */
export function effectiveWeights(
  recentMatches: RecentMatch[] | null | undefined,
  weights: RatingConfig['weights'],
): { tier: number; perf: number; activity: number } {
  const hasMatches = Array.isArray(recentMatches) && recentMatches.length > 0
  if (!hasMatches) {
    return { tier: 1, perf: 0, activity: 0 }
  }
  return {
    tier: Math.max(0, weights.tier),
    perf: Math.max(0, weights.perf),
    activity: Math.max(0, weights.activity),
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const toScore = (value: number, good: number) => clamp01(value / good) * 100
const round1 = (x: number) => Math.round(x * 10) / 10

/** Номер медали из rank_tier: 1 Herald … 8 Immortal (null — без медали) */
export function medalTierOf(rankTier: number | null | undefined): number | null {
  if (rankTier == null || rankTier <= 0) return null
  return Math.min(8, Math.max(1, Math.floor(rankTier / 10)))
}

/** Матчи для оценки формы и эталонов: без ливеров, без Турбо/Ability Draft,
 * при позиции — только на ней, и не старше окна актуальности
 * (recencyMonths, 0 — без ограничения). */
export function positionMatches(
  matches: RecentMatch[] | null | undefined,
  position?: Role | null,
  recencyMonths = 0,
  nowMs = Date.now(),
): RecentMatch[] {
  if (!Array.isArray(matches)) return []
  const cutoffMs =
    recencyMonths > 0 ? nowMs - recencyMonths * 30 * 24 * 60 * 60 * 1000 : 0
  return matches
    // Исключаем неклассические режимы (Турбо, Ability Draft, ARDM…):
    // аномальная статистика не должна искажать рейтинг обычных 5v5.
    .filter(isClassicMatch)
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

/** PerfScore: только относительные и командные метрики последних N матчей —
 *  средний KDA ((K + A) / Max(1, D), kill'ы и assist'ы равнозначны) и винрейт.
 *  Абсолютные GPM/XPM/DPM исключены: они дискриминируют саппортов (позиции 4/5).
 *  `poolThresholds` — пороги из эталонов пула (перекрывают фиксированные). */
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
    gpmScore: null,
    xpm: Math.round(agg.xpPerMin),
    xpmScore: null,
    dpm: Math.round(agg.damagePerMin),
    dpmScore: null,
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

const PERF_WEIGHTS = { kda: 0.7, winrate: 0.3 } as const

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
  // Приватный профиль: rank_tier публичен, но матчи отсутствуют
  // (пустой массив или null). Рейтинг строится только на медали.
  const isPrivate =
    totalGames === 0 &&
    (!Array.isArray(stats.recentMatches) || stats.recentMatches.length === 0)
  const recentCount = positionMatches(
    stats.recentMatches,
    position,
    config.recencyMonths,
  ).length
  // У приватного профиля нет данных о форме — флаг inactive не применяется,
  // иначе медаль нельзя было бы оценить вовсе.
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

  // Динамическое переопределение весов: приватный профиль → 100% Tier.
  // Используем именно классические матчи после фильтров: если у игрока есть
  // матчи, но все отфильтровались (например, только Турбо в окне), Perf
  // недоступен — вес должен уйти в Tier, как у приватного профиля, иначе
  // такой игрок получит rating=null, а скрытый — рейтинг (несимметрия).
  const weights = effectiveWeights(
    positionMatches(stats.recentMatches, position, config.recencyMonths),
    config.weights,
  )
  const parts: Array<{ key: 'tier' | 'perf' | 'activity'; score: number | null; weight: number }> = [
    { key: 'tier', score: tier, weight: weights.tier },
    { key: 'perf', score: perfScore, weight: weights.perf },
    { key: 'activity', score: activityScore, weight: weights.activity },
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
    // Двузначная шкала: целое число 1..100 (даже нулевой результат даёт 1 очко)
    rating = Math.min(100, Math.max(1, Math.round(base)))
    for (const p of available) {
      contributions[p.key] = Math.round(((p.score as number) * p.weight) / weightSum)
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
