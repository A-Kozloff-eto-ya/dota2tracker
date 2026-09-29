/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** STRATZ GraphQL API ключ (общий fallback). Не секрет в клиентской сборке. */
  readonly VITE_STRATZ_API_KEY?: string
}
