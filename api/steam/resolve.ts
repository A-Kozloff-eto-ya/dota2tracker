import type { VercelRequest, VercelResponse } from '@vercel/node'

import { json, methodNotAllowed } from '../_lib/http.js'

interface SteamResponse {
  response?: { success?: number; steamid?: string }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    methodNotAllowed(response, ['GET'])
    return
  }

  const vanity = typeof request.query.vanity === 'string' ? request.query.vanity.trim() : ''
  const key = process.env.STEAM_API_KEY
  if (!vanity || !key) {
    json(response, 400, { error: !key ? 'Steam API is not configured' : 'Missing vanity name' })
    return
  }

  try {
    const steamResponse = await fetch(
      `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(vanity)}`,
      { signal: AbortSignal.timeout(10000) },
    )
    if (!steamResponse.ok) {
      json(response, steamResponse.status === 403 ? 502 : steamResponse.status, {
        error: steamResponse.status === 403 ? 'Steam rejected the API key' : `Steam API error (${steamResponse.status})`,
      })
      return
    }

    const body = (await steamResponse.json()) as SteamResponse
    if (body.response?.success !== 1 || !body.response.steamid) {
      json(response, 404, { error: 'Steam profile was not found' })
      return
    }
    json(response, 200, { steamid: body.response.steamid })
  } catch {
    json(response, 502, { error: 'Could not reach Steam API' })
  }
}
