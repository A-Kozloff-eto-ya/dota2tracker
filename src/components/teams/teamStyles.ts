// Визуальные стили команд (Radiant / Dire / дополнительные)

export const TEAM_STYLES = [
  {
    name: 'Radiant',
    text: 'text-primary',
    bar: 'bg-radiant',
    ring: 'ring-primary/60',
    border: 'border-primary/40',
  },
  {
    name: 'Dire',
    text: 'text-dire-bright',
    bar: 'bg-dire',
    ring: 'ring-dire/60',
    border: 'border-dire/40',
  },
  {
    name: 'Команда 3',
    text: 'text-gold-bright',
    bar: 'bg-gold',
    ring: 'ring-gold/60',
    border: 'border-gold/40',
  },
  {
    name: 'Команда 4',
    text: 'text-sky-300',
    bar: 'bg-sky-500',
    ring: 'ring-sky-500/60',
    border: 'border-sky-500/40',
  },
  {
    name: 'Команда 5',
    text: 'text-fuchsia-300',
    bar: 'bg-fuchsia-500',
    ring: 'ring-fuchsia-500/60',
    border: 'border-fuchsia-500/40',
  },
  {
    name: 'Команда 6',
    text: 'text-orange-300',
    bar: 'bg-orange-500',
    ring: 'ring-orange-500/60',
    border: 'border-orange-500/40',
  },
] as const

export function teamStyle(index: number) {
  return TEAM_STYLES[index % TEAM_STYLES.length]
}

export function teamDisplayName(index: number, teamCount: number): string {
  if (teamCount === 2) return index === 0 ? 'Radiant' : 'Dire'
  if (index === 0) return 'Radiant'
  if (index === 1) return 'Dire'
  return `Команда ${index + 1}`
}
