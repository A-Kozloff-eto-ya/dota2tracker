import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
)

export const isSupabaseConfigured = Boolean(url && anonKey)
export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // PKCE: ссылка из письма возвращает на сайт с ?code=..., обмен кода
        // на сессию выполняет detectSessionInUrl прямо в браузере.
        // Важно: code_verifier лежит в localStorage того браузера, где
        // запрашивали вход, — ссылку нужно открывать там же.
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
