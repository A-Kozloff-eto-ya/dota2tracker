// Цвет текста по величине рейтинга 1..100 — общий для RatingBadge и таблицы ростера

const TIERS = [
  { max: 25, cls: 'text-slate-300' },
  { max: 40, cls: 'text-emerald-300' },
  { max: 55, cls: 'text-sky-300' },
  { max: 70, cls: 'text-violet-300' },
  { max: 85, cls: 'text-fuchsia-300' },
  { max: Number.POSITIVE_INFINITY, cls: 'text-gold-gradient' },
] as const

/** Класс цвета текста по величине рейтинга */
export function ratingTierClass(rating: number): string {
  const tier = TIERS.find((t) => rating < t.max) ?? TIERS[TIERS.length - 1]
  return tier.cls
}
