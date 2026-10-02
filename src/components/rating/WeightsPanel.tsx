import { RotateCcw, Sigma } from 'lucide-react'
import { useMemo } from 'react'

import { RatingBadge } from '@/components/rating/RatingBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { BENCHMARK_ROLES, qualifiedPlayers } from '@/lib/benchmark'
import { fmtDecimal, fmtInt } from '@/lib/format'
import { medalFromRankTier } from '@/lib/medals'
import { POSITION_LABELS } from '@/lib/playerRoles'
import { evaluatePlayer } from '@/lib/rating'
import type {
  BenchmarkMetrics,
  BenchmarkMode,
  PoolBenchmarks,
  RatedPlayer,
  RatingConfig,
  Role,
  RoleBenchmark,
} from '@/types'

interface WeightsPanelProps {
  config: RatingConfig
  onChange: (config: RatingConfig) => void
  onReset: () => void
  rated: RatedPlayer[]
  benchmarks: PoolBenchmarks
}

export function WeightsPanel({ config, onChange, onReset, rated, benchmarks }: WeightsPanelProps) {
  const weightSum = config.weights.tier + config.weights.perf + config.weights.activity
  const poolScoring = config.scoring === 'pool'

  function patch(next: Partial<RatingConfig>) {
    onChange({ ...config, ...next })
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[400px_1fr]">
      <Card className="glass border-l-2 border-l-primary">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sigma className="size-4 text-primary" />
            Формула рейтинга
          </CardTitle>
          <CardDescription>
            Веса нормализуются автоматически; вклад каждой компоненты виден в превью
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-4">
            <WeightSlider
              label="Медаль (Tier)"
              hint="Публичная медаль, лидерборд, оценка MMR"
              value={config.weights.tier}
              onChange={(v) => patch({ weights: { ...config.weights, tier: v } })}
            />
            <WeightSlider
              label="Форма (Perf)"
              hint="KDA, GPM, XPM, урон, винрейт последних матчей"
              value={config.weights.perf}
              onChange={(v) => patch({ weights: { ...config.weights, perf: v } })}
            />
            <WeightSlider
              label="Активность"
              hint="Общий винрейт, объём матчей, пул героев"
              value={config.weights.activity}
              onChange={(v) => patch({ weights: { ...config.weights, activity: v } })}
            />
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Матчей для оценки формы: {config.recentMatchesCount}
              </Label>
              <Slider
                min={5}
                max={50}
                step={1}
                value={[config.recentMatchesCount]}
                onValueChange={([v]) => patch({ recentMatchesCount: v })}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Берутся самые свежие матчи не старше{' '}
                {recencyWindowLabel(config.recencyMonths).toLowerCase()} — окно общее
                для формы и эталонов и настраивается в блоке «Ролевые эталоны»
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Пороговые значения — что считать 100/100</div>
              <div className="flex items-center gap-2">
                <Label htmlFor="pool-scoring" className="text-xs text-muted-foreground">
                  Из пула
                </Label>
                <Switch
                  id="pool-scoring"
                  size="sm"
                  checked={poolScoring}
                  onCheckedChange={(v) => patch({ scoring: v ? 'pool' : 'fixed' })}
                />
              </div>
            </div>
            {poolScoring && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Пороги формы вычисляются из эталонов пула по позиции (режим и охват — в блоке
                «Ролевые эталоны»). Если на позиции мало данных, используется фиксированный порог.
              </p>
            )}
            <ThresholdSlider
              label="KDA"
              min={2}
              max={10}
              step={0.5}
              value={config.thresholds.kda}
              disabled={poolScoring}
              onChange={(v) => patch({ thresholds: { ...config.thresholds, kda: v } })}
            />
            <ThresholdSlider
              label="GPM"
              min={400}
              max={1000}
              step={25}
              value={config.thresholds.gpm}
              disabled={poolScoring}
              onChange={(v) => patch({ thresholds: { ...config.thresholds, gpm: v } })}
            />
            <ThresholdSlider
              label="XPM"
              min={400}
              max={1000}
              step={25}
              value={config.thresholds.xpm}
              disabled={poolScoring}
              onChange={(v) => patch({ thresholds: { ...config.thresholds, xpm: v } })}
            />
            <ThresholdSlider
              label="Урон по героям в минуту"
              min={300}
              max={1000}
              step={25}
              value={config.thresholds.dpm}
              disabled={poolScoring}
              onChange={(v) => patch({ thresholds: { ...config.thresholds, dpm: v } })}
            />
            <ThresholdSlider
              label="Матчей для полного доверия"
              min={100}
              max={2000}
              step={50}
              value={config.thresholds.sampleGames}
              onChange={(v) => patch({ thresholds: { ...config.thresholds, sampleGames: v } })}
            />
            <ThresholdSlider
              label="Размер пула героев"
              min={10}
              max={100}
              step={5}
              value={config.thresholds.heroPool}
              onChange={(v) => patch({ thresholds: { ...config.thresholds, heroPool: v } })}
            />
          </div>

          <Button variant="outline" onClick={onReset} className="w-full">
            <RotateCcw className="size-4" />
            Сбросить по умолчанию
          </Button>

          {weightSum === 0 && (
            <Alert variant="destructive">
              <AlertTitle>Все веса нулевые</AlertTitle>
              <AlertDescription>
                Поднимите хотя бы один вес, иначе рейтинг не считается.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Живое превью</CardTitle>
          <CardDescription>
            Рейтинг пересчитывается мгновенно при изменении формулы
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rated.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Добавьте игроков — и здесь появится разложение их рейтинга.
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Игрок</th>
                    <th className="py-2 pr-3 font-medium">Медаль</th>
                    <th className="py-2 pr-3 text-right font-medium">Медаль × w</th>
                    <th className="py-2 pr-3 text-right font-medium">Форма × w</th>
                    <th className="py-2 pr-3 text-right font-medium">Активность × w</th>
                    <th className="py-2 text-right font-medium">Рейтинг</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...rated]
                    .sort(
                      (a, b) => (b.evaluation?.rating ?? -1) - (a.evaluation?.rating ?? -1),
                    )
                    .map((item) => {
                      const evaluation = item.evaluation
                      const medal = medalFromRankTier(item.stats?.profile.rankTier ?? null)
                      return (
                        <tr key={item.player.accountId}>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              {item.player.avatarfull ? (
                                <img
                                  src={item.player.avatarfull}
                                  alt=""
                                  className="size-7 rounded-full ring-1 ring-border"
                                />
                              ) : (
                                <div className="size-7 rounded-full bg-muted" />
                              )}
                              <span className="max-w-40 truncate font-medium">
                                {item.player.personaname}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {medal.label}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                            {evaluation?.contributions.tier != null
                              ? fmtInt(evaluation.contributions.tier)
                              : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                            {evaluation?.contributions.perf != null
                              ? fmtInt(evaluation.contributions.perf)
                              : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                            {evaluation?.contributions.activity != null
                              ? fmtInt(evaluation.contributions.activity)
                              : '—'}
                          </td>
                          <td className="py-2 text-right">
                            <RatingBadge
                              rating={evaluation?.rating ?? null}
                              size="sm"
                              className="inline-block"
                            />
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <RoleBenchmarks
        rated={rated}
        config={config}
        benchmarks={benchmarks}
        onChange={onChange}
      />
    </div>
  )
}

const BENCHMARK_MODE_OPTIONS: Array<{ value: BenchmarkMode; label: string }> = [
  { value: 'p50', label: 'p50 — медиана пула' },
  { value: 'p75', label: 'p75 — верхняя четверть' },
  { value: 'p90', label: 'p90 — почти лучшие' },
  { value: 'best', label: 'Лучший в пуле' },
]

const RECENCY_WINDOW_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: 'Последний месяц' },
  { value: '3', label: 'Последние 3 месяца' },
  { value: '6', label: 'Последние 6 месяцев' },
  { value: '12', label: 'Последний год' },
  { value: '0', label: 'Весь период загрузки' },
]

function recencyWindowLabel(months: number): string {
  return (
    RECENCY_WINDOW_OPTIONS.find((option) => option.value === String(months))?.label ??
    `${months} мес.`
  )
}

const RANK_GAP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: 'Не учитывать' },
  { value: '1', label: '±1 медаль от топа' },
  { value: '2', label: '±2 медали от топа' },
  { value: '3', label: '±3 медали от топа' },
]

function rankGapLabel(gap: number): string {
  return (
    RANK_GAP_OPTIONS.find((option) => option.value === String(gap))?.label ??
    `±${gap} медалей от топа`
  )
}

const BENCHMARK_METRIC_ROWS: Array<{
  key: keyof BenchmarkMetrics
  label: string
  format: (value: number | null) => string
}> = [
  { key: 'kda', label: 'KDA', format: (v) => fmtDecimal(v, 1) },
  { key: 'gpm', label: 'GPM', format: fmtInt },
  { key: 'xpm', label: 'XPM', format: fmtInt },
  { key: 'dpm', label: 'DPM', format: fmtInt },
  { key: 'imp', label: 'IMP', format: fmtInt },
  { key: 'lhpm', label: 'LH/мин', format: fmtInt },
]

interface RoleBenchmarksProps {
  rated: RatedPlayer[]
  config: RatingConfig
  benchmarks: PoolBenchmarks
  onChange: (config: RatingConfig) => void
}

function RoleBenchmarks({ rated, config, benchmarks, onChange }: RoleBenchmarksProps) {
  const { mode, minMatches, rankGap } = config.benchmark
  const recency = config.recencyMonths

  return (
    <Card className="glass lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Ролевые эталоны</CardTitle>
        <CardDescription>
          Эталон и форма считаются по матчам не старше{' '}
          {recencyWindowLabel(recency).toLowerCase()} — устаревшие матчи не учитываются;
          игрок попадает в расчёт от {minMatches} матчей на позиции за окно
          {rankGap > 0 && `; планка по рангу — ${rankGapLabel(rankGap)}`}
        </CardDescription>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Режим</Label>
            <Select
              value={mode}
              onValueChange={(value) =>
                onChange({ ...config, benchmark: { ...config.benchmark, mode: value as BenchmarkMode } })
              }
            >
              <SelectTrigger size="sm" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BENCHMARK_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Окно</Label>
            <Select
              value={String(recency)}
              onValueChange={(value) =>
                onChange({ ...config, recencyMonths: Number(value) })
              }
            >
              <SelectTrigger size="sm" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECENCY_WINDOW_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Ранг</Label>
            <Select
              value={String(rankGap)}
              onValueChange={(value) =>
                onChange({
                  ...config,
                  benchmark: { ...config.benchmark, rankGap: Number(value) },
                })
              }
            >
              <SelectTrigger size="sm" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANK_GAP_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-44 flex-1 items-center gap-3">
            <Label className="whitespace-nowrap text-xs text-muted-foreground">
              Мин. матчей
            </Label>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[minMatches]}
              onValueChange={([value]) =>
                onChange({ ...config, benchmark: { ...config.benchmark, minMatches: value } })
              }
            />
            <span className="w-4 text-right text-xs tabular-nums text-muted-foreground">
              {minMatches}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {BENCHMARK_ROLES.map((role) => (
            <RoleBenchmarkCard
              key={role}
              role={role}
              benchmark={benchmarks.byRole[role]}
              rated={rated}
              config={config}
              benchmarks={benchmarks}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface RoleBenchmarkCardProps {
  role: Role
  benchmark: RoleBenchmark
  rated: RatedPlayer[]
  config: RatingConfig
  benchmarks: PoolBenchmarks
}

function RoleBenchmarkCard({ role, benchmark, rated, config, benchmarks }: RoleBenchmarkCardProps) {
  // Топ-3 по форме на позиции — тот же квалификационный фильтр, что и у эталона
  // (мин. матчей за окно + ранговый охват), чтобы список не расходился с шапкой.
  const top = useMemo(() => {
    const pool = qualifiedPlayers(
      rated.map((r) => ({
        accountId: r.player.accountId,
        personaname: r.player.personaname,
        stats: r.stats,
      })),
      role,
      config,
    )
    const result: Array<{ item: RatedPlayer; perfScore: number; matches: number }> = []
    for (const q of pool) {
      const item = rated.find((r) => r.player.accountId === q.input.accountId)
      if (!item) continue
      const perfScore = evaluatePlayer(item.stats, config, role, benchmarks)?.perfScore
      if (perfScore == null) continue
      result.push({ item, perfScore, matches: q.matches })
    }
    return result.sort((a, b) => b.perfScore - a.perfScore).slice(0, 3)
  }, [rated, config, role, benchmarks])

  return (
    <div className="min-w-0 border border-border/70 bg-card/50 p-3">
      <div className="tlabel mb-2">{POSITION_LABELS[role]}</div>
      {benchmark.players > 0 ? (
        <>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            эталон · {benchmark.players} игр. · {benchmark.matches} матчей
            {benchmark.topRankTier != null && (
              <span title="Медаль планки — топ-медаль среди учтённых игроков">
                {' · '}
                {medalFromRankTier(benchmark.topRankTier).label}
              </span>
            )}
          </div>
          <div className="mt-2 space-y-1 text-[10px] tabular-nums text-muted-foreground">
            {BENCHMARK_METRIC_ROWS.map((row) => (
              <div key={row.key} className="flex justify-between gap-2">
                <span>{row.label}</span>
                <span className="font-medium text-foreground">
                  {row.format(benchmark.metrics[row.key])}
                </span>
              </div>
            ))}
          </div>
          {benchmark.thresholds == null && (
            <div className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              Скоринг по эталону недоступен (нужно ≥ 2 игроков) — форма считается по
              фиксированным порогам
            </div>
          )}
          <Separator className="my-2" />
          <div className="space-y-1.5">
            {top.map(({ item, perfScore, matches }, index) => (
              <div
                key={item.player.accountId}
                className="flex items-center justify-between gap-2 text-[11px]"
                title="Форма на позиции · матчей за окно"
              >
                <span className="min-w-0 truncate font-medium">
                  {index + 1}. {item.player.personaname}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {fmtDecimal(perfScore, 0)} · {matches}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="py-3 text-xs text-muted-foreground">
          Нет игроков с ≥ {config.benchmark.minMatches} матчами на позиции
          за {recencyWindowLabel(config.recencyMonths).toLowerCase()}
        </div>
      )}
    </div>
  )
}

function WeightSlider(props: {
  label: string
  hint: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-2" title={props.hint}>
      <div className="flex items-center justify-between">
        <Label>{props.label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {props.value.toFixed(2)}
        </span>
      </div>
      <Slider
        min={0}
        max={1}
        step={0.05}
        value={[props.value]}
        onValueChange={([v]) => props.onChange(v)}
      />
    </div>
  )
}

function ThresholdSlider(props: {
  label: string
  min: number
  max: number
  step: number
  value: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className={props.disabled ? 'space-y-1.5 opacity-50' : 'space-y-1.5'}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{props.label}</span>
        <span className="tabular-nums">{props.value}</span>
      </div>
      <Slider
        min={props.min}
        max={props.max}
        step={props.step}
        value={[props.value]}
        disabled={props.disabled}
        onValueChange={([v]) => props.onChange(v)}
      />
    </div>
  )
}
