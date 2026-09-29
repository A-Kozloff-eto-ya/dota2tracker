import { ExternalLink, KeyRound, Settings, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

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
import { clearApiCache, getStratzApiKey, setStratzApiKey } from '@/lib/storage'

export function SettingsDialog() {
  const [open, setOpen] = useState(false)
  const [stratzKey, setStratzKey] = useState('')

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setStratzKey(getStratzApiKey())
    }
  }

  function save() {
    setStratzApiKey(stratzKey)
    toast.success('Ключ сохранён — будет использоваться в новых запросах.')
  }

  function clearCache() {
    const count = clearApiCache()
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
            Все данные берутся из STRATZ GraphQL API и обрабатываются локально
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stratz-api-key" className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" />
              STRATZ API ключ
            </Label>
            <Input
              id="stratz-api-key"
              value={stratzKey}
              onChange={(event) => setStratzKey(event.target.value)}
              placeholder="JWT-ключ со страницы API на stratz.com"
              autoComplete="off"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Единственный источник данных: игроки, матчи, герои, behavior score и ранк.
              Войдите на stratz.com и получите ключ.{' '}
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
