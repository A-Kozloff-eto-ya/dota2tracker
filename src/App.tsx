import { useMemo, useState } from 'react'
import { Toaster } from 'sonner'

import { Header, type TabValue } from '@/components/layout/Header'
import { PlayerList } from '@/components/players/PlayerList'
import { PlayerSearch } from '@/components/players/PlayerSearch'
import { WeightsPanel } from '@/components/rating/WeightsPanel'
import { TeamBuilder } from '@/components/teams/TeamBuilder'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useHeroes } from '@/hooks/useHeroes'
import { usePlayers } from '@/hooks/usePlayers'
import { useRatingConfig } from '@/hooks/useRatingConfig'
import { evaluatePlayer } from '@/lib/rating'
import type { RatedPlayer } from '@/types'

export default function App() {
  const {
    tracked,
    statsMap,
    statusMap,
    errorMap,
    addAccount,
    removePlayer,
    refreshPlayer,
  } = usePlayers()
  const { config, setConfig, resetConfig } = useRatingConfig()
  const heroes = useHeroes()
  const [tab, setTab] = useState<TabValue>('players')

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
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-40 -top-40 size-[36rem] rounded-full bg-primary/15 blur-[130px]" />
          <div className="absolute -right-40 top-1/3 size-[32rem] rounded-full bg-sky-500/10 blur-[130px]" />
          <div className="absolute -bottom-32 left-1/3 size-[28rem] rounded-full bg-amber-500/10 blur-[130px]" />
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
          <Header playersCount={tracked.length} />

          <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
            <TabsContent value="players" className="space-y-6">
              <PlayerSearch onAdd={addAccount} />
              <PlayerList
                rated={rated}
                heroes={heroes}
                config={config}
                onRemove={removePlayer}
                onRefresh={refreshPlayer}
              />
            </TabsContent>
            <TabsContent value="formula">
              <WeightsPanel
                config={config}
                onChange={setConfig}
                onReset={resetConfig}
                rated={rated}
              />
            </TabsContent>
            <TabsContent value="teams">
              <TeamBuilder rated={rated} />
            </TabsContent>
          </main>

          <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-muted-foreground">
            Данные: STRATZ GraphQL API · рейтинг вычисляется локально по настраиваемой формуле
          </footer>
        </Tabs>

        <Toaster theme="dark" position="top-right" richColors closeButton />
      </div>
    </TooltipProvider>
  )
}
