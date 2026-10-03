import type { VercelRequest, VercelResponse } from '@vercel/node'

import { json, methodNotAllowed } from '../_lib/http.js'

export const maxDuration = 30

/** Таймауты на каждый upstream-запрос (эндпоинтов два — суммарно до 2×) */
const UPSTREAM_TIMEOUT_MS = 10_000
/** Таймаут ответа нашего handler'а клиенту не должен превышать лимит функции */
const CLIENT_TIMEOUT_MS = 15_000

interface RefreshRequestBody {
  steamId?: unknown
}

/** Кандидаты REST-эндпоинтов перепарсинга: stratz.com (сайт, за Cloudflare)
 *  и api.stratz.com (публичный API-хост). Валидным считается 2xx. */
function refreshEndpoints(steamId: string): string[] {
  return [
    `https://stratz.com/api/v1/player/${steamId}/refresh`,
    `https://stratz.com/api/v1/player/${steamId}/retry`,
    `https://api.stratz.com/api/v1/Player/${steamId}/refresh`,
    `https://api.stratz.com/api/v1/Player/${steamId}/retry`,
  ]
}

async function probeEndpoint(url: string, apiKey: string): Promise<number> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': 'STRATZ_API',
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
  // Тело не читаем — важен только статус; освобождаем соединение сразу
  await response.body?.cancel()
  return response.status
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    methodNotAllowed(response, ['POST'])
    return
  }
  // Клиент ждёт не дольше CLIENT_TIMEOUT_MS — abort остального потока
  const clientTimer = setTimeout(() => {
    if (!response.headersSent) {
      json(response, 504, { error: 'Refresh request timed out' })
    }
  }, CLIENT_TIMEOUT_MS)
  clientTimer.unref?.()

  try {
    const apiKey = process.env.STRATZ_API_KEY?.trim()
    if (!apiKey) {
      json(response, 500, { error: 'STRATZ API is not configured' })
      return
    }

    let body: RefreshRequestBody
    try {
      body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body
    } catch {
      json(response, 400, { error: 'Invalid JSON body' })
      return
    }
    const steamId = typeof body?.steamId === 'string' ? body.steamId : ''
    if (!/^\d{17}$/.test(steamId)) {
      json(response, 400, { error: 'A valid steamId (SteamID64) is required' })
      return
    }

    const attempts: Array<{ url: string; status: number | 'error' }> = []
    for (const url of refreshEndpoints(steamId)) {
      try {
        const status = await probeEndpoint(url, apiKey)
        attempts.push({ url, status })
        if (status >= 200 && status < 300) {
          json(response, 200, { success: true, endpoint: url })
          return
        }
      } catch (error) {
        attempts.push({ url, status: 'error' })
        console.error('STRATZ refresh endpoint failed', url, error instanceof Error ? error.message : error)
      }
    }

    json(response, 502, {
      error: 'STRATZ refresh endpoint is unavailable',
      attempts,
    })
  } finally {
    clearTimeout(clientTimer)
  }
}