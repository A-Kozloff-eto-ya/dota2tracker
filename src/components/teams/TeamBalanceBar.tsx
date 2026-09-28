import { fmtInt } from '@/lib/format'
import type { BalanceResult } from '@/types'
import { cn } from '@/lib/utils'
import { teamStyle } from '@/components/teams/teamStyles'

interface TeamBalanceBarProps {
  result: BalanceResult
  /** Эффективный индекс показанного варианта (0 — лучший) */
  variantIndex: number
}

/** Сравнение средних рейтингов команд горизонтальными барами */
export function TeamBalanceBar({ result, variantIndex }: TeamBalanceBarProps) {
  const max = Math.max(...result.teams.map((t) => t.avg), 1)

  return (
    <div className="glass space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Сравнение средних рейтингов</span>
        <span
          className={cn(
            'font-semibold tabular-nums',
            result.spread <= 100 && 'text-radiant-bright',
            result.spread > 100 && result.spread <= 300 && 'text-gold-bright',
            result.spread > 300 && 'text-dire-bright',
          )}
        >
          Δ {fmtInt(result.spread)} очк.
        </span>
      </div>
      <div className="space-y-2">
        {result.teams.map((team) => {
          const style = teamStyle(team.index)
          return (
            <div key={team.index} className="flex items-center gap-3">
              <span className={cn('w-20 shrink-0 text-xs font-medium', style.text)}>
                {style.name}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all duration-700', style.bar)}
                  style={{ width: `${Math.max(4, (team.avg / max) * 100)}%` }}
                />
              </div>
              <span className="w-16 text-right text-sm font-semibold tabular-nums">
                {fmtInt(Math.round(team.avg))}
              </span>
            </div>
          )
        })}
      </div>
      {result.exact && (
        <p className="text-xs text-muted-foreground">
          {variantIndex === 0
            ? 'Найдено точным перебором — лучше результат невозможен.'
            : `Точный перебор: показан вариант №${variantIndex + 1} — следующий по качеству.`}
        </p>
      )}
    </div>
  )
}
