import { Check, Loader2, Search, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { searchPlayers } from '@/api/opendota'
import { parsePlayerInput, resolveVanity } from '@/api/steam'
import { searchPlayersStratz } from '@/api/stratz'
import { getStratzApiKey } from '@/lib/storage'
import type { SearchEntry } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const QUICK_EXAMPLES = ['Dendi', 'Miracle-', 'SumaiL', 'Puppey']

interface PlayerSearchProps {
  onAdd: (accountId: number, personaname?: string, avatarfull?: string | null) => Promise<boolean>
}

export function PlayerSearch({ onAdd }: PlayerSearchProps) {
  const [value, setValue] = useState('')
  const [parsedHint, setParsedHint] = useState<string | null>(null)
  const [results, setResults] = useState<SearchEntry[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState<number | null>(null)
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set())

  async function handleAdd(
    accountId: number,
    personaname?: string,
    avatarfull?: string | null,
  ) {
    setAddingId(accountId)
    try {
      const ok = await onAdd(accountId, personaname, avatarfull)
      if (ok) {
        toast.success(`${personaname ?? `Игрок ${accountId}`} — статистика загружена`)
        setAddedIds((prev) => new Set(prev).add(accountId))
      } else {
        toast.error('Не удалось загрузить статистику. Попробуйте ещё раз позже.')
      }
    } finally {
      setAddingId(null)
    }
  }

  async function handleSearch(raw?: string) {
    const query = raw ?? value
    if (!query.trim() || searching) return
    const parsed = parsePlayerInput(query)

    if (parsed.kind === 'empty') return
    if (parsed.kind === 'accountId') {
      setParsedHint(null)
      await handleAdd(parsed.accountId)
      setValue('')
      setResults([])
      return
    }

    if (parsed.kind === 'vanity') {
      await handleVanity(parsed.vanity)
      return
    }

    setParsedHint(parsed.hint)
    await searchByNickname(parsed.query)
  }

  /** Ссылка steamcommunity.com/id/<vanity>: резолвим в account_id (Steam Web API
   *  при наличии ключа, иначе публичный XML-профиль) и добавляем игрока */
  async function handleVanity(vanity: string) {
    setParsedHint('Резолвим vanity-адрес Steam…')
    setSearching(true)
    try {
      const accountId = await resolveVanity(vanity)
      if (accountId == null) {
        setParsedHint('Vanity-адрес Steam (/id/)')
        toast.info('Steam не нашёл профиль с таким адресом')
        return
      }
      await handleAdd(accountId)
      setValue('')
      setResults([])
      return
    } catch (error) {
      setParsedHint('Vanity-адрес Steam (/id/)')
      toast.error(error instanceof Error ? error.message : 'Ошибка резолва vanity-адреса')
      return
    } finally {
      setSearching(false)
    }
  }

  /** Параллельный поиск: OpenDota (Dota-ники) + STRATZ (Steam-ники), с дедупликацией */
  async function searchByNickname(query: string) {
    setSearching(true)
    try {
      const hasStratz = getStratzApiKey() !== ''
      const [odSettled, stratzSettled] = await Promise.allSettled([
        searchPlayers(query),
        hasStratz ? searchPlayersStratz(query) : Promise.resolve<SearchEntry[]>([]),
      ])

      const odList = odSettled.status === 'fulfilled' ? odSettled.value : []
      const stratzList = stratzSettled.status === 'fulfilled' ? stratzSettled.value : []

      if (odSettled.status === 'rejected') {
        toast.error(
          odSettled.reason instanceof Error ? odSettled.reason.message : 'Ошибка поиска OpenDota',
        )
      } else if (hasStratz && stratzSettled.status === 'rejected') {
        toast.warning(
          stratzSettled.reason instanceof Error
            ? stratzSettled.reason.message
            : 'Поиск STRATZ не удался',
        )
      }

      const merged: SearchEntry[] = [...odList]
      for (const entry of stratzList) {
        if (!merged.some((existing) => existing.accountId === entry.accountId)) {
          merged.push(entry)
        }
      }
      setResults(merged.slice(0, 12))

      if (merged.length === 0) {
        toast.info('Никого не нашли. Попробуйте точный Steam ID или ссылку на профиль.')
      }
    } finally {
      setSearching(false)
    }
  }

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="size-4 text-primary" />
          Добавить игрока
        </CardTitle>
        <CardDescription>
          Ник, account_id, SteamID64, SteamID3 или ссылка на профиль Steam
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSearch()
            }}
            placeholder="Например: Dendi или 70388657"
            className="flex-1"
          />
          <Button onClick={() => void handleSearch()} disabled={searching || !value.trim()}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Найти
          </Button>
        </div>

        {parsedHint && <Badge variant="outline">{parsedHint}</Badge>}

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Примеры:
          {QUICK_EXAMPLES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setValue(name)
                void handleSearch(name)
              }}
              className="rounded-full border border-border px-2 py-0.5 transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {name}
            </button>
          ))}
        </div>

        {results.length > 0 && (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {results.map((entry) => {
              const added = addedIds.has(entry.accountId)
              const busy = addingId === entry.accountId
              return (
                <div key={entry.accountId} className="flex items-center gap-3 p-2.5">
                  {entry.avatarfull ? (
                    <img
                      src={entry.avatarfull}
                      alt=""
                      className="size-9 rounded-full ring-1 ring-border"
                    />
                  ) : (
                    <div className="size-9 rounded-full bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{entry.personaname}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {entry.source === 'stratz' ? 'STRATZ' : 'OpenDota'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ID {entry.accountId.toLocaleString('ru-RU')}
                      {entry.lastMatchTime ? ` · матч: ${fmtDate(entry.lastMatchTime)}` : ''}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={added ? 'secondary' : 'default'}
                    disabled={added || busy}
                    onClick={() =>
                      void handleAdd(entry.accountId, entry.personaname, entry.avatarfull)
                    }
                    className={cn(added && 'text-radiant-bright')}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : added ? (
                      <Check className="size-4" />
                    ) : null}
                    {added ? 'В списке' : 'Добавить'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
