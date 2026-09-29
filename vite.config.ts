import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Steam Web API не отдаёт CORS-заголовки — ходим через локальный прокси.
      // В продакшене аналогичный прокси нужно настроить на хостинге.
      '/steamapi': {
        target: 'https://api.steampowered.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/steamapi/, ''),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
