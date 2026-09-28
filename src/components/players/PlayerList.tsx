import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { PlayerCard } from '@/components/players/PlayerCard'
import type { HeroInfo, RatedPlayer, RatingConfig } from '@/types'

interface PlayerListProps {
  rated: RatedPlayer[]
  heroes: Map<number, HeroInfo>
  config: RatingConfig
  onRemove: (accountId: number) => void
  onRefresh: (accountId: number) => void
}

export function PlayerList({ rated, heroes, config, onRemove, onRefresh }: PlayerListProps) {
  if (rated.length === 0) {
    return (
      <Alert>
        <AlertTitle>Список пуст</AlertTitle>
        <AlertDescription>
          Найдите игрока по нику или добавьте по Steam ID / ссылке на профиль — рейтинг
          посчитается автоматически из открытых данных OpenDota.
        </AlertDescription>
      </Alert>
    )
  }

  const sorted = [...rated].sort(
    (a, b) => (b.evaluation?.rating ?? -1) - (a.evaluation?.rating ?? -1),
  )

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sorted.map((item) => (
        <PlayerCard
          key={item.player.accountId}
          rated={item}
          heroes={heroes}
          config={config}
          onRemove={onRemove}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  )
}
