import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
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
      hint: `KDA, GPM, XPM, урон в минуту, винрейт — последние ${perf.sampleSize || config.recentMatchesCount} матчей${config.recencyMonths > 0 ? ` не старше ${config.recencyMonths} мес.` : ' за весь период'}`,
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
        {evaluation.inactive && (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
            Свежих матчей в окне меньше {config.benchmark.minMatches} — рейтинг не
            рассчитывается: без достаточной формы медаль и общий винрейт не котируются.
          </p>
        )}
        <p className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          Рейтинг = Σ(вес × компонента) / Σвес — целое число двузначной шкалы 1–100.
          Доступные компоненты автоматически забирают вес недоступных.
          Форма скорится по{' '}
          {evaluation.thresholdsSource === 'pool'
            ? `эталонам пула (${config.benchmark.mode})`
            : 'фиксированным порогам'}
          .
        </p>
      </div>
      <div className="min-h-56">
        <ResponsiveContainer width="100%" height={224}>
          <RadarChart data={radarData} outerRadius="72%">
            <defs>
              <linearGradient id="ratingRadarFill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3155ff" stopOpacity={0.48} />
                <stop offset="100%" stopColor="#2447ff" stopOpacity={0.08} />
              </linearGradient>
              <filter id="ratingRadarGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <PolarGrid stroke="var(--chart-grid)" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--chart-label)', fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip content={<RadarTooltip />} cursor={false} />
            <Radar
              dataKey="value"
              stroke="#5270ff"
              strokeWidth={1.5}
              fill="url(#ratingRadarFill)"
              fillOpacity={1}
              dot={{ r: 3, fill: 'var(--chart-dot)', stroke: '#3155ff', strokeWidth: 2 }}
              activeDot={{ r: 5, fill: '#ffffff', stroke: '#3155ff', strokeWidth: 2 }}
              filter="url(#ratingRadarGlow)"
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function RadarTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: { axis?: string; value?: number } }>
}) {
  if (!active || !payload?.[0]?.payload) return null
  const point = payload[0].payload

  return (
    <div className="chart-tooltip border border-primary/50 bg-popover px-3 py-2 font-mono text-[10px] uppercase tracking-wide">
      <div className="mb-1 text-muted-foreground">{point.axis}</div>
      <div className="text-base font-medium tracking-normal text-foreground">
        {point.value ?? 0} <span className="text-xs text-primary">/ 100</span>
      </div>
    </div>
  )
}
