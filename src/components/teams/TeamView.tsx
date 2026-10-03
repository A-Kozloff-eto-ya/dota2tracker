import { useDraggable, useDroppable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'

import { RatingBadge } from '@/components/rating/RatingBadge'
import { teamDisplayName, teamStyle } from '@/components/teams/teamStyles'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { medalFromRankTier, ROLE_NAMES } from '@/lib/medals'
import type { BalanceTeam, RatedPlayer, Role } from '@/types'
import { cn } from '@/lib/utils'

/** Префиксы id DnD — единая точка правды для TeamBuilder и TeamView */
export const DRAG_PLAYER_PREFIX = 'p-'
export const DRAG_TEAM_PREFIX = 'team-'

interface TeamViewProps {
  team: BalanceTeam
  teamCount: number
  byId: Map<number, RatedPlayer>
  showRoleWarnings: boolean
}

/** Карточка команды: droppable-зона со списком draggable-игроков */
export function TeamView({ team, teamCount, byId, showRoleWarnings }: TeamViewProps) {
  const style = teamStyle(team.index)
  const { setNodeRef, isOver } = useDroppable({ id: `${DRAG_TEAM_PREFIX}${team.index}` })

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        'glass flex flex-col transition-all',
        style.border,
        isOver && 'ring-2',
        isOver && style.ring,
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={cn('font-display text-sm tracking-wide', style.text)}>
              {teamDisplayName(team.index, teamCount)}
            </div>
            <div className="text-xs text-muted-foreground">
              {team.players.length} игрок(ов) · сумма{' '}
              {team.total.toLocaleString('ru-RU')}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Средний
            </div>
            <RatingBadge rating={Math.round(team.avg)} size="md" />
          </div>
        </div>
        {showRoleWarnings && team.violations > 0 && (
          <Badge variant="destructive" className="w-fit">
            Ролевых пересечений: {team.violations}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        {team.players.map((player) => (
          <DraggablePlayerRow
            key={player.accountId}
            accountId={player.accountId}
            role={player.role}
            byId={byId}
          />
        ))}
        {Array.from({ length: Math.max(0, team.size - team.players.length) }).map(
          (_, emptyIndex) => (
            <div
              key={`empty-${emptyIndex}`}
              className="flex h-11 items-center justify-center border border-dashed border-border/70 text-xs text-muted-foreground"
            >
              Пустой слот — перетащите игрока
            </div>
          ),
        )}
      </CardContent>
    </Card>
  )
}

function DraggablePlayerRow(props: {
  accountId: number
  role: Role | null
  byId: Map<number, RatedPlayer>
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${DRAG_PLAYER_PREFIX}${props.accountId}`,
  })
  const rated = props.byId.get(props.accountId)
  const medal = medalFromRankTier(rated?.stats?.profile.rankTier ?? null)

  return (
    <div
      ref={setNodeRef}
      style={
        transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
      }
      className={cn(
        'flex items-center gap-1.5 border-b border-border/70 bg-card/60 px-1.5 py-2 sm:gap-2 sm:px-2',
        isDragging && 'opacity-40',
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Перетащить игрока"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {rated?.player.avatarfull ? (
        <img src={rated.player.avatarfull} alt="" className="size-8 rounded-full" />
      ) : (
        <div className="size-8 rounded-full bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {rated?.player.personaname ?? props.accountId}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <img
            src={medal.iconUrl}
            alt=""
            className="h-3 w-auto"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
          {medal.label}
          {props.role != null && (
            <span className="ml-1 max-w-[9rem] truncate rounded bg-secondary px-1 py-px sm:max-w-none">
              Pos. {props.role} · {ROLE_NAMES[props.role]}
            </span>
          )}
        </div>
      </div>
      <RatingBadge rating={rated?.evaluation?.rating ?? null} size="sm" />
    </div>
  )
}
