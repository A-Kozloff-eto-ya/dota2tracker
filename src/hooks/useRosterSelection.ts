import { useCallback, useState } from 'react'

import { STORAGE_KEYS, loadJSON, saveJSON } from '@/lib/storage'

/** Выделение игроков чекбоксами в таблице ростера.
 *  Состояние общее для главной страницы и вкладки «Команды», персистится
 *  локально, чтобы выделение пережило перезагрузку. */
export function useRosterSelection() {
  const [selected, setSelected] = useState<Set<number>>(() => {
    const list = loadJSON<number[]>(STORAGE_KEYS.selection, [])
    return new Set(list.filter((id) => Number.isFinite(id)))
  })

  const persist = useCallback((next: Set<number>) => {
    saveJSON(STORAGE_KEYS.selection, [...next])
  }, [])

  const toggle = useCallback(
    (accountId: number) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(accountId)) next.delete(accountId)
        else next.add(accountId)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const setAll = useCallback(
    (accountIds: number[], checked: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const accountId of accountIds) {
          if (checked) next.add(accountId)
          else next.delete(accountId)
        }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const clear = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      persist(new Set<number>())
      return new Set<number>()
    })
  }, [persist])

  return { selected, toggle, setAll, clear }
}