import type { PlayerRole, Role } from '@/types'

export const PLAYER_ROLE_LABELS: Record<PlayerRole, string> = {
  carry: 'Carry',
  mid: 'Mid',
  offlane: 'Offlane',
  soft_support: 'Soft Support',
  hard_support: 'Hard Support',
}

export const PLAYER_ROLE_POSITIONS: Record<PlayerRole, Role> = {
  carry: 1,
  mid: 2,
  offlane: 3,
  soft_support: 4,
  hard_support: 5,
}

export const POSITION_LABELS: Record<Role, string> = {
  1: 'Carry',
  2: 'Mid',
  3: 'Offlane',
  4: 'Soft Support',
  5: 'Hard Support',
}

export function preferredPosition(roles: PlayerRole[]): Role | null {
  return roles.length > 0 ? PLAYER_ROLE_POSITIONS[roles[0]] : null
}
