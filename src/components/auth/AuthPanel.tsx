import { LogIn, LogOut, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { AppUser } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AuthPanelProps {
  configured: boolean
  loading: boolean
  user: AppUser | null
  onSignIn: (email: string) => Promise<{ error: unknown }>
  onSignOut: () => void
}

export function AuthPanel({ configured, loading, user, onSignIn, onSignOut }: AuthPanelProps) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  if (!configured) {
    return <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:block">Local mode</span>
  }
  if (loading) return <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Loading...</span>
  if (user) {
    return (
      <div className="flex items-center gap-2">
        {user.role === 'admin' && <ShieldCheck className="size-3.5 text-primary" aria-label="Администратор" />}
        <span className="hidden max-w-32 truncate text-xs sm:block">{user.displayName}</span>
        <Button variant="outline" size="sm" onClick={onSignOut} title="Выйти">
          <LogOut className="size-3.5" />
        </Button>
      </div>
    )
  }

  async function submit() {
    if (!email.trim() || sending || cooldown > 0) return
    setSending(true)
    const { error } = await onSignIn(email.trim())
    setSending(false)
    if (error) toast.error(error instanceof Error ? error.message : 'Не удалось отправить ссылку')
    else {
      setCooldown(60)
      toast.success('Ссылка для входа отправлена на почту')
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') void submit() }}
        placeholder="email"
        type="email"
        className="h-8 w-24 text-xs sm:w-44"
      />
      <Button size="sm" onClick={() => void submit()} disabled={sending || cooldown > 0 || !email.trim()}>
        <LogIn className="size-3.5" />
        <span className="hidden sm:inline">{cooldown > 0 ? `${cooldown} сек` : 'Войти'}</span>
      </Button>
    </div>
  )
}
