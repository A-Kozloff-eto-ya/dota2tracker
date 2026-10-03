import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Локальный dev-хост для серверлес-роутов из api/ (в проде их обслуживает
 * Vercel). Роуты выполняются тем же кодом, поэтому отдельный процесс
 * на :3000 и прокси больше не нужны.
 */
function vercelApiDev(): Plugin {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      // Серверные переменные из .env (STEAM_API_KEY, STRATZ_API_KEY) —
      // Vite кладёт в process.env только VITE_-префиксные.
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] == null) process.env[key] = value
      }
      server.middlewares.use('/api', (req, res, next) => {
        void (async () => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          // /stratz -> api/stratz.ts; /steam/resolve -> api/steam/resolve.ts
          const segments = url.pathname.split('/').filter(Boolean)
          const candidates = [
            `api/${segments.join('/')}.ts`,
            `api/${segments.join('/')}/index.ts`,
          ]
          let mod: { default?: unknown } | null = null
          for (const candidate of candidates) {
            try {
              mod = await server.ssrLoadModule(`/${candidate}`)
              break
            } catch (error) {
              if (candidate === candidates[candidates.length - 1]) {
                // Модуль реально не найден или упал при импорте
                console.error(`[api] failed to load ${candidate}`, error)
              }
            }
          }
          const handler = mod?.default
          if (typeof handler !== 'function') {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: `No API route for ${url.pathname}` }))
            return
          }

          const body =
            req.method === 'POST' || req.method === 'PUT'
              ? await new Promise<string>((resolve) => {
                  const chunks: Buffer[] = []
                  req.on('data', (chunk: Buffer) => chunks.push(chunk))
                  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
                })
              : ''
          const query = Object.fromEntries(url.searchParams.entries())
          const vercelReq = Object.assign(req, {
            body: body.length > 0 ? body : null,
            query,
          })
          const vercelRes = {
            headersSent: false,
            statusCode: 200,
            headers: new Map<string, string>(),
            status(code: number) {
              this.statusCode = code
              return this
            },
            setHeader(name: string, value: string) {
              this.headers.set(name.toLowerCase(), value)
              return this
            },
            getHeader(name: string) {
              return this.headers.get(name.toLowerCase()) ?? undefined
            },
            send(payload: unknown) {
              this.headersSent = true
              res.statusCode = this.statusCode
              for (const [name, value] of this.headers) res.setHeader(name, value)
              res.end(typeof payload === 'string' ? payload : JSON.stringify(payload))
            },
          }
          try {
            await (
              handler as (
                req: typeof vercelReq,
                res: typeof vercelRes,
              ) => Promise<void> | void
            )(vercelReq, vercelRes)
          } catch (error) {
            console.error('[api] handler error', error)
            if (!vercelRes.headersSent) {
              vercelRes.status(502).setHeader('Content-Type', 'application/json').send({
                error: 'API handler crashed',
              })
            }
          }
        })().catch((error) => {
          console.error('[api] middleware error', error)
          next(error)
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApiDev()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Раздувание бандла — в основном крупные vendor-зависимости;
        // выносим их в отдельные кэшируемые чанки
        advancedChunks: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'dnd-vendor', test: /node_modules[\\/]@dnd-kit[\\/]/ },
            { name: 'supabase-vendor', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'icons-vendor', test: /node_modules[\\/]lucide-react[\\/]/ },
          ],
        },
      },
    },
  },
})
