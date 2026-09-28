import { ChevronDown, Eye, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { HeroImage } from '@/components/players/HeroImage'
import { PlayerDetailDialog } from '@/components/players/PlayerDetailDialog'
import { RatingBadge } from '@/components/rating/RatingBadge'
import { RatingBreakdown } from '@/components/rating/RatingBreakdown'
import { evaluatePlayer } from '@/lib/rating'
import type {
  HeroInfo,
  RatedPlayer,
  RatingConfig,
  StatsSourceId,
} from '@/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { flagEmoji, fmtDecimal, fmtInt, fmtPct, timeAgo } from '@/lib/format'
import { medalFromRankTier } from '@/lib/medals'
import { cn } from '@/lib/utils'

const SOURCE_TABS: Array<{ id: StatsSourceId; label: string }> = [
  { id: 'stratz', label: 'STRATZ' },
  { id: 'opendota', label: 'OpenDota' },
  { id: 'steam', label: 'Steam' },
]

const SOURCE_LABEL: Record<StatsSourceId, string> = {
  stratz: 'STRATZ',
  opendota: 'OpenDota',
  steam: 'Steam',
}

interface PlayerCardProps {
  rated: RatedPlayer
  heroes: Map<number, HeroInfo>
  config: RatingConfig
  onRemove: (accountId: number) => void
  onRefresh: (accountId: number) => void
}

export function PlayerCard({ rated, heroes, config, onRemove, onRefresh }: PlayerCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [sourceId, setSourceId] = useState<StatsSourceId>('stratz')
  const { player, status, error, fetchedAt } = rated
  const sources = rated.sources

  // Доступные источники; по умолчанию STRATZ, иначе первый с данными
  const available: StatsSourceId[] = SOURCE_TABS.filter(
    (tab) => sources[tab.id] != null,
  ).map((tab) => tab.id)
  const activeSource: StatsSourceId = available.includes(sourceId)
    ? sourceId
    : (available[0] ?? 'opendota')
  // Статистика и рейтинг выбранного источника (объединённые — для команд)
  const stats = sources[activeSource] ?? rated.stats
  const evaluation = useMemo(
    () => evaluatePlayer(stats, config),
    [stats, config],
  )
  const medal = medalFromRankTier(stats?.profile.rankTier ?? null)
  const profile = stats?.profile
  const totalGames = stats ? stats.wl.win + stats.wl.lose : 0
  const winrate = stats && totalGames > 0 ? stats.wl.win / totalGames : null
  const perf = evaluation?.perf
  const busy = status === 'loading'
  // Приватный профиль: источник не отдаёт ни матчей, ни общего win/lose
  const isPrivate = stats != null && totalGames === 0 && stats.recentMatches.length === 0

  return (
    <>
      <Card className="glass overflow-hidden transition-colors hover:border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            title="Открыть профиль и историю матчей"
            className="cursor-pointer rounded-full transition-opacity hover:opacity-80"
          >
            {player.avatarfull ? (
              <img
                src={player.avatarfull}
                alt=""
                className="size-12 rounded-full ring-2 ring-border"
              />
            ) : (
              <div className="grid size-12 shrink-0 place-items-center rounded-full bg-muted font-display text-muted-foreground">
                {player.personaname.slice(0, 1).toUpperCase()}
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            title="Открыть профиль и историю матчей"
            className="min-w-0 flex-1 cursor-pointer rounded-lg p-1 text-left transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold">{player.personaname}</span>
              <span className="text-sm">{flagEmoji(profile?.loccountrycode)}</span>
            </div>
            {profile?.name && (
              <div className="text-xs text-gold-bright">{profile.name}</div>
            )}
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <img
                src={medal.iconUrl}
                alt=""
                className="h-4 w-auto"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
              <span>{medal.label}</span>
              {isPrivate && (
                <Badge variant="outline" className="text-[10px]">
                  скрытый профиль
                </Badge>
              )}
            </div>
          </button>
          <div className="text-right">
            <RatingBadge rating={evaluation?.rating ?? null} size="lg" />
            <div className="mt-1 text-[10px] text-muted-foreground">
              {SOURCE_LABEL[activeSource]} · {timeAgo(fetchedAt)}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Источник данных
          </span>
          <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5">
            {SOURCE_TABS.map((tab) => {
              const has = sources[tab.id] != null
              const isActive = activeSource === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={!has}
                  onClick={() => setSourceId(tab.id)}
                  title={
                    has
                      ? `Данные ${SOURCE_LABEL[tab.id]}`
                      : `${SOURCE_LABEL[tab.id]}: нет данных (проверьте ключи в настройках)`
                  }
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                    isActive && 'bg-primary text-primary-foreground shadow-sm',
                    !isActive && has && 'text-muted-foreground hover:text-foreground',
                    !has && 'cursor-not-allowed opacity-40',
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {status === 'error' && (
          <Alert variant="destructive">
            <AlertTitle>Ошибка загрузки</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-2">
              <span className="text-xs">{error}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRefresh(player.accountId)}
              >
                Повторить
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {status === 'loading' && !stats && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {stats && isPrivate && (
          <Alert>
            <AlertTitle>Матч-история скрыта настройками приватности</AlertTitle>
            <AlertDescription className="text-xs leading-relaxed">
              Игрок отключил публичные данные матчей в Dota 2, и OpenDota не имеет его
              статистики — рейтинг рассчитан по медали
              {profile?.computedMmr != null
                ? `; оценка MMR по данным OpenDota: ~${fmtInt(profile.computedMmr)}`
                : ''}
              . Полная статистика появится автоматически, если игрок включит публичные
              данные матчей (Dota 2 → Настройки → Приватность) и данные обновятся в
              OpenDota.
            </AlertDescription>
          </Alert>
        )}

        {stats?.behaviorScore != null && (
          <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">Behavior score (STRATZ)</span>
            <span className="font-semibold tabular-nums">
              {fmtInt(stats.behaviorScore)}
            </span>
          </div>
        )}

        {stats && !isPrivate && (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              <StatCell label="Винрейт" value={fmtPct(winrate)} />
              <StatCell label="KDA (посл.)" value={fmtDecimal(perf?.kda)} />
              <StatCell
                label="GPM / XPM"
                value={
                  perf ? `${fmtInt(perf.gpm)} / ${fmtInt(perf.xpm)}` : '—'
                }
              />
              <StatCell label="Матчи" value={fmtInt(totalGames)} />
            </div>

            {winrate != null && (
              <div
                className="flex h-1.5 overflow-hidden rounded-full"
                title={`Победы: ${fmtInt(stats.wl.win)} · Поражения: ${fmtInt(stats.wl.lose)}`}
              >
                <div className="bg-radiant" style={{ width: `${winrate * 100}%` }} />
                <div className="flex-1 bg-dire" />
              </div>
            )}

            {stats.heroes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {stats.heroes.slice(0, 5).map((heroStat) => {
                  const wr = heroStat.games > 0 ? heroStat.win / heroStat.games : 0
                  const name =
                    heroes.get(heroStat.heroId)?.localizedName ?? `Герой ${heroStat.heroId}`
                  return (
                    <Tooltip key={heroStat.heroId}>
                      <TooltipTrigger asChild>
                        <div>
                          <HeroImage
                            heroId={heroStat.heroId}
                            heroes={heroes}
                            className="h-11 w-[78px]"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {name}: {heroStat.games} игр · {fmtPct(wr, 0)} побед
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
                className="text-muted-foreground"
              >
                Разбор рейтинга
                <ChevronDown
                  className={cn('size-4 transition-transform', expanded && 'rotate-180')}
                />
              </Button>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onRefresh(player.accountId)}
                  disabled={busy}
                  title="Обновить"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setDetailOpen(true)}
                  title="Профиль и история матчей"
                >
                  <Eye className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(player.accountId)}
                  title="Убрать из списка"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {expanded && evaluation && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <RatingBreakdown evaluation={evaluation} config={config} />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </CardContent>
      </Card>
      <PlayerDetailDialog
        player={player}
        stats={stats}
        config={config}
        sourceLabel={SOURCE_LABEL[activeSource]}
        heroes={heroes}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  )
}
