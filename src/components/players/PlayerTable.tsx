import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eraser,
  Eye,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Swords,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { PlayerDetailDialog } from '@/components/players/PlayerDetailDialog'
import { ratingTierClass } from '@/lib/ratingTier'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { fmtDecimal, fmtInt, fmtPct, timeAgo } from '@/lib/format'
import { medalFromRankTier } from '@/lib/medals'
import { positionMatches } from '@/lib/rating'
import { overrideFor, type RatingOverrideScope } from '@/lib/ratingOverrides'
import { PLAYER_ROLE_LABELS, POSITION_LABELS } from '@/lib/playerRoles'
import { cn } from '@/lib/utils'
import type {
  HeroInfo,
  PoolBenchmarks,
  RatedPlayer,
  RatingConfig,
  Role,
  RoleBenchmark,
} from '@/types'

const ALL_ROLES: Role[] = [1, 2, 3, 4, 5]

const ROLE_SHORT: Record<Role, string> = {
  1: 'Carry',
  2: 'Mid',
  3: 'Off',
  4: 'Soft',
  5: 'Hard',
}

const ROLE_SORT: Record<Role, SortKey> = { 1: 'r1', 2: 'r2', 3: 'r3', 4: 'r4', 5: 'r5' }

type SortKey =
  | 'name'
  | 'rank'
  | 'rating'
  | 'r1'
  | 'r2'
  | 'r3'
  | 'r4'
  | 'r5'
  | 'matches'
  | 'winrate'
  | 'kda'
  | 'gpm'
  | 'xpm'
  | 'dpm'
  | 'updated'

interface SortState {
  key: SortKey
  desc: boolean
}

/** Общие классы ячейки данных (фон строки задаёт CSS .roster-row) */
const CELL = 'border-b border-r border-border/40 px-2 py-1 align-middle'
/** Пустых колонок после оценок ролей: Матчи, WR, KDA, GPM, XPM, DPM, Обновлено, Действия */
const TAIL_COLUMNS = 8

interface RowModel {
  item: RatedPlayer
  name: string
  rank: number | null
  rating: number | null
  roles: Record<Role, number | null>
  matches: number
  recent: number
  winrate: number | null
  kda: number | null
  gpm: number | null
  xpm: number | null
  dpm: number | null
  updated: number | null
}

function buildRow(item: RatedPlayer, recencyMonths: number): RowModel {
  const stats = item.stats
  const total = stats ? stats.wl.win + stats.wl.lose : 0
  const perf = item.evaluation?.perf
  return {
    item,
    name: item.player.personaname,
    rank: stats?.profile.rankTier ?? null,
    rating: item.evaluation?.rating ?? null,
    roles: {
      1: item.roleEvaluations[1]?.rating ?? null,
      2: item.roleEvaluations[2]?.rating ?? null,
      3: item.roleEvaluations[3]?.rating ?? null,
      4: item.roleEvaluations[4]?.rating ?? null,
      5: item.roleEvaluations[5]?.rating ?? null,
    },
    matches: total,
    recent: stats ? positionMatches(stats.recentMatches, null, recencyMonths).length : 0,
    winrate: stats && total > 0 ? stats.wl.win / total : null,
    kda: perf?.kda ?? null,
    gpm: perf?.gpm ?? null,
    xpm: perf?.xpm ?? null,
    dpm: perf?.dpm ?? null,
    updated: item.fetchedAt,
  }
}

function sortValue(row: RowModel, key: SortKey): number | string | null {
  switch (key) {
    case 'name':
      return row.name
    case 'rank':
      return row.rank
    case 'rating':
      return row.rating
    case 'r1':
    case 'r2':
    case 'r3':
    case 'r4':
    case 'r5':
      return row.roles[Number(key[1]) as Role]
    case 'matches':
      return row.matches
    case 'winrate':
      return row.winrate
    case 'kda':
      return row.kda
    case 'gpm':
      return row.gpm
    case 'xpm':
      return row.xpm
    case 'dpm':
      return row.dpm
    case 'updated':
      return row.updated
  }
}

interface RatingCellProps {
  /** Текущее число в ячейке (авторасчёт с учётом уже применённых override) */
  auto: number | null
  override: number | null
  canEdit: boolean
  title: string
  onCommit: (value: number) => void
  onReset: () => void
}

/** Ячейка оценки в стиле Excel: клик — inline-редактирование 1..100,
 *  Enter/blur — сохранить, Esc — отмена, пустой ввод — сброс на авторасчёт */
function RatingCell({ auto, override, canEdit, title, onCommit, onReset }: RatingCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const value = override ?? auto

  function start() {
    setDraft(override != null ? String(override) : auto != null ? String(auto) : '')
    setEditing(true)
  }

  function commit() {
    const text = draft.trim()
    if (text === '') {
      if (override != null) onReset()
    } else {
      const parsed = Number(text)
      if (Number.isFinite(parsed)) {
        onCommit(Math.min(100, Math.max(1, Math.round(parsed))))
      }
    }
    setEditing(false)
  }

  const valueClass = value != null ? ratingTierClass(value) : 'text-muted-foreground/50'

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        inputMode="numeric"
        min={1}
        max={100}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setEditing(false)
        }}
        className="h-7 w-full min-w-14 rounded-none border border-ring bg-background px-1 text-right font-mono text-sm tabular-nums outline-none"
      />
    )
  }

  const content = (
    <>
      <span>{value != null ? Math.round(value) : '—'}</span>
      {override != null && <Pencil className="size-2.5 shrink-0 text-gold" aria-hidden="true" />}
    </>
  )

  if (!canEdit) {
    return (
      <span
        title={title}
        className={cn(
          'flex h-7 w-full items-center justify-end gap-1 font-mono text-sm tabular-nums',
          valueClass,
        )}
      >
        {content}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      title={
        override != null
          ? `${title}. Ручная оценка — очистите поле и нажмите Enter, чтобы вернуть авторасчёт`
          : `${title} — клик, чтобы задать вручную`
      }
      className={cn(
        'flex h-7 w-full items-center justify-end gap-1 font-mono text-sm tabular-nums transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        valueClass,
        override != null && 'underline decoration-dashed decoration-gold/60 underline-offset-4',
      )}
    >
      {content}
    </button>
  )
}

interface SortHeaderProps {
  label: string
  sub?: string
  sortKey: SortKey
  sort: SortState
  onSort: (key: SortKey) => void
  className?: string
  title?: string
}

function SortHeader({ label, sub, sortKey, sort, onSort, className, title }: SortHeaderProps) {
  const active = sort.key === sortKey
  const Icon = active ? (sort.desc ? ArrowDown : ArrowUp) : ArrowUpDown
  return (
    <th
      scope="col"
      title={title}
      className={cn(
        'sticky top-16 z-20 border-b border-r border-border bg-card px-2 py-1.5 text-left align-bottom',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex flex-col items-start gap-0.5 transition-colors hover:text-foreground',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em]">
          {label}
          <Icon className={cn('size-3', !active && 'opacity-40')} />
        </span>
        {sub != null && (
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground/80">
            {sub}
          </span>
        )}
      </button>
    </th>
  )
}

/** Эталонные значения показателей роли: KDA · GPM (полные — в тултипе) */
function EtalonCell({ bench }: { bench: RoleBenchmark }) {
  if (bench.thresholds == null) {
    return <span className="text-muted-foreground/50">—</span>
  }
  const { kda, gpm, xpm, dpm } = bench.thresholds
  return (
    <span
      className="font-mono text-[10px] tabular-nums text-muted-foreground"
      title={`Эталон: KDA ${fmtDecimal(kda, 1)} · GPM ${fmtInt(gpm)} · XPM ${fmtInt(xpm)} · DPM ${fmtInt(dpm)}`}
    >
      {fmtDecimal(kda, 1)} · {fmtInt(gpm)}
    </span>
  )
}

export interface PlayerTableProps {
  rated: RatedPlayer[]
  heroes: Map<number, HeroInfo>
  config: RatingConfig
  benchmarks: PoolBenchmarks
  statsPeriodMonths: number
  onStatsPeriodChange: (months: number) => void
  onRefresh: (accountId: number) => void
  onRemove: (accountId: number) => void
  onRatingOverride: (accountId: number, scope: RatingOverrideScope, value: number | null) => void
  canManage: boolean
  selected: Set<number>
  onToggleSelect: (accountId: number) => void
  onSetAllSelected: (accountIds: number[], checked: boolean) => void
  onClearSelection: () => void
  onGoToTeams: () => void
}

/** Главная страница в виде таблицы-Excel: все игроки с оценками (общая и
 *  по позициям 1–5), inline-редактирование оценок и выделение чекбоксами
 *  для распределения по командам. */
export function PlayerTable({
  rated,
  heroes,
  config,
  benchmarks,
  statsPeriodMonths,
  onStatsPeriodChange,
  onRefresh,
  onRemove,
  onRatingOverride,
  canManage,
  selected,
  onToggleSelect,
  onSetAllSelected,
  onClearSelection,
  onGoToTeams,
}: PlayerTableProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>({ key: 'rating', desc: true })
  const [detailId, setDetailId] = useState<number | null>(null)

  /** Профиль считается «скрытым/несинхронизированным»: нет матчей и нет ошибок
   *  загрузки — как раз кейс «только открыл профиль в Dota 2». */
  function isStaleProfile(item: RatedPlayer): boolean {
    if (item.status === 'loading' || item.error) return false
    if (!item.stats) return false
    const total = item.stats.wl.win + item.stats.wl.lose
    return total === 0 && item.stats.recentMatches.length === 0
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rated
    return rated.filter((item) => item.player.personaname.toLowerCase().includes(q))
  }, [rated, query])

  const rows = useMemo(() => {
    const built = filtered.map((item) => buildRow(item, config.recencyMonths))
    const dir = sort.desc ? -1 : 1
    built.sort((a, b) => {
      const va = sortValue(a, sort.key)
      const vb = sortValue(b, sort.key)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'ru') * dir
      }
      return (va - vb) * dir
    })
    return built
  }, [filtered, sort, config.recencyMonths])

  const visibleIds = useMemo(
    () => rows.map((row) => row.item.player.accountId),
    [rows],
  )
  const selectedVisible = visibleIds.filter((id) => selected.has(id)).length
  const allChecked =
    visibleIds.length > 0 ? (selectedVisible === visibleIds.length ? true : selectedVisible > 0 ? 'indeterminate' : false) : false

  function handleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, desc: !prev.desc } : { key, desc: key !== 'name' },
    )
  }

  if (rated.length === 0) {
    return (
      <Alert>
        <AlertTitle>Список пуст</AlertTitle>
        <AlertDescription>
          Найдите игрока по нику или добавьте по Steam ID / ссылке на профиль — оценка
          посчитается автоматически из данных STRATZ.
        </AlertDescription>
      </Alert>
    )
  }

  const detailItem =
    detailId != null
      ? rated.find((item) => item.player.accountId === detailId) ?? null
      : null

  return (
    <div className="mx-auto w-fit max-w-full space-y-2">
      {/* Тулбар */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по нику…"
            className="h-8 w-48 pl-8"
          />
        </div>
        <Select
          value={String(statsPeriodMonths)}
          onValueChange={(value) => onStatsPeriodChange(Number(value))}
        >
          <SelectTrigger className="w-40" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Последний месяц</SelectItem>
            <SelectItem value="3">Последние 3 месяца</SelectItem>
            <SelectItem value="6">Последние 6 месяцев</SelectItem>
            <SelectItem value="12">Последний год</SelectItem>
            <SelectItem value="0">За всё время</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {rows.length} из {rated.length} игроков
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">Выбрано: {selected.size}</Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearSelection}
            disabled={selected.size === 0}
          >
            <Eraser className="size-4" />
            Сбросить
          </Button>
          <Button size="sm" onClick={onGoToTeams} disabled={selected.size === 0}>
            <Swords className="size-4" />
            К командам
          </Button>
        </div>
      </div>

      {/* Таблица: на всю ширину экрана, без внутреннего скролла —
          скроллится сама страница, шапка прилипает под шапкой приложения.
          На узких экранах (< md) разрешён горизонтальный скролл. */}
      <div className="scrollbar-thin overflow-x-auto border border-border/70 xl:overflow-x-clip">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-16 z-30 w-10 min-w-10 border-b border-r border-border bg-card px-1 py-2"
              >
                <div className="flex justify-center">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={(checked) => onSetAllSelected(visibleIds, checked === true)}
                    aria-label="Выбрать всех игроков"
                  />
                </div>
              </th>
              <SortHeader
                label="Игрок"
                sortKey="name"
                sort={sort}
                onSort={handleSort}
                className="sticky left-10 z-30 min-w-[190px]"
              />
              <SortHeader
                label="Медаль"
                sortKey="rank"
                sort={sort}
                onSort={handleSort}
                className="w-[110px]"
                title="Публичная медаль (rank_tier)"
              />
              <th
                scope="col"
                className="sticky top-16 z-20 w-[110px] border-b border-r border-border bg-card px-2 py-1.5 text-left align-bottom"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Позиции
                </span>
              </th>
              <SortHeader
                label="Оценка"
                sortKey="rating"
                sort={sort}
                onSort={handleSort}
                className="w-[84px]"
                title="Общая оценка 1–100"
              />
              {ALL_ROLES.map((role) => (
                <SortHeader
                  key={role}
                  label={String(role)}
                  sub={ROLE_SHORT[role]}
                  sortKey={ROLE_SORT[role]}
                  sort={sort}
                  onSort={handleSort}
                  className="w-[76px]"
                  title={`Оценка на позиции ${POSITION_LABELS[role]}`}
                />
              ))}
              <SortHeader
                label="Матчи"
                sortKey="matches"
                sort={sort}
                onSort={handleSort}
                className="w-[70px]"
                title="Всего матчей (win + lose)"
              />
              <SortHeader
                label="WR"
                sortKey="winrate"
                sort={sort}
                onSort={handleSort}
                className="w-[64px]"
                title="Winrate за всё время"
              />
              <SortHeader
                label="KDA"
                sortKey="kda"
                sort={sort}
                onSort={handleSort}
                className="w-[64px]"
                title="KDA формы за окно актуальности"
              />
              <SortHeader
                label="GPM"
                sortKey="gpm"
                sort={sort}
                onSort={handleSort}
                className="w-[64px]"
                title="Средний GPM формы за окно"
              />
              <SortHeader
                label="XPM"
                sortKey="xpm"
                sort={sort}
                onSort={handleSort}
                className="w-[64px]"
                title="Средний XPM формы за окно"
              />
              <SortHeader
                label="DPM"
                sortKey="dpm"
                sort={sort}
                onSort={handleSort}
                className="w-[64px]"
                title="Урон по героям в минуту за окно"
              />
              <SortHeader
                label="Обновлено"
                sortKey="updated"
                sort={sort}
                onSort={handleSort}
                className="w-[110px]"
                title="Когда загружена статистика"
              />
              <th
                scope="col"
                className="sticky top-16 z-20 w-[96px] border-b border-border bg-card px-2 py-1.5 text-right align-bottom"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Действия
                </span>
              </th>
            </tr>
          </thead>

          <tbody>
            {/* Строка эталонов пула — относительно кого считается оценка */}
            <tr className="roster-bench">
              <td className={cn(CELL, 'sticky left-0 z-10')} />
              <td className={cn(CELL, 'sticky left-10 z-10')}>
                <span
                  className="tlabel"
                  title="Эталонные показатели пула по позициям (KDA · GPM): перцентиль матчей игроков позиции за окно. Настраивается во вкладке «Формула»"
                >
                  Эталон · {config.benchmark.mode}
                </span>
              </td>
              <td className={CELL} />
              <td className={CELL}>
                <span
                  className="font-mono text-[10px] text-muted-foreground"
                  title="Игроков, попавших в расчёт эталона"
                >
                  {benchmarks.overall.players} игр
                </span>
              </td>
              <td className={CELL}>
                <div className="flex justify-end">
                  <EtalonCell bench={benchmarks.overall} />
                </div>
              </td>
              {ALL_ROLES.map((role) => (
                <td key={role} className={CELL}>
                  <div className="flex justify-end">
                    <EtalonCell bench={benchmarks.byRole[role]} />
                  </div>
                </td>
              ))}
              {Array.from({ length: TAIL_COLUMNS }, (_, index) => (
                <td key={`tail-${index}`} className={index === TAIL_COLUMNS - 1 ? cn(CELL, 'border-r-0') : CELL} />
              ))}
            </tr>

            {rows.map((row) => {
              const item = row.item
              const accountId = item.player.accountId
              const isSelected = selected.has(accountId)
              const medal = medalFromRankTier(row.rank)
              const busy = item.status === 'loading'
              const stale = isStaleProfile(item)
              const perf = item.evaluation?.perf
              return (
                <tr
                  key={accountId}
                  className="roster-row"
                  data-selected={isSelected ? 'true' : undefined}
                >
                  <td className={cn(CELL, 'sticky left-0 z-10')}>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect(accountId)}
                        aria-label={`Выбрать ${item.player.personaname}`}
                      />
                    </div>
                  </td>
                  <td className={cn(CELL, 'sticky left-10 z-10')}>
                    <button
                      type="button"
                      onClick={() => setDetailId(accountId)}
                      title="Открыть профиль и историю матчей"
                      className="flex w-full items-center gap-2 text-left"
                    >
                      {item.player.avatarfull ? (
                        <img
                          src={item.player.avatarfull}
                          alt=""
                          className="size-8 shrink-0 rounded-full object-cover ring-1 ring-border"
                        />
                      ) : (
                        <span className="size-8 shrink-0 rounded-full bg-muted" />
                      )}
                      <span className="min-w-0">
                        <span className="block max-w-[170px] truncate text-sm font-medium leading-tight">
                          {item.player.personaname}
                        </span>
                        <span className="mt-0.5 flex h-3 items-center gap-1 text-[10px] leading-none text-muted-foreground">
                          {busy ? (
                            <>
                              <Loader2 className="size-3 animate-spin" />
                              загрузка…
                            </>
                          ) : item.error ? (
                            <span className="truncate text-destructive" title={item.error}>
                              {item.error}
                            </span>
                          ) : (
                            <span className="font-mono">#{accountId}</span>
                          )}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className={cn(CELL, 'w-[110px]')}>
                    <div className="flex items-center gap-1.5">
                      <img
                        src={medal.iconUrl}
                        alt=""
                        className="size-5 shrink-0 object-contain"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                      <span className="min-w-0 truncate text-[11px] text-muted-foreground">{medal.label}</span>
                      {stale && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={-1} className="inline-flex text-gold-bright">
                                <Info className="size-3.5 shrink-0" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-64 text-left leading-snug">
                              Если вы только что открыли профиль в Dota 2, нажмите кнопку
                              обновления (⟳). Также убедитесь, что включили пункт
                              «Общедоступная история матчей» именно внутри настроек самой
                              игры (вкладка «Сообщество»), а не только в приватности Steam.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </td>
                  <td className={cn(CELL, 'w-[110px]')}>
                    {item.player.roles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.player.roles.map((playerRole) => (
                          <Badge key={playerRole} variant="outline" className="px-1 py-0 text-[9px]">
                            {PLAYER_ROLE_LABELS[playerRole]}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className={cn(CELL, 'w-[84px]')}>
                    <RatingCell
                      auto={row.rating}
                      override={overrideFor(item.player.ratingOverrides, 'overall')}
                      canEdit={canManage}
                      title="Общая оценка (1–100)"
                      onCommit={(value) => onRatingOverride(accountId, 'overall', value)}
                      onReset={() => onRatingOverride(accountId, 'overall', null)}
                    />
                  </td>
                  {ALL_ROLES.map((role) => (
                    <td key={role} className={cn(CELL, 'w-[76px]')}>
                      <RatingCell
                        auto={row.roles[role]}
                        override={overrideFor(item.player.ratingOverrides, role)}
                        canEdit={canManage}
                        title={`Оценка на позиции ${POSITION_LABELS[role]}`}
                        onCommit={(value) => onRatingOverride(accountId, role, value)}
                        onReset={() => onRatingOverride(accountId, role, null)}
                      />
                    </td>
                  ))}
                  <td
                    className={cn(CELL, 'text-right font-mono tabular-nums')}
                    title={`Свежих матчей в окне актуальности: ${row.recent}`}
                  >
                    {item.stats ? fmtInt(row.matches) : '—'}
                  </td>
                  <td className={cn(CELL, 'text-right font-mono tabular-nums')}>
                    {fmtPct(row.winrate, 0)}
                  </td>
                  <td
                    className={cn(CELL, 'text-right font-mono tabular-nums')}
                    title={`Форма за окно: ${perf?.sampleSize ?? 0} матчей`}
                  >
                    {fmtDecimal(row.kda, 1)}
                  </td>
                  <td className={cn(CELL, 'text-right font-mono tabular-nums')}>
                    {fmtInt(row.gpm)}
                  </td>
                  <td className={cn(CELL, 'text-right font-mono tabular-nums')}>
                    {fmtInt(row.xpm)}
                  </td>
                  <td className={cn(CELL, 'text-right font-mono tabular-nums')}>
                    {fmtInt(row.dpm)}
                  </td>
                  <td className={cn(CELL, 'text-[10px] text-muted-foreground')}>
                    {timeAgo(row.updated) || '—'}
                  </td>
                  <td className={cn(CELL, 'border-r-0')}>
                    <div className="flex items-center justify-end gap-0.5">
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => onRefresh(accountId)}
                          disabled={busy}
                          title="Обновить статистику"
                        >
                          {busy ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setDetailId(accountId)}
                        title="Профиль и история матчей"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemove(accountId)}
                          title="Убрать из списка"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>


                </tr>
              )
            })}

            {rows.length === 0 && (
              <tr className="roster-row">
                <td
                  colSpan={18}
                  className={cn(CELL, 'border-r-0 py-8 text-center text-sm text-muted-foreground')}
                >
                  Никого не найдено по запросу «{query}»
                </td>
              </tr>
            )}
          </tbody>

        </table>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Клик по ячейке оценки — задать значение вручную (1–100); очистить поле и нажать Enter —
        вернуть авторасчёт. Ручные оценки задают шкалу: авторасчёты остальных игроков
        пересчитываются относительно них. Клик по заголовку — сортировка. Чекбокс — выделить
        игрока для распределения по командам.
      </p>

      {detailItem != null && (
        <PlayerDetailDialog
          player={detailItem.player}
          stats={detailItem.stats}
          heroes={heroes}
          config={config}
          benchmarks={benchmarks}
          evaluation={detailItem.evaluation}
          roleFilter={null}
          open
          onOpenChange={(open) => {
            if (!open) setDetailId(null)
          }}
        />
      )}
    </div>
  )
}



