import { useEffect, useState } from 'react'
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

export function useAuth() {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: isSupabaseConfigured })

  useEffect(() => {
    if (!supabase) return
    let active = true

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      const user = data.session?.user ? await loadProfile(data.session.user) : null
      if (active) setState({ session: data.session, user, loading: false })
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
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
