import type { PlayerStats } from '@/types'

/**
 * Слияние данных двух источников (STRATZ — основной, OpenDota — дополнение):
 * берём наиболее полную версию каждой части статистики.
 */
export function mergeStats(stratz: PlayerStats, od: PlayerStats): PlayerStats {
  const stratzTotal = stratz.wl.win + stratz.wl.lose
  const odTotal = od.wl.win + od.wl.lose
  const sp = stratz.profile
  const odP = od.profile

  const profile = {
    accountId: sp.accountId,
    // Steam-ник из STRATZ приоритетнее, если OpenDota вернул заглушку «Игрок N»
    personaname:
      odP.personaname && !/^Игрок \d+$/.test(odP.personaname)
        ? odP.personaname
        : sp.personaname,
    name: odP.name ?? sp.name,
    avatarfull: odP.avatarfull ?? sp.avatarfull,
    steamid: odP.steamid ?? sp.steamid,
    profileurl: odP.profileurl ?? sp.profileurl,
    loccountrycode: odP.loccountrycode ?? sp.loccountrycode,
    // Ранк STRATZ обычно свежее; MMR-оценка и лидерборд — только в OpenDota
    rankTier: sp.rankTier ?? odP.rankTier,
    leaderboardRank: odP.leaderboardRank ?? sp.leaderboardRank,
    computedMmr: odP.computedMmr ?? sp.computedMmr,
  }

  // Нулевые герои (скрытые профили OpenDota) не должны «перебивать» реальные списки
  const stratzHeroes = stratz.heroes.filter((h) => h.games > 0)
  const odHeroes = od.heroes.filter((h) => h.games > 0)

  return {
    profile,
    // Глобальный счётчик матчей у STRATZ полнее (OpenDota считает только распарсенные)
    wl: stratzTotal >= odTotal ? stratz.wl : od.wl,
    // Последние матчи и герои — тот источник, где данных больше
    recentMatches:
      stratz.recentMatches.length >= od.recentMatches.length
        ? stratz.recentMatches
        : od.recentMatches,
    heroes: stratzHeroes.length >= odHeroes.length ? stratzHeroes : odHeroes,
    behaviorScore: stratz.behaviorScore ?? od.behaviorScore ?? null,
  }
}