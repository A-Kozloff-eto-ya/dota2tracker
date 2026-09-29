import { useEffect, useMemo, useState } from 'react'
import { Toaster } from 'sonner'

import { Header, type TabValue } from '@/components/layout/Header'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { PageHead } from '@/components/layout/PageHead'
import { PlayerList } from '@/components/players/PlayerList'
import { PlayerSearch } from '@/components/players/PlayerSearch'
import { WeightsPanel } from '@/components/rating/WeightsPanel'
import { TeamBuilder } from '@/components/teams/TeamBuilder'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useHeroes } from '@/hooks/useHeroes'
import { usePlayers } from '@/hooks/usePlayers'
import { useRatingConfig } from '@/hooks/useRatingConfig'
import { useAuth } from '@/hooks/useAuth'
import { evaluatePlayer } from '@/lib/rating'
import type { RatedPlayer } from '@/types'

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
    statsPeriodMonths,
    setStatsPeriodMonths,
  } = usePlayers({ userId: auth.user?.id, isAdmin: auth.user?.role === 'admin' })
  const { config, setConfig, resetConfig } = useRatingConfig()
  const heroes = useHeroes()
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

  const rated = useMemo<RatedPlayer[]>(
    () =>
      tracked.map((player) => {
        const entry = statsMap[player.accountId]
        const stats = entry?.stats ?? null
        return {
          player,
          stats,
          status: statusMap[player.accountId] ?? (entry ? 'loaded' : 'idle'),
          error: errorMap[player.accountId] ?? null,
          fetchedAt: entry?.fetchedAt ?? null,
          evaluation: evaluatePlayer(stats, config),
        }
      }),
    [tracked, statsMap, statusMap, errorMap, config],
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

          <main className="mx-auto w-full max-w-6xl space-y-6 px-3 py-6 sm:space-y-8 sm:px-4 sm:py-8 md:px-6 md:py-12">
            <TabsContent value="players" className="space-y-6">
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
              <PlayerList
                rated={rated}
                heroes={heroes}
                config={config}
                statsPeriodMonths={statsPeriodMonths}
                onStatsPeriodChange={setStatsPeriodMonths}
                onRemove={removePlayer}
                onRefresh={refreshPlayer}
                canManage={!auth.configured || auth.user?.role === 'admin'}
              />
            </TabsContent>
            <TabsContent value="formula">
              <PageHead
                index="002"
                kicker="RATING ENGINE"
                title="Формула рейтинга"
                meta={[{ label: 'MODE', value: 'LOCAL' }, { label: 'SCALE', value: '0—10000' }]}
              />
              <WeightsPanel
                config={config}
                onChange={setConfig}
                onReset={resetConfig}
                rated={rated}
              />
            </TabsContent>
            <TabsContent value="teams">
              <PageHead
                index="003"
                kicker="MATCH BUILDER"
                title="Команды"
                meta={[{ label: 'PLAYERS', value: String(tracked.length).padStart(2, '0') }]}
              />
              <TeamBuilder rated={rated} />
            </TabsContent>
            {auth.user?.role === 'admin' && (
              <TabsContent value="admin">
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
