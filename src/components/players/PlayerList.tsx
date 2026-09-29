import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { PlayerCard } from '@/components/players/PlayerCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { POSITION_LABELS } from '@/lib/playerRoles'
import { evaluatePlayer } from '@/lib/rating'
import type { HeroInfo, RatedPlayer, RatingConfig, Role } from '@/types'

interface PlayerListProps {
  rated: RatedPlayer[]
  heroes: Map<number, HeroInfo>
  config: RatingConfig
  onRemove: (accountId: number) => void
  onRefresh: (accountId: number) => void
  canManage: boolean
}

export function PlayerList({ rated, heroes, config, onRemove, onRefresh, canManage }: PlayerListProps) {
  const [roleFilter, setRoleFilter] = useState<Role | null>(null)

  if (rated.length === 0) {
    return (
      <Alert>
        <AlertTitle>Список пуст</AlertTitle>
        <AlertDescription>
          Найдите игрока по нику или добавьте по Steam ID / ссылке на профиль — рейтинг
          посчитается автоматически из данных STRATZ.
        </AlertDescription>
      </Alert>
    )
  }

  const filtered = roleFilter == null
    ? rated
    : rated.filter((item) => item.stats?.recentMatches.some((match) => match.position === roleFilter))
  const sorted = filtered
    .map((item) => ({
      item,
      evaluation: roleFilter == null ? item.evaluation : evaluatePlayer(item.stats, config, roleFilter),
    }))
    .sort((a, b) => (b.evaluation?.rating ?? -1) - (a.evaluation?.rating ?? -1))

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-y border-border/80 py-2">
        <span className="text-xs text-muted-foreground">
          {roleFilter == null ? 'Все позиции' : `Лучшие: ${POSITION_LABELS[roleFilter]}`}
          {' · '}{filtered.length} игроков
        </span>
        <Select
          value={roleFilter == null ? 'all' : String(roleFilter)}
          onValueChange={(value) => setRoleFilter(value === 'all' ? null : Number(value) as Role)}
        >
          <SelectTrigger className="w-full sm:w-44" size="sm">
            <SelectValue placeholder="Позиция" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все позиции</SelectItem>
            {([1, 2, 3, 4, 5] as Role[]).map((role) => (
              <SelectItem key={role} value={String(role)}>{POSITION_LABELS[role]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="border-t border-border/80">
      {sorted.map(({ item, evaluation }) => (
        <PlayerCard
          key={item.player.accountId}
          rated={{ ...item, evaluation }}
          heroes={heroes}
          config={config}
          onRemove={onRemove}
          onRefresh={onRefresh}
          canManage={canManage}
          roleFilter={roleFilter}
        />
      ))}
      {sorted.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Нет матчей с подтвержденной позицией {roleFilter != null ? POSITION_LABELS[roleFilter] : ''}.
        </p>
      )}
      </div>
    </div>
  )
}
