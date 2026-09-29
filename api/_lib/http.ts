import type { VercelResponse } from '@vercel/node'

export function json(response: VercelResponse, status: number, body: unknown): void {
  response.status(status).setHeader('Content-Type', 'application/json').send(body)
}

export function methodNotAllowed(response: VercelResponse, methods: string[]): void {
  response.setHeader('Allow', methods.join(', '))
  json(response, 405, { error: 'Method not allowed' })
}
