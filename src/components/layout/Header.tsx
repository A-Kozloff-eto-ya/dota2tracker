import { Sigma, Swords, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

export type TabValue = 'players' | 'formula' | 'teams'

interface HeaderProps {
  playersCount: number
}

/** Шапка приложения: логотип и навигация-табы (внешний Tabs-контекст) */
export function Header({ playersCount }: HeaderProps) {
  return (
    <header className="glass sticky top-0 z-40 border-b border-border/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-amber-600 shadow-lg shadow-primary/30">
            <Swords className="size-5 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg tracking-wide">Dota2Tracker</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              рейтинг · команды
            </div>
          </div>
        </div>

        <TabsList className="ml-auto">
          <TabsTrigger value="players">
            <Users className="size-4" />
            <span className="hidden sm:inline">Игроки</span>
            {playersCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5">
                {playersCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="formula">
            <Sigma className="size-4" />
            <span className="hidden sm:inline">Формула</span>
          </TabsTrigger>
          <TabsTrigger value="teams">
            <Swords className="size-4" />
            <span className="hidden sm:inline">Команды</span>
          </TabsTrigger>
        </TabsList>
      </div>
    </header>
  )
}
