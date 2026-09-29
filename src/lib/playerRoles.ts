import type { PlayerRole, Role } from '@/types'

export const PLAYER_ROLE_LABELS: Record<PlayerRole, string> = {
  carry: 'Керри',
  mid: 'Мид',
  offlane: 'Оффлейн',
  soft_support: 'Софт-саппорт',
  hard_support: 'Хард-саппорт',
}

export const PLAYER_ROLE_POSITIONS: Record<PlayerRole, Role> = {
  carry: 1,
  mid: 2,
  offlane: 3,
  soft_support: 4,
  hard_support: 5,
}

export function preferredPosition(roles: PlayerRole[]): Role | null {
  return roles.length > 0 ? PLAYER_ROLE_POSITIONS[roles[0]] : null
}
