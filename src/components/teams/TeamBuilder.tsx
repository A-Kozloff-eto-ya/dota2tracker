import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Eraser, Shuffle, Users, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { RatingBadge } from '@/components/rating/RatingBadge'
import { TeamBalanceBar } from '@/components/teams/TeamBalanceBar'
import { TeamView } from '@/components/teams/TeamView'
import { MAX_TEAM_COUNT, applyMove, balanceTeams } from '@/lib/teamBalancer'
import { ROLE_NAMES } from '@/lib/medals'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import type { BalanceResult, RatedPlayer, Role } from '@/types'
import { cn } from '@/lib/utils'
import { PLAYER_ROLE_LABELS, preferredPosition } from '@/lib/playerRoles'

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'any', label: 'Любая' },
  { value: '1', label: `1 · ${ROLE_NAMES[1]}` },
  { value: '2', label: `2 · ${ROLE_NAMES[2]}` },
  { value: '3', label: `3 · ${ROLE_NAMES[3]}` },
  { value: '4', label: `4 · ${ROLE_NAMES[4]}` },
  { value: '5', label: `5 · ${ROLE_NAMES[5]}` },
]

const ALL_ROLES: Role[] = [1, 2, 3, 4, 5]

interface TeamBuilderProps {
  rated: RatedPlayer[]
}

export function TeamBuilder({ rated }: TeamBuilderProps) {
  const available = useMemo(
    () => rated.filter((item) => item.evaluation?.rating != null),
    [rated],
  )
  const unavailable = rated.length - available.length

  const [selected, setSelected] = useState<Set<number>>(new Set())
  // A value present in this map is an explicit per-setup override. Without
  // one, the first admin-assigned player tag is used as the default position.
  const [roleOverrides, setRoleOverrides] = useState<Record<number, Role | null>>({})
  const [teamCount, setTeamCount] = useState(2)
  const [respectRoles, setRespectRoles] = useState(false)
  const [variantIndex, setVariantIndex] = useState(0)
  const [result, setResult] = useState<BalanceResult | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const selectedPlayers = useMemo(
    () =>
      available
        .filter((item) => selected.has(item.player.accountId))
        .map((item) => {
          const hasOverride = Object.prototype.hasOwnProperty.call(roleOverrides, item.player.accountId)
          const override = hasOverride ? roleOverrides[item.player.accountId] : undefined
          const taggedRoles = item.player.roles
            .map((playerRole) => preferredPosition([playerRole]))
            .filter((role): role is Role => role != null)
          return {
            accountId: item.player.accountId,
            rating: item.evaluation?.rating ?? 0,
            role: hasOverride ? override ?? null : preferredPosition(item.player.roles),
            allowedRoles: override != null
              ? [override]
              : hasOverride
                ? ALL_ROLES
                : (taggedRoles.length > 0 ? taggedRoles : ALL_ROLES),
          }
        }),
    [available, roleOverrides, selected],
  )

  const byId = useMemo(
    () => new Map(rated.map((item) => [item.player.accountId, item])),
    [rated],
  )

  function toggleSelect(accountId: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
    setVariantIndex(0)
  }

  function runBalance(nextVariant: number) {
    try {
      const balanced = balanceTeams(selectedPlayers, teamCount, respectRoles, 1, nextVariant)
      setResult(balanced)
      setVariantIndex(nextVariant)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сбалансировать')
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!result || !event.over) return
    const accountId = Number(String(event.active.id).slice(2))
    const toIndex = Number(String(event.over.id).replace('team-', ''))
    if (!Number.isFinite(accountId) || !Number.isFinite(toIndex)) return
    setResult(applyMove(result, accountId, toIndex, respectRoles))
  }

  if (available.length === 0) {
    return (
      <Alert>
        <AlertTitle>Нет игроков с рейтингом</AlertTitle>
        <AlertDescription>
          Добавьте игроков на вкладке «Игроки» и дождитесь загрузки статистики — после
          этого их можно распределять по командам.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="glass border-l-2 border-l-primary">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" />
            Пул игроков
          </CardTitle>
          <CardDescription>
            Отметьте участников (по 5 игроков на команду) и при желании переопределите позиции
            {unavailable > 0 ? ` · без рейтинга: ${unavailable}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="scrollbar-thin max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {available.map((item) => {
              const accountId = item.player.accountId
              const isSelected = selected.has(accountId)
              const hasOverride = Object.prototype.hasOwnProperty.call(roleOverrides, accountId)
              const role = hasOverride ? roleOverrides[accountId] ?? null : preferredPosition(item.player.roles)
              return (
                <div
                  key={accountId}
                  className={cn(
                    'flex flex-wrap items-center gap-2 border px-2 py-2 transition-colors sm:gap-3 sm:px-3',
                    isSelected ? 'border-primary/50 bg-primary/5' : 'border-border/70',
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(accountId)}
                    aria-label={`Выбрать ${item.player.personaname}`}
                  />
                  {item.player.avatarfull ? (
                    <img
                      src={item.player.avatarfull}
                      alt=""
                      className="size-9 rounded-full ring-1 ring-border"
                    />
                  ) : (
                    <div className="size-9 rounded-full bg-muted" />
                  )}
                  <div className="min-w-0 flex-1 basis-[calc(100%-7rem)] sm:basis-auto">
                    <div className="truncate text-sm font-medium">
                      {item.player.personaname}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.evaluation?.rating != null
                        ? `Рейтинг ${item.evaluation.rating.toLocaleString('ru-RU')}`
                        : 'нет рейтинга'}
                    </div>
                  </div>
                  <Select
                    value={role != null ? String(role) : 'any'}
                    onValueChange={(value) =>
                     setRoleOverrides((prev) => ({
                        ...prev,
                        [accountId]: value === 'any' ? null : (Number(value) as Role),
                      }))
                    }
                  >
                    <SelectTrigger className="w-full sm:w-36" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {item.player.roles.length > 0 && (
                    <div className="flex basis-full flex-wrap gap-1 sm:basis-auto">
                      {item.player.roles.map((playerRole) => (
                        <Badge key={playerRole} variant="outline" className="text-[10px]">
                          {PLAYER_ROLE_LABELS[playerRole]}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <RatingBadge
                    rating={item.evaluation?.rating ?? null}
                    size="sm"
                    className="hidden w-14 text-right sm:inline-block"
                  />
                </div>
              )
            })}
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="team-count">Команд</Label>
              <Select
                value={String(teamCount)}
                onValueChange={(value) => {
                  setTeamCount(Number(value))
                  setVariantIndex(0)
                }}
              >
                <SelectTrigger id="team-count" className="w-20" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: MAX_TEAM_COUNT - 1 }, (_, i) => i + 2).map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="respect-roles"
                checked={respectRoles}
                onCheckedChange={(checked) => {
                  setRespectRoles(checked)
                  setVariantIndex(0)
                }}
              />
              <Label htmlFor="respect-roles">Учитывать роли</Label>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
              <Badge variant="secondary">
                Выбрано: {selected.size} / нужно минимум {teamCount}
              </Badge>
              {result && (
                <Badge variant="secondary">
                  {result.variantCount != null
                    ? `Вариант ${(variantIndex % result.variantCount) + 1} из ${result.variantCount}`
                    : `Вариант ${variantIndex + 1}`}
                </Badge>
              )}
              <Button
                size="sm"
                onClick={() => runBalance(0)}
                disabled={selected.size < teamCount}
                className="flex-1 sm:flex-none"
              >
                <Wand2 className="size-4" />
                Сбалансировать
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runBalance(variantIndex + 1)}
                disabled={selected.size < teamCount}
                title="Показать следующий по качеству вариант разбиения"
                className="flex-1 sm:flex-none"
              >
                <Shuffle className="size-4" />
                Ещё вариант
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelected(new Set())
                  setResult(null)
                  setVariantIndex(0)
                }}
                disabled={selected.size === 0 && result == null}
              >
                <Eraser className="size-4" />
                Очистить
              </Button>
            </div>
          </div>

          {selected.size > 0 && selected.size % teamCount !== 0 && (
            <p className="text-xs text-gold-bright">
              Выбрано {selected.size} игроков — команды будут неравными (по{' '}
              {Math.floor(selected.size / teamCount)}–{Math.ceil(selected.size / teamCount)}{' '}
              человек).
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <TeamBalanceBar
            result={result}
            variantIndex={
              result.variantCount != null ? variantIndex % result.variantCount : variantIndex
            }
          />
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="grid gap-4 md:grid-cols-2">
              {result.teams.map((team) => (
                <TeamView
                  key={team.index}
                  team={team}
                  teamCount={result.teams.length}
                  byId={byId}
                  showRoleWarnings={respectRoles}
                />
              ))}
            </div>
          </DndContext>
          <p className="text-center text-xs text-muted-foreground">
            Перетаскивайте игроков между командами, чтобы подстроить сетап вручную — средние
            пересчитываются на лету.
          </p>
        </>
      )}
    </div>
  )
}
