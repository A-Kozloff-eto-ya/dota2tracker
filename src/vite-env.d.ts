/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** STRATZ GraphQL API ключ (общий fallback). Не секрет в клиентской сборке. */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}
