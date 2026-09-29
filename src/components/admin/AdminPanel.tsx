import { FileUp, RefreshCw, ShieldCheck, Trash2, Upload, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { resolveVanityAccountId } from '@/api/steam'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { parsePlayerInput } from '@/lib/playerInput'
import { supabase } from '@/lib/supabase'
import type { PlayerRole, TrackedPlayer } from '@/types'

interface AdminPanelProps {
  players: TrackedPlayer[]
  onAdd: (accountId: number) => Promise<boolean>
  onRemove: (accountId: number) => Promise<boolean>
  onUpdateRoles: (accountId: number, roles: PlayerRole[]) => Promise<boolean>
  onRefreshAll: () => Promise<{ updated: number; failed: number }>
}

interface AppUserRow {
  id: string
  email: string | null
  display_name: string | null
  role: 'member' | 'admin'
}

const PLAYER_ROLE_OPTIONS: Array<{ value: PlayerRole; label: string }> = [
  { value: 'carry', label: 'Керри' },
  { value: 'mid', label: 'Мид' },
  { value: 'offlane', label: 'Оффлейн' },
  { value: 'soft_support', label: 'Софт-саппорт' },
  { value: 'hard_support', label: 'Хард-саппорт' },
]

export function AdminPanel({ players, onAdd, onRemove, onUpdateRoles, onRefreshAll }: AdminPanelProps) {
  const [input, setInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [users, setUsers] = useState<AppUserRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [savingPlayer, setSavingPlayer] = useState<number | null>(null)
  const [selectedPlayers, setSelectedPlayers] = useState<Set<number>>(new Set())
  const [deleteTargetIds, setDeleteTargetIds] = useState<number[]>([])
  const [deleting, setDeleting] = useState(false)

  async function loadUsers() {
    if (!supabase) return
    setLoadingUsers(true)
    const { data } = await supabase
      .from('users')
      .select('id, email, display_name, role')
      .order('created_at')
    setUsers((data ?? []) as AppUserRow[])
    setLoadingUsers(false)
  }

  useEffect(() => {
    const task = window.setTimeout(() => { void loadUsers() }, 0)
    return () => window.clearTimeout(task)
  }, [])

  async function readFile(file: File) {
    setInput(await file.text())
  }

  async function importPlayers() {
    const lines = input
      .split(/[\n,;]+/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0 || importing) return

    setImporting(true)
    const existing = new Set(players.map((player) => player.accountId))
    const unique = new Set<number>()
    let added = 0
    let skipped = 0
    let failed = 0
    const failures: string[] = []

    for (const line of lines) {
      try {
        const parsed = parsePlayerInput(line)
        let accountId: number | null = null
        if (parsed.kind === 'accountId') accountId = parsed.accountId
        if (parsed.kind === 'vanity') accountId = await resolveVanityAccountId(parsed.vanity)
        if (parsed.kind === 'query') {
          failed += 1
          failures.push(`${line}: массовый импорт принимает только Steam-ссылки и ID`)
          continue
        }
        if (accountId == null || unique.has(accountId) || existing.has(accountId)) {
          if (accountId == null) {
            failed += 1
            failures.push(`${line}: Steam-профиль не найден`)
          } else {
            skipped += 1
          }
          continue
        }
        unique.add(accountId)
        if (await onAdd(accountId)) added += 1
        else {
          failed += 1
          failures.push(`${line}: не удалось загрузить статистику или сохранить игрока в базе`)
        }
      } catch (error) {
        failed += 1
        failures.push(`${line}: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`)
      }
    }

    setInput('')
    setImportErrors(failures)
    setImporting(false)
    toast.success(`Импорт завершён: добавлено ${added}, пропущено ${skipped}, ошибок ${failed}`)
  }

  async function toggleRole(user: AppUserRow) {
    if (!supabase) return
    const nextRole = user.role === 'admin' ? 'member' : 'admin'
    const { error } = await supabase.from('users').update({ role: nextRole }).eq('id', user.id)
    if (error) toast.error(error.message)
    else {
      toast.success(nextRole === 'admin' ? 'Пользователь стал администратором' : 'Права администратора сняты')
      await loadUsers()
    }
  }

  async function togglePlayerRole(player: TrackedPlayer, role: PlayerRole) {
    const roles = player.roles.includes(role)
      ? player.roles.filter((value) => value !== role)
      : [...player.roles, role]
    setSavingPlayer(player.accountId)
    const saved = await onUpdateRoles(player.accountId, roles)
    setSavingPlayer(null)
    if (!saved) toast.error(`Не удалось сохранить роли игрока ${player.personaname}`)
  }

  function toggleSelected(accountId: number) {
    setSelectedPlayers((previous) => {
      const next = new Set(previous)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }

  function toggleAllSelected() {
    setSelectedPlayers((previous) => {
      if (previous.size === players.length) return new Set()
      return new Set(players.map((player) => player.accountId))
    })
  }

  async function confirmDelete() {
    if (deleteTargetIds.length === 0 || deleting) return
    setDeleting(true)
    let removed = 0
    for (const accountId of deleteTargetIds) {
      if (await onRemove(accountId)) removed += 1
    }
    setSelectedPlayers((previous) => {
      const next = new Set(previous)
      deleteTargetIds.forEach((accountId) => next.delete(accountId))
      return next
    })
    setDeleteTargetIds([])
    setDeleting(false)
    if (removed === deleteTargetIds.length) toast.success(`Удалено игроков: ${removed}`)
    else toast.error(`Удалено ${removed} из ${deleteTargetIds.length}`)
  }

  async function refreshAll() {
    if (refreshingAll) return
    setRefreshingAll(true)
    const result = await onRefreshAll()
    setRefreshingAll(false)
    toast.success(`Обновление завершено: ${result.updated} успешно, ${result.failed} ошибок`)
  }

  return (
    <div className="space-y-6">
      <Card className="glass border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Upload className="size-4 text-primary" />Массовый импорт</CardTitle>
          <CardDescription>Одна Steam-ссылка или ID на строку. Поддерживаются также запятые и точка с запятой.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="https://steamcommunity.com/id/player_one" rows={7} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <label><FileUp className="size-4" />Загрузить TXT<input className="sr-only" type="file" accept=".txt,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file) }} /></label>
            </Button>
            <Button onClick={() => void importPlayers()} disabled={importing || !input.trim()}>
              {importing ? 'Импорт...' : 'Добавить в пул'}
            </Button>
          </div>
          {importErrors.length > 0 && (
            <div className="border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <div className="mb-1 font-medium">Не обработаны:</div>
              <ul className="space-y-1">
                {importErrors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Игроки общего пула</CardTitle>
              <CardDescription>Назначайте несколько игровых ролей каждому игроку.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void refreshAll()} disabled={refreshingAll || players.length === 0}>
                <RefreshCw className={refreshingAll ? 'size-4 animate-spin' : 'size-4'} />
                {refreshingAll ? 'Обновление...' : 'Обновить всех'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteTargetIds([...selectedPlayers])}
                disabled={selectedPlayers.size === 0 || deleting}
              >
                <Trash2 className="size-4" />
                Удалить выбранных ({selectedPlayers.size})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {players.length > 0 && (
              <div className="flex items-center gap-2 border-b border-border py-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={selectedPlayers.size === players.length ? true : selectedPlayers.size > 0 ? 'indeterminate' : false}
                  onCheckedChange={toggleAllSelected}
                  aria-label="Выбрать всех игроков"
                />
                <span>Выбрать всех игроков</span>
              </div>
            )}
            {players.map((player) => (
              <div key={player.accountId} className="flex flex-wrap items-center gap-3 py-3">
                <Checkbox
                  checked={selectedPlayers.has(player.accountId)}
                  onCheckedChange={() => toggleSelected(player.accountId)}
                  aria-label={`Выбрать ${player.personaname}`}
                />
                {player.avatarfull ? <img src={player.avatarfull} alt="" className="size-9 rounded-full" /> : <div className="size-9 rounded-full bg-muted" />}
                <div className="min-w-32 flex-1">
                  <div className="truncate text-sm font-medium">{player.personaname}</div>
                  <div className="text-xs text-muted-foreground">{player.accountId}</div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-2">
                  {PLAYER_ROLE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={player.roles.includes(option.value)}
                        disabled={savingPlayer === player.accountId}
                        onCheckedChange={() => void togglePlayerRole(player, option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setDeleteTargetIds([player.accountId])} title="Удалить из пула">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {players.length === 0 && <div className="py-4 text-sm text-muted-foreground">Пул пуст.</div>}
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4 text-primary" />Пользователи</CardTitle>
          <CardDescription>Администраторы могут управлять общим пулом и назначать новых администраторов.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingUsers ? <div className="text-sm text-muted-foreground">Загрузка...</div> : (
            <div className="divide-y divide-border">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1"><div className="truncate text-sm">{user.display_name ?? user.email}</div><div className="text-xs text-muted-foreground">{user.email}</div></div>
                  <Button size="sm" variant={user.role === 'admin' ? 'secondary' : 'outline'} onClick={() => void toggleRole(user)}>
                    {user.role === 'admin' && <ShieldCheck className="size-3.5" />}{user.role === 'admin' ? 'Администратор' : 'Назначить админом'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteTargetIds.length > 0} onOpenChange={(open) => { if (!open && !deleting) setDeleteTargetIds([]) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить игроков?</DialogTitle>
            <DialogDescription>
              Игроков будет удалено из общего пула: <strong>{deleteTargetIds.length}</strong>. Статистика и роли этих игроков тоже исчезнут из приложения.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>Отмена</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? 'Удаление...' : 'Да, удалить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
