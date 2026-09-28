import { ExternalLink, KeyRound, Settings, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { resetApiCache } from '@/api/opendota'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  getApiKey,
  getSteamApiKey,
  getStratzApiKey,
  setApiKey,
  setSteamApiKey,
  setStratzApiKey,
} from '@/lib/storage'

export function SettingsDialog() {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [steamKey, setSteamKey] = useState('')
  const [stratzKey, setStratzKey] = useState('')

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setKey(getApiKey())
      setSteamKey(getSteamApiKey())
      setStratzKey(getStratzApiKey())
    }
  }

  function save() {
    setApiKey(key)
    setSteamApiKey(steamKey)
    setStratzApiKey(stratzKey)
    toast.success('Ключи сохранены — будут использоваться в новых запросах.')
  }

  function clearCache() {
    const count = resetApiCache()
    toast.success(count > 0 ? `Кэш очищен (${count} записей)` : 'Кэш и так пуст')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Настройки">
          <Settings className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
          <DialogDescription>
            Все данные берутся из открытого OpenDota API и обрабатываются локально
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key" className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" />
              OpenDota API-ключ (необязательно)
            </Label>
            <Input
              id="api-key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Вставьте ключ, чтобы поднять лимиты"
              autoComplete="off"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Без ключа — около 60 запросов в минуту. С бесплатным ключом — 2000 в день.{' '}
              <a
                className="text-primary underline-offset-2 hover:underline"
                href="https://www.opendota.com/api-keys"
                target="_blank"
                rel="noreferrer"
              >
                Получить ключ
                <ExternalLink className="ml-0.5 inline size-3" />
              </a>
            </p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="steam-api-key" className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" />
              Steam Web API ключ (для ссылок вида /id/)
            </Label>
            <Input
              id="steam-api-key"
              value={steamKey}
              onChange={(event) => setSteamKey(event.target.value)}
              placeholder="Нужен, чтобы резолвить vanity-адреса Steam"
              autoComplete="off"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Официальный конвертер адресов steamcommunity.com/id/ в профили. Бесплатный
              ключ выдаётся мгновенно.{' '}
              <a
                className="text-primary underline-offset-2 hover:underline"
                href="https://steamcommunity.com/dev/apikey"
                target="_blank"
                rel="noreferrer"
              >
                Получить ключ
                <ExternalLink className="ml-0.5 inline size-3" />
              </a>
            </p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="stratz-api-key" className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" />
              STRATZ API ключ (поиск по Steam-никам + второй источник данных)
            </Label>
            <Input
              id="stratz-api-key"
              value={stratzKey}
              onChange={(event) => setStratzKey(event.target.value)}
              placeholder="JWT-ключ со страницы API на stratz.com"
              autoComplete="off"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Находит игроков по нику Steam-профиля и даёт данные (матчи, behavior score)
              даже там, где OpenDota пуст. Войдите на stratz.com через Steam и получите
              ключ.{' '}
              <a
                className="text-primary underline-offset-2 hover:underline"
                href="https://stratz.com/api"
                target="_blank"
                rel="noreferrer"
              >
                Получить ключ
                <ExternalLink className="ml-0.5 inline size-3" />
              </a>
            </p>
          </div>
          <Separator />
          <Button variant="outline" onClick={clearCache} className="w-full">
            <Trash2 className="size-4" />
            Очистить кэш API
          </Button>
          <p className="text-xs text-muted-foreground">
            Список игроков, настройки формулы и кэш хранятся только в вашем браузере
            (localStorage).
          </p>
        </div>
        <DialogFooter>
          <Button onClick={save}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
