import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Session, User } from '@supabase/supabase-js'

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export interface AppUser {
  id: string
  email: string | null
  displayName: string | null
  role: 'member' | 'admin'
}

interface AuthState {
  session: Session | null
  user: AppUser | null
  loading: boolean
}

async function loadProfile(authUser: User): Promise<AppUser> {
  const { data } = await supabase!.from('users').select('email, display_name, role').eq('id', authUser.id).maybeSingle()
  return {
    id: authUser.id,
    email: data?.email ?? authUser.email ?? null,
    displayName: data?.display_name ?? authUser.email ?? null,
    role: data?.role === 'admin' ? 'admin' : 'member',
  }
}

const AUTH_URL_KEYS = [
  'code',
  'error',
  'error_code',
  'error_description',
  'access_token',
  'refresh_token',
] as const

/** Убрать из адресной строки служебные параметры входа (?code=, ?error=…) */
function stripAuthParamsFromUrl() {
  const url = new URL(window.location.href)
  let touched = false
  for (const key of AUTH_URL_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      touched = true
    }
  }
  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.slice(1))
    for (const key of AUTH_URL_KEYS) {
      if (hashParams.has(key)) {
        hashParams.delete(key)
        touched = true
      }
    }
    url.hash = hashParams.toString() ? `#${hashParams.toString()}` : ''
  }
  if (touched) {
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: isSupabaseConfigured })

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true

    // Переход по ссылке из письма возвращает пользователя на сайт с
    // ?code=... (PKCE) либо с ?error=... — раньше обе ситуации
    // обрабатывались молча и пользователь просто оставался разлогинен.
    const searchParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const urlParam = (key: string) => searchParams.get(key) ?? hashParams.get(key)
    const urlError = urlParam('error_description') ?? urlParam('error_code') ?? urlParam('error')
    const urlCode = urlParam('code')

    void (async () => {
      const { data } = await client.auth.getSession()
      if (!active) return

      if (urlError != null) {
        // Supabase отклонил переход: чаще всего redirect_to не добавлен
        // в Authentication → URL Configuration → Redirect URLs.
        toast.error('Вход по ссылке не удался', { description: urlError })
        stripAuthParamsFromUrl()
      } else if (urlCode != null && data.session == null) {
        // Обмен кода на сессию не состоялся: обычно ссылку открыли в другом
        // браузере или на другом устройстве, где нет сохранённого code_verifier.
        toast.error('Не удалось подтвердить вход по ссылке', {
          description:
            'Ссылку нужно открывать в том же браузере, где запрашивали вход. Запросите новую ссылку здесь и откройте её в этом же браузере.',
        })
        stripAuthParamsFromUrl()
      }

      const user = data.session?.user ? await loadProfile(data.session.user) : null
      if (active) setState({ session: data.session, user, loading: false })
    })()

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        const user = session?.user ? await loadProfile(session.user) : null
        if (active) setState({ session, user, loading: false })
      })()
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  return {
    ...state,
    configured: isSupabaseConfigured,
    signIn: async (email: string) => {
      if (!supabase) return { error: new Error('Supabase не настроен') }
      return supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
    },
    signOut: () => supabase?.auth.signOut(),
  }
}
