import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'

import { fmtInt } from '@/lib/format'
import type { PlayerEvaluation, RatingConfig } from '@/types'
import { cn } from '@/lib/utils'

interface RatingBreakdownProps {
  evaluation: PlayerEvaluation
  config: RatingConfig
}

const COMPONENT_LABELS = { tier: 'Медаль', perf: 'Форма', activity: 'Активность' } as const

/** Разложение рейтинга по компонентам формулы + радар метрик */
export function RatingBreakdown({ evaluation, config }: RatingBreakdownProps) {
  const { perf, activity, contributions, tierScore, perfScore, activityScore } = evaluation

  const rows = [
    {
      key: 'tier' as const,
      score: tierScore,
      weight: config.weights.tier,
      contribution: contributions.tier,
      hint: 'Публичная медаль + лидерборд; для приватных профилей — оценка MMR',
    },
    {
      key: 'perf' as const,
      score: perfScore,
      weight: config.weights.perf,
      contribution: contributions.perf,
      hint: `KDA, GPM, XPM, урон в минуту, винрейт — последние ${perf.sampleSize || config.recentMatchesCount} матчей`,
    },
    {
      key: 'activity' as const,
      score: activityScore,
      weight: config.weights.activity,
      contribution: contributions.activity,
      hint: 'Общий винрейт, объём матчей и пул героев',
    },
  ]

  const radarData = [
    { axis: 'Медаль', value: tierScore ?? 0 },
    { axis: 'KDA', value: perf.kdaScore ?? 0 },
    { axis: 'GPM', value: perf.gpmScore ?? 0 },
    { axis: 'XPM', value: perf.xpmScore ?? 0 },
    { axis: 'Урон/мин', value: perf.dpmScore ?? 0 },
    { axis: 'Винрейт', value: perf.recentWinrateScore ?? 0 },
    { axis: 'Пул героев', value: activity.heroPoolScore ?? 0 },
  ]

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="space-y-1.5" title={row.hint}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{COMPONENT_LABELS[row.key]}</span>
              <span className="text-xs text-muted-foreground">
                вес {row.weight.toFixed(2)} ·{' '}
                {row.contribution != null ? `+${fmtInt(row.contribution)} очк.` : 'нет данных'}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  row.key === 'tier' && 'bg-gold',
                  row.key === 'perf' && 'bg-primary',
                  row.key === 'activity' && 'bg-sky-500',
                )}
                style={{ width: `${row.score ?? 0}%` }}
              />
            </div>
            <div className="text-right text-xs tabular-nums text-muted-foreground">
              {row.score != null ? `${row.score} / 100` : '—'}
            </div>
          </div>
        ))}
        <p className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          Рейтинг = Σ(вес × компонента) / Σвес, пересчитанный в шкалу 0–
          {fmtInt(config.scaleMax)}. Доступные компоненты автоматически забирают вес недоступных.
        </p>
      </div>
      <div className="min-h-56">
        <ResponsiveContainer width="100%" height={224}>
          <RadarChart data={radarData} outerRadius="72%">
            <PolarGrid stroke="#2a3444" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: '#9099a9', fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="value" stroke="#c8402c" fill="#c8402c" fillOpacity={0.35} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
