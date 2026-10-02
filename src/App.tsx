import { useCallback, useEffect, useMemo, useState } from 'react'
import { Toaster } from 'sonner'

import { Header, type TabValue } from '@/components/layout/Header'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { PageHead } from '@/components/layout/PageHead'
import { PlayerTable } from '@/components/players/PlayerTable'
import { PlayerSearch } from '@/components/players/PlayerSearch'
import { WeightsPanel } from '@/components/rating/WeightsPanel'
import { TeamBuilder } from '@/components/teams/TeamBuilder'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useHeroes } from '@/hooks/useHeroes'
import { usePlayers } from '@/hooks/usePlayers'
import { useRatingConfig } from '@/hooks/useRatingConfig'
import { useRosterSelection } from '@/hooks/useRosterSelection'
import { useAuth } from '@/hooks/useAuth'
import { evaluatePlayer } from '@/lib/rating'
import { computeBenchmarks } from '@/lib/benchmark'
import {
  overrideFor,
  type RatingOverrideScope,
} from '@/lib/ratingOverrides'
import {
  calibratedEvaluation,
  makeRatingScale,
  type RatingAnchor,
  type RatingScale,
} from '@/lib/ratingScale'
import type { PlayerEvaluation, RatedPlayer, Role, TrackedPlayer } from '@/types'

const ALL_ROLES: Role[] = [1, 2, 3, 4, 5]

/** Якоря колонки: пары «сырой авторасчёт → ручное значение» игроков
 *  с ручной оценкой в этой колонке. Игрок без авторасчёта (нет статистики)
 *  якорем не становится — шкале не от чего отталкиваться. */
function collectAnchors(
  tracked: TrackedPlayer[],
  rawById: Map<
    number,
    { overall: PlayerEvaluation | null; roles: Record<Role, PlayerEvaluation | null> }
  >,
  scope: RatingOverrideScope,
): RatingAnchor[] {
  const anchors: RatingAnchor[] = []
  for (const player of tracked) {
    const manual = overrideFor(player.ratingOverrides ?? null, scope)
    if (manual == null) continue
    const raw = rawById.get(player.accountId)
    const auto =
      raw == null
        ? null
        : scope === 'overall'
          ? raw.overall?.rating ?? null
          : raw.roles[scope]?.rating ?? null
    if (auto != null) anchors.push({ auto, manual })
  }
  return anchors
}

export default function App() {
  const auth = useAuth()
  const {
    tracked,
    statsMap,
    statusMap,
    errorMap,
    addAccount,
    removePlayer,
    refreshPlayer,
    refreshAll,
    updatePlayerRoles,
    setRatingOverride,
    statsPeriodMonths,
    setStatsPeriodMonths,
  } = usePlayers({ userId: auth.user?.id, isAdmin: auth.user?.role === 'admin' })
  const { config, setConfig, resetConfig } = useRatingConfig()
  const heroes = useHeroes()
  const {
    selected,
    toggle: toggleSelected,
    setAll: setAllSelected,
    clear: clearSelected,
  } = useRosterSelection()
  const [tab, setTab] = useState<TabValue>('players')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = window.localStorage.getItem('dota2tracker-theme')
    return saved === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem('dota2tracker-theme', theme)
  }, [theme])

  const benchmarkPlayers = useMemo(
    () =>
      tracked.map((player) => ({
        accountId: player.accountId,
        personaname: player.personaname,
        stats: statsMap[player.accountId]?.stats ?? null,
      })),
    [tracked, statsMap],
  )
  const benchmarks = useMemo(
    () => computeBenchmarks(benchmarkPlayers, config),
    [benchmarkPlayers, config],
  )

  const rated = useMemo<RatedPlayer[]>(() => {
    // 1) Сырые авторасчёты: общая и по позициям 1..5 относительно эталонов пула
    const rawById = new Map<
      number,
      { overall: PlayerEvaluation | null; roles: Record<Role, PlayerEvaluation | null> }
    >()
    for (const player of tracked) {
      const stats = statsMap[player.accountId]?.stats ?? null
      const roles = {} as Record<Role, PlayerEvaluation | null>
      for (const role of ALL_ROLES) {
        roles[role] = evaluatePlayer(stats, config, role, benchmarks)
      }
      rawById.set(player.accountId, {
        overall: evaluatePlayer(stats, config, null, benchmarks),
        roles,
      })
    }

    // 2) Шкалы колонок: ручная оценка игрока — якорь «авторасчёт → вручную»;
    //    авторасчёты остальных пересчитываются в шкалу якорей (общая к общей,
    //    каждая позиция к своей), чтобы вся таблица жила в одной шкале.
    const overallScale = makeRatingScale(collectAnchors(tracked, rawById, 'overall'))
    const roleScales = {} as Record<Role, RatingScale>
    for (const role of ALL_ROLES) {
      roleScales[role] = makeRatingScale(collectAnchors(tracked, rawById, role))
    }

    // 3) Эффективные оценки уходят во все вкладки — сортировка таблицы
    //    и балансировка команд сразу считают по откалиброванным значениям
    return tracked.map((player) => {
      const entry = statsMap[player.accountId]
      const overrides = player.ratingOverrides ?? null
      const raw = rawById.get(player.accountId) ?? null
      const evaluation = calibratedEvaluation(
        raw?.overall ?? null,
        overrideFor(overrides, 'overall'),
        overallScale,
      )
      const roleEvaluations = {} as Record<Role, PlayerEvaluation | null>
      for (const role of ALL_ROLES) {
        roleEvaluations[role] = calibratedEvaluation(
          raw?.roles[role] ?? null,
          overrideFor(overrides, role),
          roleScales[role],
        )
      }
      return {
        player,
        stats: entry?.stats ?? null,
        status: statusMap[player.accountId] ?? (entry ? 'loaded' : 'idle'),
        error: errorMap[player.accountId] ?? null,
        fetchedAt: entry?.fetchedAt ?? null,
        evaluation,
        roleEvaluations,
      }
    })
  }, [tracked, statsMap, statusMap, errorMap, config, benchmarks])

  const handleRatingOverride = useCallback(
    (accountId: number, scope: RatingOverrideScope, value: number | null) => {
      void setRatingOverride(accountId, scope, value)
    },
    [setRatingOverride],
  )

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative min-h-dvh">
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
          <Header
            playersCount={tracked.length}
            theme={theme}
            onThemeToggle={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            showAdmin={auth.user?.role === 'admin'}
            auth={{
              configured: auth.configured,
              loading: auth.loading,
              user: auth.user,
              onSignIn: auth.signIn,
              onSignOut: () => { void auth.signOut() },
            }}
          />

          <main className="w-full space-y-6 px-3 py-6 sm:space-y-8 sm:px-4 sm:py-8 md:px-6 md:py-12">
            <TabsContent value="players" className="space-y-6">
              <div className="mx-auto w-full max-w-6xl space-y-6">
                <PageHead
                  index="001"
                  kicker="ROSTER"
                  title="Игроки"
                  meta={[
                    { label: 'TRACKED', value: String(tracked.length).padStart(2, '0') },
                    { label: 'SOURCE', value: 'STRATZ API' },
                  ]}
                />
                {(!auth.configured || auth.user?.role === 'admin') && <PlayerSearch onAdd={addAccount} />}
                {auth.configured && auth.user?.role !== 'admin' && (
                  <Alert>
                    <AlertTitle>Пулом управляют администраторы</AlertTitle>
                    <AlertDescription>Добавлять, удалять и обновлять игроков могут только администраторы.</AlertDescription>
                  </Alert>
                )}
              </div>
              <PlayerTable
                rated={rated}
                heroes={heroes}
                config={config}
                benchmarks={benchmarks}
                statsPeriodMonths={statsPeriodMonths}
                onStatsPeriodChange={setStatsPeriodMonths}
                onRefresh={refreshPlayer}
                onRemove={removePlayer}
                onRatingOverride={handleRatingOverride}
                canManage={!auth.configured || auth.user?.role === 'admin'}
                selected={selected}
                onToggleSelect={toggleSelected}
                onSetAllSelected={setAllSelected}
                onClearSelection={clearSelected}
                onGoToTeams={() => setTab('teams')}
              />
            </TabsContent>
            <TabsContent value="formula" className="mx-auto w-full max-w-6xl space-y-6">
              <PageHead
                index="002"
                kicker="RATING ENGINE"
                title="Формула рейтинга"
                meta={[{ label: 'MODE', value: 'LOCAL' }, { label: 'SCALE', value: '1—100' }]}
              />
              <WeightsPanel
                config={config}
                onChange={setConfig}
                onReset={resetConfig}
                rated={rated}
                benchmarks={benchmarks}
              />
            </TabsContent>
            <TabsContent value="teams" className="mx-auto w-full max-w-6xl space-y-6">
              <PageHead
                index="003"
                kicker="MATCH BUILDER"
                title="Команды"
                meta={[{ label: 'PLAYERS', value: String(tracked.length).padStart(2, '0') }]}
              />
              <TeamBuilder
                rated={rated}
                selected={selected}
                onToggleSelected={toggleSelected}
                onClearSelected={clearSelected}
              />
            </TabsContent>
            {auth.user?.role === 'admin' && (
              <TabsContent value="admin" className="mx-auto w-full max-w-6xl space-y-6">
                <PageHead
                  index="004"
                  kicker="ACCESS CONTROL"
                  title="Администрирование"
                  meta={[{ label: 'PLAYERS', value: String(tracked.length).padStart(2, '0') }]}
                />
                <AdminPanel
                  players={tracked}
                  onAdd={addAccount}
                  onRemove={removePlayer}
                  onUpdateRoles={updatePlayerRoles}
                  onRefreshAll={refreshAll}
                />
              </TabsContent>
            )}
          </main>

          <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 pb-8 pt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground md:gap-4 md:px-6">
            <span>STRATZ GraphQL API</span>
            <span>LOCAL RATING / 2026</span>
          </footer>
        </Tabs>

        <Toaster theme={theme} position="top-right" richColors closeButton />
      </div>
    </TooltipProvider>
  )
}
