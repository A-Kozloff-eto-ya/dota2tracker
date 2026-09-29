import { Check, Loader2, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { resolveVanityAccountId, SteamError } from '@/api/steam'
import { searchPlayersStratz } from '@/api/stratz'
import { parsePlayerInput } from '@/lib/playerInput'
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

    setParsedHint(parsed.hint)

    // Ссылка steamcommunity.com/id/<имя> — точное преобразование в SteamID
    // через Steam Web API, затем добавляем как обычный account_id.
    // Если профиль не найден — пробуем искать имя из ссылки по нику.
    if (parsed.kind === 'vanity') {
      setSearching(true)
      try {
        const accountId = await resolveVanityAccountId(parsed.vanity)
        if (accountId == null) {
          toast.info(
            `Профиль steamcommunity.com/id/${parsed.vanity} не найден — ищем по нику`,
          )
          await searchByNickname(parsed.vanity)
          return
        }
        await handleAdd(accountId)
        setValue('')
      } catch (error) {
        toast.error(
          error instanceof SteamError
            ? error.message
            : 'Ошибка преобразования ссылки Steam',
        )
      } finally {
        setSearching(false)
      }
      return
    }

    await searchByNickname(parsed.query)
  }

  /** Поиск по нику через STRATZ GraphQL `search` */
  async function searchByNickname(query: string) {
    setSearching(true)
    try {
      const found = await searchPlayersStratz(query)
      setResults(found.slice(0, 12))

      if (found.length === 0) {
        toast.info('Никого не нашли. Попробуйте точный Steam ID или ссылку на профиль.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка поиска STRATZ')
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  return (
    <Card className="glass border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="font-mono text-xs text-primary">01</span>
          Добавить игрока
        </CardTitle>
        <CardDescription>
          Ник, ссылка на профиль Steam, account_id, SteamID64 или SteamID3
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
            placeholder="https://steamcommunity.com/profiles/7656119…"
            className="flex-1"
          />
          <Button onClick={() => void handleSearch()} disabled={searching || !value.trim()}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Найти
          </Button>
        </div>

        {parsedHint && <Badge variant="outline">{parsedHint}</Badge>}

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
