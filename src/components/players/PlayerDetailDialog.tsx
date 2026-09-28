import { ExternalLink } from 'lucide-react'
import { useMemo } from 'react'

import { HeroImage } from '@/components/players/HeroImage'
import { RatingBadge } from '@/components/rating/RatingBadge'
import { RatingBreakdown } from '@/components/rating/RatingBreakdown'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { evaluatePlayer } from '@/lib/rating'
import { flagEmoji, fmtInt, fmtPct, timeAgo } from '@/lib/format'
import { medalFromRankTier } from '@/lib/medals'
import type {
  HeroInfo,
  PlayerStats,
  RatingConfig,
  RecentMatch,
  TrackedPlayer,
} from '@/types'
import { cn } from '@/lib/utils'

interface PlayerDetailDialogProps {
  player: TrackedPlayer
  stats: PlayerStats | null
  heroes: Map<number, HeroInfo>
  config: RatingConfig
  /** Подпись источника, из которого показаны данные */
  sourceLabel?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Полный профиль игрока: сводка, история матчей, топ героев, разбор рейтинга */
export function PlayerDetailDialog({
  player,
  stats,
  heroes,
  config,
  sourceLabel,
  open,
  onOpenChange,
}: PlayerDetailDialogProps) {
  const evaluation = useMemo(
    () => evaluatePlayer(stats, config),
    [stats, config],
  )
  const medal = medalFromRankTier(stats?.profile.rankTier ?? null)
  const profile = stats?.profile
  const totalGames = stats ? stats.wl.win + stats.wl.lose : 0
  const winrate = stats && totalGames > 0 ? stats.wl.win / totalGames : null
  const isPrivate =
    stats != null && totalGames === 0 && stats.recentMatches.length === 0

  const matches = useMemo(
    () => [...(stats?.recentMatches ?? [])].sort((a, b) => b.startTime - a.startTime),
    [stats],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scrollbar-thin sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-start gap-4">
            {profile?.avatarfull ? (
              <img
                src={profile.avatarfull}
                alt=""
                className="size-16 rounded-full ring-2 ring-border"
              />
            ) : (
              <div className="grid size-16 shrink-0 place-items-center rounded-full bg-muted font-display text-xl text-muted-foreground">
                {player.personaname.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-left text-lg">
                <span>{player.personaname}</span>
                <span className="text-base">{flagEmoji(profile?.loccountrycode)}</span>
                {profile?.name && (
                  <Badge variant="outline" className="text-gold-bright">
                    {profile.name}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {sourceLabel && (
                  <span className="font-medium text-foreground/80">
                    Источник: {sourceLabel}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <img
                    src={medal.iconUrl}
                    alt=""
                    className="h-4 w-auto"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                  {medal.label}
                </span>
                {profile?.leaderboardRank != null && (
                  <span>Лидерборд: топ {fmtInt(profile.leaderboardRank)}</span>
                )}
                {stats && <span>Матчей: {fmtInt(totalGames)}</span>}
                {stats?.behaviorScore != null && (
                  <span>Behavior: {fmtInt(stats.behaviorScore)}</span>
                )}
              </DialogDescription>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <MiniLink
                  href={
                    profile?.profileurl ??
                    `https://steamcommunity.com/profiles/${player.accountId}`
                  }
                  label="Steam"
                />
                <MiniLink
                  href={`https://www.opendota.com/players/${player.accountId}`}
                  label="OpenDota"
                />
                <MiniLink
                  href={`https://stratz.com/players/${player.accountId}`}
                  label="STRATZ"
                />
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Рейтинг
              </div>
              <RatingBadge rating={evaluation?.rating ?? null} size="lg" />
            </div>
          </div>
        </DialogHeader>

        {winrate != null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Победы: {fmtInt(stats?.wl.win ?? 0)} · Поражения: {fmtInt(stats?.wl.lose ?? 0)}
              </span>
              <span className="font-semibold text-foreground">{fmtPct(winrate)}</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full">
              <div className="bg-radiant" style={{ width: `${winrate * 100}%` }} />
              <div className="flex-1 bg-dire" />
            </div>
          </div>
        )}

        {!stats && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {stats && isPrivate && (
          <Alert>
            <AlertTitle>Матч-история скрыта настройками приватности</AlertTitle>
            <AlertDescription className="text-xs leading-relaxed">
              Игрок отключил публичные данные матчей в Dota 2 — история недоступна ни в
              OpenDota, ни в STRATZ. Показаны только медаль и общие счётчики.
            </AlertDescription>
          </Alert>
        )}

        {stats && <PlayerMatches matches={matches} heroes={heroes} />}

        <Separator />

        {stats && <PlayerHeroes stats={stats} heroes={heroes} />}

        <Separator />

        {stats && evaluation ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Разбор рейтинга</h3>
            <RatingBreakdown evaluation={evaluation} config={config} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function PlayerMatches({
  matches,
  heroes,
}: {
  matches: RecentMatch[]
  heroes: Map<number, HeroInfo>
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Последние матчи</h3>
        <span className="text-xs text-muted-foreground">{matches.length} шт.</span>
      </div>
      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">История матчей недоступна.</p>
      ) : (
        <>
          <div className="hidden items-center gap-3 px-2.5 text-[10px] uppercase tracking-wide text-muted-foreground md:flex">
            <span className="w-[78px]">Герой</span>
            <span className="w-24 text-center">Результат</span>
            <span className="w-16 text-center">KDA</span>
            <span className="w-16 text-center">GPM</span>
            <span className="w-20 text-center">Урон</span>
            <span className="w-14 text-center">LH</span>
            <span className="ml-auto">Матч</span>
          </div>
          <div className="space-y-1.5">
            {matches.map((match) => (
              <MatchRow key={match.matchId} match={match} heroes={heroes} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MatchRow({
  match,
  heroes,
}: {
  match: RecentMatch
  heroes: Map<number, HeroInfo>
}) {
  const isWin = match.radiantWin === ((match.playerSlot & 0x80) === 0)
  const duration = `${Math.floor(match.duration / 60)}:${String(match.duration % 60).padStart(2, '0')}`
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-2.5 py-1.5">
      <HeroImage heroId={match.heroId} heroes={heroes} className="h-11 w-[78px] shrink-0" />
      <div className="w-24 shrink-0 text-center">
        <span
          className={cn(
            'inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
            isWin ? 'bg-radiant/20 text-radiant-bright' : 'bg-dire/20 text-dire-bright',
          )}
        >
          {isWin ? 'Победа' : 'Поражение'}
        </span>
        <div className="text-[10px] text-muted-foreground">{timeAgo(match.startTime * 1000)}</div>
      </div>
      <span className="w-16 shrink-0 text-center text-sm font-semibold tabular-nums">
        {match.kills}/{match.deaths}/{match.assists}
      </span>
      <span className="hidden w-16 shrink-0 text-center text-xs tabular-nums text-muted-foreground sm:block">
        {fmtInt(match.goldPerMin)}
      </span>
      <span className="hidden w-20 shrink-0 text-center text-xs tabular-nums text-muted-foreground md:block">
        {fmtInt(match.heroDamage)}
      </span>
      <span className="hidden w-14 shrink-0 text-center text-xs tabular-nums text-muted-foreground md:block">
        {fmtInt(match.lastHits)}
      </span>
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{duration}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <a
          href={`https://www.opendota.com/matches/${match.matchId}`}
          target="_blank"
          rel="noreferrer"
          title="Открыть в OpenDota"
          className="text-[10px] font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          OD
        </a>
        <a
          href={`https://stratz.com/matches/${match.matchId}`}
          target="_blank"
          rel="noreferrer"
          title="Открыть в STRATZ"
          className="text-[10px] font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          ST
        </a>
      </span>
    </div>
  )
}

function PlayerHeroes({
  stats,
  heroes,
}: {
  stats: PlayerStats
  heroes: Map<number, HeroInfo>
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Топ героев</h3>
      {stats.heroes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Данные по героям недоступны.</p>
      ) : (
        <div className="space-y-1.5">
          {stats.heroes.slice(0, 6).map((heroStat) => {
            const wr = heroStat.games > 0 ? heroStat.win / heroStat.games : 0
            const name =
              heroes.get(heroStat.heroId)?.localizedName ?? `Герой ${heroStat.heroId}`
            return (
              <div
                key={heroStat.heroId}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-2.5 py-1.5"
              >
                <HeroImage
                  heroId={heroStat.heroId}
                  heroes={heroes}
                  className="h-10 w-[71px] shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{name}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtInt(heroStat.games)} игр · {fmtInt(heroStat.win)} побед
                  </div>
                </div>
                <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-muted sm:block">
                  <div
                    className="h-full rounded-full bg-radiant"
                    style={{ width: `${wr * 100}%` }}
                  />
                </div>
                <span className="w-14 text-right text-sm font-semibold tabular-nums">
                  {fmtPct(wr, 0)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MiniLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      {label}
      <ExternalLink className="size-3" />
    </a>
  )
}
