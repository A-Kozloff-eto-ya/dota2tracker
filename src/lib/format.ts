// Форматтеры для отображения

export function fmtInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString('ru-RU')
}

export function fmtPct(fraction: number | null | undefined, digits = 1): string {
  if (fraction == null || !Number.isFinite(fraction)) return '—'
  return `${(fraction * 100).toFixed(digits)}%`
}

export function fmtKda(kills: number | null | undefined, deaths: number | null | undefined, assists: number | null | undefined): string {
  if (kills == null || deaths == null || assists == null) return '—'
  return `${kills}/${deaths}/${assists}`
}

export function fmtDecimal(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (seconds < 60) return 'только что'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  return `${days} дн назад`
}

export function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2) return ''
  const base = 0x1f1e6
  const a = code.toUpperCase().codePointAt(0)
  const b = code.toUpperCase().codePointAt(1)
  if (a == null || b == null) return ''
  return String.fromCodePoint(base + (a - 65), base + (b - 65))
}

export function fmtDate(ts: number | string | null | undefined): string {
  if (!ts) return '—'
  const date = typeof ts === 'number' ? new Date(ts * (ts < 1e12 ? 1000 : 1)) : new Date(ts)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}
