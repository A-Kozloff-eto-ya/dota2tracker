// Проверка REST-эндпоинтов STRATZ для перепарсинга игрока
//   node scripts/stratz-probe-rest.mjs [steamId]
import fs from 'node:fs'

const key = (fs.readFileSync('.env', 'utf8').match(/^STRATZ_API_KEY=(.*)$/m) ?? [])[1]?.trim()
if (!key) {
  console.error('STRATZ_API_KEY не найден')
  process.exit(1)
}
const steamId = process.argv[2] ?? '76561197960265728' // Steam test-аккаунт
const candidates = [
  `https://stratz.com${steamId}/refresh`,
  `https://stratz.com${steamId}/retry`,
  `https://stratz.com/api/v1/player/${steamId}/refresh`,
  `https://stratz.com/api/v1/player/${steamId}/retry`,
  `https://api.stratz.com/api/v1/Player/${steamId}/refresh`,
  `https://api.stratz.com/api/v1/Player/${steamId}/retry`,
  `https://api.stratz.com/api/v1/player/${steamId}/refresh`,
  `https://api.stratz.com/players/${steamId}/refresh`,
]
for (const url of candidates) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'STRATZ_API' },
    })
    const text = (await res.text()).slice(0, 160)
    console.log(`${res.status}  POST ${url}\n      ${text.replace(/\n/g, ' ')}`)
  } catch (error) {
    console.log(`ERR  POST ${url}\n      ${error instanceof Error ? error.message : error}`)
  }
}