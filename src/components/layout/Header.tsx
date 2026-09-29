import { Moon, Shield, Sigma, Sun, Swords, Users } from 'lucide-react'
import type { ComponentProps } from 'react'

import { AuthPanel } from '@/components/auth/AuthPanel'
import { Badge } from '@/components/ui/badge'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

export type TabValue = 'players' | 'formula' | 'teams' | 'admin'

interface HeaderProps {
  playersCount: number
  theme: 'dark' | 'light'
  onThemeToggle: () => void
  auth: ComponentProps<typeof AuthPanel>
  showAdmin: boolean
}

/** Шапка приложения: логотип и навигация-табы (внешний Tabs-контекст) */
export function Header({ playersCount, theme, onThemeToggle, auth, showAdmin }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-6 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-7 shrink-0 place-items-center border border-primary bg-primary/10 text-primary">
            <Swords className="size-3.5" />
          </div>
          <div className="leading-tight">
            <div className="font-mono text-sm font-medium tracking-tight">Dota2Tracker</div>
            <div className="tlabel mt-1 hidden sm:block">BALANCE SYSTEM / 01</div>
          </div>
        </div>

        <TabsList variant="line" className="ml-auto h-10 gap-1 bg-transparent p-0">
          <TabsTrigger value="players">
            <Users className="size-3.5" />
            <span>Игроки</span>
            {playersCount > 0 && (
              <Badge variant="secondary" className="ml-1 rounded-sm px-1.5 py-0 text-[10px]">
                {playersCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="formula">
            <Sigma className="size-3.5" />
            <span>Формула</span>
          </TabsTrigger>
          <TabsTrigger value="teams">
            <Swords className="size-3.5" />
            <span>Команды</span>
          </TabsTrigger>
          {showAdmin && (
            <TabsTrigger value="admin">
              <Shield className="size-3.5" />
              <span>Админ</span>
            </TabsTrigger>
          )}
        </TabsList>
        <AuthPanel {...auth} />
        <button
          type="button"
          onClick={onThemeToggle}
          className="grid size-8 shrink-0 place-items-center border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >
          {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </button>
      </div>
    </header>
  )
}
