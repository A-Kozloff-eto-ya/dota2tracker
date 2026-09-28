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
      // Steam Web API не отдаёт CORS-заголовки — проксируем через dev-сервер
      '/steamapi': {
        target: 'https://api.steampowered.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/steamapi/, ''),
      },
      // Публичные XML-профили Steam — для резолва vanity-адресов без ключей
      '/steamcommunity': {
        target: 'https://steamcommunity.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/steamcommunity/, ''),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
