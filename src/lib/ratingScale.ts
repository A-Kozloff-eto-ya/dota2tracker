// Калибровка шкалы оценок по ручным «якорям»
//
// Авторасчёт относительный: он зависит от эталонов пула, поэтому числа
// формулы и числа, введённые вручную, живут в разных шкалах. Ручная оценка
// игрока — якорь: «авторасчёт этого игрока на самом деле равен N». Все
// авторасчёты колонки пересчитываются в шкалу якорей кусочно-линейной
// интерполяцией; игрок с ручной оценкой масштаба не меняет — она и есть
// его значение. Остальные поля evaluation (разбор формулы, детали)
// остаются сырыми: калибровка меняет только rating.

import { effectiveEvaluation } from '@/lib/ratingOverrides'
import type { PlayerEvaluation } from '@/types'

/** Якорь колонки: сырой авторасчёт игрока и его ручное значение */
export interface RatingAnchor {
  auto: number
  manual: number
}

/** Отображение авторасчёта в шкалу якорей; null — якорей нет, шкала не меняется */
export type RatingScale = ((auto: number) => number) | null

const clampRating = (value: number): number =>
  Math.min(100, Math.max(1, Math.round(value)))

/** Шкала по якорям. При одинаковых авторасчётах ручные значения усредняются,
 *  точки сортируются по авторасчёту. Один якорь — пропорция от нуля шкалы
 *  (0 -> 0, якорь -> вручную); два и более — кусочно-линейная интерполяция,
 *  за пределами крайних якорей — линейная экстраполяция по крайнему отрезку. */
export function makeRatingScale(anchors: RatingAnchor[]): RatingScale {
  if (anchors.length === 0) return null

  const byAuto = new Map<number, { sum: number; count: number }>()
  for (const anchor of anchors) {
    const bucket = byAuto.get(anchor.auto) ?? { sum: 0, count: 0 }
    bucket.sum += anchor.manual
    bucket.count += 1
    byAuto.set(anchor.auto, bucket)
  }
  const points = [...byAuto.entries()]
    .map(([auto, { sum, count }]) => ({ auto, manual: sum / count }))
    .sort((a, b) => a.auto - b.auto)

  if (points.length === 1) {
    const { auto, manual } = points[0] ?? { auto: 0, manual: 0 }
    if (auto <= 0) return null
    const k = manual / auto
    if (!Number.isFinite(k) || k <= 0) return null
    return (x) => clampRating(x * k)
  }

  return (x) => {
    const first = points[0]
    const last = points[points.length - 1]
    if (first == null || last == null) return clampRating(x)
    if (x <= first.auto) return clampRating(line(first, points[1], x))
    if (x >= last.auto) {
      return clampRating(line(points[points.length - 2], last, x))
    }
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]
      const p2 = points[i + 1]
      if (p1 == null || p2 == null) continue
      if (x >= p1.auto && x <= p2.auto) {
        const t = (x - p1.auto) / (p2.auto - p1.auto)
        return clampRating(p1.manual + t * (p2.manual - p1.manual))
      }
    }
    return clampRating(x)
  }
}

/** Значение прямой через две опорные точки в точке x
 *  (auto в points строго возрастают — деления на ноль нет) */
function line(
  p1: { auto: number; manual: number },
  p2: { auto: number; manual: number } | undefined,
  x: number,
): number {
  if (p2 == null) return p1.manual
  const slope = (p2.manual - p1.manual) / (p2.auto - p1.auto)
  return p2.manual + (x - p2.auto) * slope
}

/** Эффективная оценка ячейки: ручное значение главнее (сам игрок — якорь),
 *  иначе авторасчёт пересчитывается в шкалу якорей колонки. */
export function calibratedEvaluation(
  raw: PlayerEvaluation | null,
  manual: number | null,
  scale: RatingScale,
): PlayerEvaluation | null {
  if (manual != null) return effectiveEvaluation(raw, manual)
  if (raw?.rating == null || scale == null) return raw
  return { ...raw, rating: scale(raw.rating) }
}
