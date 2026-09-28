// Балансировка равносильных команд
//
// Задача: разбить пул игроков на k команд так, чтобы средние рейтинги
// команд были максимально близки (и, опционально, не дублировались роли).
//
// - k = 2 и n ≤ 18: гарантированно точный перебор разбиений
// - иначе: снейк-драфт + локальная оптимизация обменами с рестартами

import type { BalancePlayer, BalanceResult, BalanceTeam } from '@/types'

export const MAX_TEAM_COUNT = 6
export const EXACT_SEARCH_LIMIT = 18

function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function roleViolations(players: BalancePlayer[]): number {
  const counts = new Map<number, number>()
  for (const p of players) {
    if (p.role != null) counts.set(p.role, (counts.get(p.role) ?? 0) + 1)
  }
  let violations = 0
  for (const count of counts.values()) {
    if (count > 1) violations += count - 1
  }
  return violations
}

function rawScore(teams: BalancePlayer[][], respectRoles: boolean): number {
  const avgs = teams.map(
    (players) =>
      players.reduce((sum, p) => sum + p.rating, 0) / Math.max(1, players.length),
  )
  const spread = Math.max(...avgs) - Math.min(...avgs)
  let violations = 0
  if (respectRoles) {
    for (const players of teams) violations += roleViolations(players)
  }
  return spread + violations * 10000
}

function popcount(x: number): number {
  let count = 0
  while (x) {
    x &= x - 1
    count++
  }
  return count
}

/** Пересчитать total/avg/violations/spread для готового разбиения */
export function finalizeTeams(teams: BalanceTeam[], respectRoles: boolean): BalanceResult {
  const finished: BalanceTeam[] = teams.map((team) => {
    const players = [...team.players]
    const total = players.reduce((sum, p) => sum + p.rating, 0)
    const avg = players.length > 0 ? total / players.length : 0
    const violations = respectRoles ? roleViolations(players) : 0
    return { ...team, players, total, avg, violations }
  })
  const avgs = finished.map((t) => t.avg)
  const spread = finished.length > 0 ? Math.max(...avgs) - Math.min(...avgs) : 0
  const violations = finished.reduce((sum, t) => sum + t.violations, 0)
  return { teams: finished, spread, violations, exact: false }
}

function exactTwoTeams(
  players: BalancePlayer[],
  sizes: number[],
  respectRoles: boolean,
  variantIndex: number,
): BalanceResult {
  const n = players.length
  const firstSize = sizes[0]

  // Перебираем все разбиения (с дедупликацией по битам: первый игрок всегда
  // в команде A — каждое неупорядоченное разбиение встречается ровно один раз)
  const candidates: Array<{ mask: number; score: number }> = []
  for (let mask = 0; mask < 1 << n; mask++) {
    if (popcount(mask) !== firstSize) continue
    if ((mask & 1) === 0) continue
    const teamA: BalancePlayer[] = []
    const teamB: BalancePlayer[] = []
    for (let i = 0; i < n; i++) {
      if ((mask >> i) & 1) teamA.push(players[i])
      else teamB.push(players[i])
    }
    candidates.push({ mask, score: rawScore([teamA, teamB], respectRoles) })
  }
  if (candidates.length === 0) return finalizeTeams([], respectRoles)

  // Варианты упорядочены по качеству; variantIndex выбирает «следующий по качеству»
  // (по кругу, если вариантов запросили больше, чем существует)
  candidates.sort((a, b) => a.score - b.score)
  const chosen = candidates[variantIndex % candidates.length]

  const teamA: BalancePlayer[] = []
  const teamB: BalancePlayer[] = []
  for (let i = 0; i < n; i++) {
    if ((chosen.mask >> i) & 1) teamA.push(players[i])
    else teamB.push(players[i])
  }
  const result = finalizeTeams(
    [
      { index: 0, size: sizes[0], players: teamA, total: 0, avg: 0, violations: 0 },
      { index: 1, size: sizes[1], players: teamB, total: 0, avg: 0, violations: 0 },
    ],
    respectRoles,
  )
  return { ...result, variantCount: candidates.length }
}

function heuristic(
  players: BalancePlayer[],
  sizes: number[],
  respectRoles: boolean,
  seed: number,
  variantIndex: number,
): BalanceResult {
  const k = sizes.length
  const restarts = 24
  const attempts: Array<{ score: number; teams: BalanceTeam[] }> = []

  for (let restart = 0; restart < restarts; restart++) {
    const rng = mulberry32(seed * 7919 + restart * 104729)
    const pool = [...players]
    pool.sort((a, b) => b.rating - a.rating + (rng() - 0.5) * 1e-3)

    const teams: BalanceTeam[] = sizes.map((size, index) => ({
      index,
      size,
      players: [],
      total: 0,
      avg: 0,
      violations: 0,
    }))

    // Снейк-драфт: 1-2-…-k-k-…-2-1
    let cursor = 0
    const rounds = Math.ceil(players.length / k)
    for (let round = 0; round < rounds; round++) {
      const order = round % 2 === 0 ? teams : [...teams].reverse()
      for (const team of order) {
        if (team.players.length < team.size && cursor < pool.length) {
          team.players.push(pool[cursor++])
        }
      }
    }

    // Локальная оптимизация случайными обменами
    for (let iter = 0; iter < 4000; iter++) {
      const a = teams[Math.floor(rng() * k)]
      const b = teams[Math.floor(rng() * k)]
      if (a.index === b.index || a.players.length === 0 || b.players.length === 0) continue
      const i = Math.floor(rng() * a.players.length)
      const j = Math.floor(rng() * b.players.length)
      const before = rawScore(
        teams.map((team) => team.players),
        respectRoles,
      )
      const fromA = a.players[i]
      a.players[i] = b.players[j]
      b.players[j] = fromA
      const after = rawScore(
        teams.map((team) => team.players),
        respectRoles,
      )
      if (after >= before) {
        // откат
        b.players[j] = a.players[i]
        a.players[i] = fromA
      }
    }

    attempts.push({
      score: rawScore(
        teams.map((team) => team.players),
        respectRoles,
      ),
      teams,
    })
  }

  // Варианты упорядочены по качеству и не повторяются — «Ещё вариант» всегда
  // показывает другой сетап
  attempts.sort((a, b) => a.score - b.score)
  const seen = new Set<string>()
  const distinct: BalanceTeam[][] = []
  for (const attempt of attempts) {
    const signature = attempt.teams
      .map((team) =>
        team.players
          .map((p) => p.accountId)
          .sort((x, y) => x - y)
          .join(','),
      )
      .sort()
      .join('|')
    if (!seen.has(signature)) {
      seen.add(signature)
      distinct.push(attempt.teams)
    }
  }

  if (distinct.length === 0) return finalizeTeams([], respectRoles)

  // Если рестарты сошлись к одному сетапу — для вариантов сверх найденных
  // генерируем детерминированные возмущения лучшего результата
  const chosenTeams =
    variantIndex < distinct.length
      ? distinct[variantIndex]
      : perturb(
          distinct[0],
          1 + (variantIndex % 8),
          mulberry32(seed * 31 + variantIndex * 7919),
        )
  return finalizeTeams(chosenTeams, respectRoles)
}

function perturb(teams: BalanceTeam[], swaps: number, rng: () => number): BalanceTeam[] {
  const copy = teams.map((team) => ({ ...team, players: [...team.players] }))
  const k = copy.length
  for (let s = 0; s < swaps; s++) {
    const a = copy[Math.floor(rng() * k)]
    const b = copy[Math.floor(rng() * k)]
    if (a.index === b.index || a.players.length === 0 || b.players.length === 0) continue
    const i = Math.floor(rng() * a.players.length)
    const j = Math.floor(rng() * b.players.length)
    const moved = a.players[i]
    a.players[i] = b.players[j]
    b.players[j] = moved
  }
  return copy
}

/**
 * Разбить игроков на команды.
 * @param players пул с рейтингами (и опциональными ролями)
 * @param teamCount число команд (2..6)
 * @param respectRoles считать дубли ролей нарушением
 * @param seed базовый сид генератора (для эвристики)
 * @param variantIndex номер варианта: 0 — лучший, 1 — следующий по качеству, …
 *   (для точного перебора варианты циклически повторяются)
 */
export function balanceTeams(
  players: BalancePlayer[],
  teamCount: number,
  respectRoles: boolean,
  seed = 1,
  variantIndex = 0,
): BalanceResult {
  const n = players.length
  const k = Math.max(2, Math.min(MAX_TEAM_COUNT, teamCount))
  if (n < k) throw new Error(`Нужно минимум ${k} игроков`)
  if (players.some((p) => !Number.isFinite(p.rating))) {
    throw new Error('У всех выбранных игроков должен быть рейтинг')
  }

  const base = Math.floor(n / k)
  const extra = n % k
  const sizes = Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0))
  const safeVariant = Math.max(0, variantIndex)

  if (k === 2 && n <= EXACT_SEARCH_LIMIT) {
    const result = exactTwoTeams(players, sizes, respectRoles, safeVariant)
    return { ...result, exact: true }
  }
  return heuristic(players, sizes, respectRoles, seed + safeVariant * 100003, safeVariant)
}

/** Ручной перенос игрока между командами (после DnD) */
export function applyMove(
  result: BalanceResult,
  accountId: number,
  toIndex: number,
  respectRoles: boolean,
): BalanceResult {
  let moved: BalancePlayer | null = null
  const teams = result.teams.map((team) => {
    const found = team.players.find((p) => p.accountId === accountId)
    if (!found) return team
    moved = found
    return { ...team, players: team.players.filter((p) => p.accountId !== accountId) }
  })
  if (!moved) return result

  const target = teams.find((team) => team.index === toIndex)
  if (!target) return result
  target.players.push(moved)

  return { ...finalizeTeams(teams, respectRoles), exact: false }
}
