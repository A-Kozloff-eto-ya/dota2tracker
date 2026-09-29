// Доменные типы Dota2Tracker

export interface PlayerProfile {
  accountId: number
  personaname: string
  /** Про-ник (если есть) */
  name: string | null
  avatarfull: string | null
  steamid: string | null
  profileurl: string | null
  loccountrycode: string | null
  /** Публичная медаль: tier*10 + звёзды (например 80 = Immortal) */
  rankTier: number | null
  /** Место в лидерборде (только топ Immortal) */
  leaderboardRank: number | null
}

export interface PlayerWl {
  win: number
  lose: number
}

export interface HeroPlayed {
  heroId: number
  games: number
  win: number
}

export interface RecentMatch {
  matchId: number
  heroId: number
  startTime: number
  duration: number
  kills: number
  deaths: number
  assists: number
  goldPerMin: number
  xpPerMin: number
  heroDamage: number
  heroHealing: number
  towerDamage: number
  lastHits: number
  radiantWin: boolean
  playerSlot: number
  gameMode: number
  leaverStatus: number
  position?: Role | null
  lane?: string | null
  role?: string | null
  roleBasic?: string | null
  isVictory?: boolean | null
  denies?: number
  networth?: number | null
  level?: number | null
  imp?: number | null
}

export interface PlayerStats {
  profile: PlayerProfile
  wl: PlayerWl
  heroes: HeroPlayed[]
  recentMatches: RecentMatch[]
  /** Behavior score (доступен только через STRATZ) */
  behaviorScore?: number | null
}

export interface TrackedPlayer {
  accountId: number
  personaname: string
  avatarfull: string | null
  addedAt: number
  roles: PlayerRole[]
}

export type PlayerRole = 'carry' | 'mid' | 'offlane' | 'soft_support' | 'hard_support'

export type PlayerStatus = 'idle' | 'loading' | 'loaded' | 'error'

export interface RatingThresholds {
  /** KDA, который считается «идеальным» (даёт 100 очков шкалы) */
  kda: number
  /** Средний GPM «идеала» */
  gpm: number
  /** Средний XPM «идеала» */
  xpm: number
  /** Урон по героям в минуту «идеала» */
  dpm: number
  /** Число матчей, дающее полную «уверенность» в статистике */
  sampleGames: number
  /** Число уникальных героев для 100% пула */
  heroPool: number
}

export interface RatingConfig {
  /** Веса компонент формулы (нормализуются автоматически) */
  weights: { tier: number; perf: number; activity: number }
  /** Верхняя граница шкалы рейтинга (по умолчанию 10 000) */
  scaleMax: number
  /** Сколько последних матчей брать для оценки формы */
  recentMatchesCount: number
  thresholds: RatingThresholds
}

export interface PerfDetails {
  kda: number | null
  kdaScore: number | null
  gpm: number | null
  gpmScore: number | null
  xpm: number | null
  xpmScore: number | null
  dpm: number | null
  dpmScore: number | null
  recentWinrate: number | null
  recentWinrateScore: number | null
  sampleSize: number
}

export interface ActivityDetails {
  totalGames: number
  winrate: number | null
  winrateScore: number | null
  confidence: number
  heroPool: number | null
  heroPoolScore: number | null
}

export interface PlayerEvaluation {
  /** Итоговый рейтинг в диапазоне 0..scaleMax (null — недостаточно данных) */
  rating: number | null
  tierScore: number | null
  perfScore: number | null
  activityScore: number | null
  /** Вклад каждой компоненты в итоговый рейтинг (в очках шкалы) */
  contributions: { tier: number | null; perf: number | null; activity: number | null }
  perf: PerfDetails
  activity: ActivityDetails
}

export interface RatedPlayer {
  player: TrackedPlayer
  stats: PlayerStats | null
  status: PlayerStatus
  error: string | null
  /** Когда статистика была загружена (мс) */
  fetchedAt: number | null
  evaluation: PlayerEvaluation | null
}

export interface SearchEntry {
  accountId: number
  personaname: string
  avatarfull: string | null
  lastMatchTime: string | null
}

export type Role = 1 | 2 | 3 | 4 | 5

export interface BalancePlayer {
  accountId: number
  rating: number
  role: Role | null
  allowedRoles: Role[]
}

export interface BalanceTeam {
  index: number
  size: number
  players: BalancePlayer[]
  total: number
  avg: number
  violations: number
}

export interface BalanceResult {
  teams: BalanceTeam[]
  /** Разница между лучшей и худшей командой по среднему рейтингу */
  spread: number
  violations: number
  /** Найдено точным перебором */
  exact: boolean
  /** Сколько всего существует разбиений (заполняется только точным перебором) */
  variantCount?: number
}

export interface HeroInfo {
  id: number
  localizedName: string
  img: string
}
