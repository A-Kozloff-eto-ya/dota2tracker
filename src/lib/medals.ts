// Расшифровка rank_tier → медаль, звёзды, иконка
// rank_tier = tier*10 + stars, где tier: 1 Herald .. 8 Immortal

export interface MedalInfo {
  tier: number // 0 — не калиброван
  stars: number
  label: string
  iconUrl: string
}

const MEDAL_NAMES: Record<number, string> = {
  1: 'Рекрут',
  2: 'Страж',
  3: 'Рыцарь',
  4: 'Архонт',
  5: 'Легенда',
  6: 'Древний',
  7: 'Божество',
  8: 'Бессмертие',
}

const ICON_BASE = 'https://www.opendota.com/assets/images/dota2/rank_icons'

export function medalFromRankTier(rankTier: number | null | undefined): MedalInfo {
  if (rankTier == null || rankTier <= 0) {
    return { tier: 0, stars: 0, label: 'Не калиброван', iconUrl: `${ICON_BASE}/rank_icon_0_0.svg` }
  }
  const tier = Math.min(8, Math.max(1, Math.floor(rankTier / 10)))
  const stars = tier >= 8 ? 0 : Math.min(5, Math.max(0, rankTier % 10))
  const base = MEDAL_NAMES[tier] ?? `Медаль ${tier}`
  const label = tier >= 8 ? base : `${base} ${stars}`
  return { tier, stars, label, iconUrl: `${ICON_BASE}/rank_icon_${tier}_${stars}.svg` }
}

export const ROLE_NAMES: Record<number, string> = {
  1: 'Керри',
  2: 'Мид',
  3: 'Оффлейн',
  4: 'Саппорт',
  5: 'Хард-сап',
}
