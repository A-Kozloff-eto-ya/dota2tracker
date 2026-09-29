import { RotateCcw, Sigma } from 'lucide-react'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { fmtDecimal, fmtInt } from '@/lib/format'
import { medalFromRankTier } from '@/lib/medals'
import { POSITION_LABELS } from '@/lib/playerRoles'
import { evaluatePlayer } from '@/lib/rating'
import type { RatedPlayer, RatingConfig, Role } from '@/types'

interface WeightsPanelProps {
  config: RatingConfig
  onChange: (config: RatingConfig) => void
  onReset: () => void
  rated: RatedPlayer[]
}

export function WeightsPanel({ config, onChange, onReset, rated }: WeightsPanelProps) {
  const weightSum = config.weights.tier + config.weights.perf + config.weights.activity

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
              <Label htmlFor="scale-max">Верхняя граница шкалы рейтинга</Label>
              <Input
                id="scale-max"
                type="number"
                min={1000}
                max={50000}
                step={500}
                value={config.scaleMax}
                onChange={(e) =>
                  patch({ scaleMax: clampInt(e.target.value, 1000, 50000, config.scaleMax) })
                }
              />
            </div>
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
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="text-sm font-medium">Пороговые значения — что считать 100/100</div>
            <ThresholdSlider
              label="KDA"
              min={2}
              max={10}
              step={0.5}
              value={config.thresholds.kda}
              onChange={(v) => patch({ thresholds: { ...config.thresholds, kda: v } })}
            />
            <ThresholdSlider
              label="GPM"
              min={400}
              max={1000}
              step={25}
              value={config.thresholds.gpm}
              onChange={(v) => patch({ thresholds: { ...config.thresholds, gpm: v } })}
            />
            <ThresholdSlider
              label="XPM"
              min={400}
              max={1000}
              step={25}
              value={config.thresholds.xpm}
              onChange={(v) => patch({ thresholds: { ...config.thresholds, xpm: v } })}
            />
            <ThresholdSlider
              label="Урон по героям в минуту"
              min={300}
              max={1000}
              step={25}
              value={config.thresholds.dpm}
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
      <RoleBenchmarks rated={rated} config={config} />
    </div>
  )
}

const BENCHMARK_ROLES: Role[] = [1, 2, 3, 4, 5]

function RoleBenchmarks({ rated, config }: { rated: RatedPlayer[]; config: RatingConfig }) {
  return (
    <Card className="glass lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Ролевые эталоны</CardTitle>
        <CardDescription>
          Лучшие загруженные показатели вашего пула по фактическим матчам на позиции
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {BENCHMARK_ROLES.map((role) => {
            const benchmark = rated
              .map((item) => ({ item, evaluation: evaluatePlayer(item.stats, config, role) }))
              .filter(({ item, evaluation }) => item.stats?.recentMatches.some((match) => match.position === role) && evaluation?.rating != null)
              .sort((a, b) => (b.evaluation?.rating ?? -1) - (a.evaluation?.rating ?? -1))[0]
            const perf = benchmark?.evaluation?.perf

            return (
              <div key={role} className="min-w-0 border border-border/70 bg-card/50 p-3">
                <div className="tlabel mb-2">{POSITION_LABELS[role]}</div>
                {benchmark ? (
                  <>
                    <div className="truncate text-sm font-medium" title={benchmark.item.player.personaname}>
                      {benchmark.item.player.personaname}
                    </div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-primary">
                      {fmtInt(benchmark.evaluation?.rating ?? null)}
                    </div>
                    <div className="mt-2 space-y-1 text-[10px] tabular-nums text-muted-foreground">
                      <div className="flex justify-between gap-2"><span>KDA</span><span>{fmtDecimal(perf?.kda)}</span></div>
                      <div className="flex justify-between gap-2"><span>GPM</span><span>{fmtInt(perf?.gpm)}</span></div>
                      <div className="flex justify-between gap-2"><span>XPM</span><span>{fmtInt(perf?.xpm)}</span></div>
                      <div className="flex justify-between gap-2"><span>DPM</span><span>{fmtInt(perf?.dpm)}</span></div>
                    </div>
                  </>
                ) : (
                  <div className="py-3 text-xs text-muted-foreground">Нет игрока с этим тегом</div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
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
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{props.label}</span>
        <span className="tabular-nums">{props.value}</span>
      </div>
      <Slider
        min={props.min}
        max={props.max}
        step={props.step}
        value={[props.value]}
        onValueChange={([v]) => props.onChange(v)}
      />
    </div>
  )
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}
