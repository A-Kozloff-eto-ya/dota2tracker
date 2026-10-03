// Балансировка равносильных команд
//
// Задача: разбить пул игроков на k команд так, чтобы средние рейтинги
// команд были максимально близки (и, опционально, не дублировались роли).
//
// Гарантии:
// - пул всегда сортируется по финальному рейтингу (от высшего к низшему)
// - топ-2 игрока всегда разносятся в противоположные команды (Team A/B)
// - при respectRoles в функцию качества добавлен штраф за концентрацию
//   игроков одной роли в одной команде
//
// - k = 2 и n ≤ 18: гарантированно точный перебор разбиений
// - иначе: снейк-драфт + локальная оптимизация обменами с рестартами

import type { BalancePlayer, BalanceResult, BalanceTeam, Role } from '@/types'

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

const ALL_ROLES: Role[] = [1, 2, 3, 4, 5]

function assignRoles(
  players: BalancePlayer[],
  respectRoles: boolean,
): { players: BalancePlayer[]; missing: number } {
  if (!respectRoles) {
    return { players: players.map((player) => ({ ...player })), missing: 0 }
  }

  const owners = new Map<Role, number>()

  function claim(playerIndex: number, seen: Set<Role>): boolean {
    const allowed = players[playerIndex].allowedRoles.length > 0
      ? players[playerIndex].allowedRoles
      : ALL_ROLES
    for (const role of allowed) {
      if (seen.has(role)) continue
      seen.add(role)
      const owner = owners.get(role)
      if (owner == null || claim(owner, seen)) {
        owners.set(role, playerIndex)
        return true
      }
    }
    return false
  }

  const order = players
    .map((player, index) => ({ index, count: player.allowedRoles.length || ALL_ROLES.length }))
    .sort((a, b) => a.count - b.count)
  let matched = 0
  for (const { index } of order) {
    if (claim(index, new Set())) matched += 1
  }

  const assigned = new Map<number, Role>()
  for (const [role, playerIndex] of owners) assigned.set(playerIndex, role)
  return {
    players: players.map((player, index) => ({ ...player, role: assigned.get(index) ?? null })),
    missing: players.length - matched,
  }
}

/** Штраф за концентрацию одной роли в команде при respectRoles:
 *  каждое «дублирование» роли внутри команды (сверх первой) стоит так же,
 *  как единица violations, и умножается на ROLE_DUP_PENALTY. */
const ROLE_DUP_PENALTY = 100

/** Штраф за концентрацию топовых игроков («коров») в одной команде:
 *  для каждой пары топ-N игроков, оказавшейся вместе, добавляется разрыв
 *  их рейтингов — чем сильнее «коровы» соседствуют, тем хуже вариант. */
function topPairPenalty(teams: BalancePlayer[][]): number {
  const all = teams.flat().sort((a, b) => b.rating - a.rating)
  const topCount = Math.min(4, all.length)
  const top = all.slice(0, topCount)
  let penalty = 0
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      if (teamIndexOf(teams, top[i]) === teamIndexOf(teams, top[j])) {
        penalty += top[i].rating - top[j].rating + 1
      }
    }
  }
  return penalty
}

function teamIndexOf(teams: BalancePlayer[][], player: BalancePlayer): number {
  return teams.findIndex((team) => team.some((p) => p.accountId === player.accountId))
}

/** Число игроков одной и той же роли внутри одной команды (сверх первой). */
function roleDuplicationCount(teams: BalancePlayer[][]): number {
  return teams.reduce((sum, team) => sum + countRoleDuplicates(team), 0)
}

function rawScore(teams: BalancePlayer[][], respectRoles: boolean): number {
  const avgs = teams.map(
    (players) =>
      players.reduce((sum, p) => sum + p.rating, 0) / Math.max(1, players.length),
  )
  const spread = Math.max(...avgs) - Math.min(...avgs)
  const violations = respectRoles
    ? teams.reduce((sum, players) => sum + assignRoles(players, true).missing, 0)
    : 0
  // Топ-игроки не должны «стаяться» в одной команде, даже если средние равны
  const topPenalty = topPairPenalty(teams)
  // При учёте позиций — штраф за матчинг игроков одной роли в одной команде
  const rolePenalty = respectRoles ? roleDuplicationCount(teams) * ROLE_DUP_PENALTY : 0
  return spread + violations * 10000 + topPenalty + rolePenalty
}

/** Отсортировать пул по финальному рейтингу (от высшего к низшему) —
 *  обязательный шаг перед драфтом/перебором. */
function byRatingDesc(players: BalancePlayer[]): BalancePlayer[] {
  return [...players].sort((a, b) => b.rating - a.rating)
}

/** Число дубликатов ролей внутри команды (сверх первой) — часть violations */
export function countRoleDuplicates(team: BalancePlayer[]): number {
  const counts = new Map<Role, number>()
  for (const p of team) {
    if (p.role == null) continue
    counts.set(p.role, (counts.get(p.role) ?? 0) + 1)
  }
  let duplicates = 0
  for (const count of counts.values()) {
    if (count > 1) duplicates += count - 1
  }
  return duplicates
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
    const assignment = assignRoles(team.players, respectRoles)
    const players = assignment.players
    const total = players.reduce((sum, p) => sum + p.rating, 0)
    const avg = players.length > 0 ? total / players.length : 0
    // violations включают и игроков без назначенной роли, и дубликаты ролей:
    // раньше дубликаты не попадали в результат, и UI видел неполную картину
    const violations = respectRoles
      ? assignment.missing + countRoleDuplicates(players)
      : 0
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
  // Пул всегда отсортирован по рейтингу (от высшего к низшему)
  const pool = byRatingDesc(players)
  const firstSize = sizes[0]
  // Топ-2 игрока всегда разносятся в противоположные команды:
  // №1 закреплён в Team A, №2 — в Team B.
  const pinnedA = pool[0]
  const pinnedB = pool.length > 1 ? pool[1] : null
  const rest = pool.slice(pinnedB ? 2 : 1)
  const restSize = firstSize - 1 // pinnedA уже в A

  // Перебираем разбиения остатка (с дедупликацией по битам: первый игрок
  // остатка всегда в команде A — каждое неупорядоченное разбиение встречается
  // ровно один раз)
  const candidates: Array<{ mask: number; score: number }> = []
  const m = rest.length
  for (let mask = 0; mask < 1 << m; mask++) {
    if (popcount(mask) !== restSize) continue
    if (m > 0 && (mask & 1) === 0) continue
    const teamA: BalancePlayer[] = [pinnedA]
    const teamB: BalancePlayer[] = pinnedB ? [pinnedB] : []
    for (let i = 0; i < m; i++) {
      if ((mask >> i) & 1) teamA.push(rest[i])
      else teamB.push(rest[i])
    }
    candidates.push({ mask, score: rawScore([teamA, teamB], respectRoles) })
  }
  if (candidates.length === 0) return finalizeTeams([], respectRoles)

  // Варианты упорядочены по качеству; variantIndex выбирает «следующий по качеству»
  // (по кругу, если вариантов запросили больше, чем существует)
  candidates.sort((a, b) => a.score - b.score)
  const chosen = candidates[variantIndex % candidates.length]

  const teamA: BalancePlayer[] = [pinnedA]
  const teamB: BalancePlayer[] = pinnedB ? [pinnedB] : []
  for (let i = 0; i < m; i++) {
    if ((chosen.mask >> i) & 1) teamA.push(rest[i])
    else teamB.push(rest[i])
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
    // Пул строго отсортирован по рейтингу: без случайного шума, чтобы топ-2
    // гарантированно разошлись по противоположным командам на первом ходе.
    const pool = byRatingDesc(players)

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

    // Локальная оптимизация случайными обменами. Обмены принимаются только
    // при строгом улучшении, поэтому 1500 итераций почти не уступают 4000,
    // но не блокируют main thread на секунды для больших пулов.
    for (let iter = 0; iter < 1500; iter++) {
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

  if (distinct.length === 0) {
    // Сюда теоретически невозможно попасть (restarts > 0), но молчаливый
    // возврат пустого разбиения с spread 0 проскочил бы как «валидный»
    throw new Error('Не удалось построить разбиение команд')
  }

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

  if (respectRoles && n % k !== 0) {
    throw new Error('При учёте ролей число игроков должно делиться на число команд')
  }
  if (respectRoles && n / k !== 5) {
    throw new Error('При учёте ролей в каждой команде должно быть ровно 5 игроков')
  }

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
  // Работаем на копиях, чтобы не мутировать предыдущее состояние (React).
  const teams = result.teams.map((team) => ({ ...team, players: [...team.players] }))

  let moved: BalancePlayer | null = null
  for (const team of teams) {
    const index = team.players.findIndex((p) => p.accountId === accountId)
    if (index >= 0) {
      ;[moved] = team.players.splice(index, 1)
      break
    }
  }
  if (!moved) return result

  const target = teams.find((team) => team.index === toIndex)
  if (!target) return result
  target.players.push(moved)

  return { ...finalizeTeams(teams, respectRoles), exact: false }
}
