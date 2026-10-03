import type { VercelRequest, VercelResponse } from '@vercel/node'

import { json, methodNotAllowed } from './_lib/http.js'

// Hobby-план Vercel по умолчанию ограничен 10 с — без этой директивы тяжёлые
// запросы STRATZ убиваются платформой раньше, чем сработает AbortSignal.
export const maxDuration = 30

/** Клиентский таймаут: fail-fast раньше серверного abort и лимита функции */
const UPSTREAM_TIMEOUT_MS = 12_000

/** Белый список шаблонов наших GraphQL-запросов: прокси не должен пропускать
 *  произвольные запросы к STRATZ с нашим ключом. */
const ALLOWED_QUERY_PREFIXES = [
  'query ($query: String!', // searchPlayersStratz
  'query ($id: Long!', // fetchPlayerStatsStratz
  'query {\n      constants {', // fetchHeroes
]

/** Грубая защита от обхода префикса через вложенные фигурные скобки */
function countBraces(query: string): number {
  let depth = 0
  let max = 0
  for (const ch of query) {
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    max = Math.max(max, depth)
  }
  return max
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    methodNotAllowed(response, ['POST'])
    return
  }

  const apiKey = process.env.STRATZ_API_KEY?.trim()
  if (!apiKey) {
    json(response, 500, { error: 'STRATZ API is not configured' })
    return
  }

  let body: { query?: unknown; variables?: unknown }
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body
  } catch {
    json(response, 400, { error: 'Invalid JSON body' })
    return
  }
  if (
    typeof body?.query !== 'string' ||
    body.query.length > 10_000 ||
    !ALLOWED_QUERY_PREFIXES.some((prefix) => body.query!.trimStart().startsWith(prefix)) ||
    countBraces(body.query) > 6
  ) {
    json(response, 400, { error: 'A GraphQL query is required' })
    return
  }

  try {
    const stratzResponse = await fetch('https://api.stratz.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'STRATZ_API',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
      body: JSON.stringify({
        query: body.query,
        variables: typeof body.variables === 'object' && body.variables != null ? body.variables : {},
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    const text = await stratzResponse.text()
    let result: unknown
    try {
      result = JSON.parse(text)
    } catch {
      console.error('STRATZ returned a non-JSON response', {
        status: stratzResponse.status,
        contentType: stratzResponse.headers.get('content-type'),
        body: text.slice(0, 300),
      })
      json(response, 502, {
        error: `STRATZ returned an invalid response (${stratzResponse.status}): ${text.slice(0, 200)}`,
      })
      return
    }

    json(response, stratzResponse.status, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('STRATZ request failed', message)
    json(response, 502, { error: `Could not reach STRATZ API: ${message}` })
  }
}
