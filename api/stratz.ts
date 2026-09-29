import type { VercelRequest, VercelResponse } from '@vercel/node'

import { json, methodNotAllowed } from './_lib/http'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    methodNotAllowed(response, ['POST'])
    return
  }

  const apiKey = process.env.STRATZ_API_KEY
  if (!apiKey) {
    json(response, 500, { error: 'STRATZ API is not configured' })
    return
  }

  const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body
  if (!body || typeof body.query !== 'string') {
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
      body: JSON.stringify({ query: body.query, variables: body.variables ?? {} }),
      signal: AbortSignal.timeout(15000),
    })
    const result = await stratzResponse.json()
    json(response, stratzResponse.status, result)
  } catch {
    json(response, 502, { error: 'Could not reach STRATZ API' })
  }
}
