/**
 * Editorial-шапка раздела: техническая метка, огромный заголовок,
 * асимметричная мета-информация справа. Существование на чёрном холсте.
 */
export function PageHead({
  index,
  kicker,
  title,
  meta,
}: {
  /** Технический индекс раздела: 001, 002 … */
  index: string
  /** Надзаголовок-метка, например "roster" */
  kicker: string
  /** Крупный заголовок раздела */
  title: string
  /** Справа: мелкие технические строки (строки таблицы данных) */
  meta?: Array<{ label: string; value: string }>
}) {
  return (
    <div className="relative border-b border-border pb-8 md:pb-10">
      <div className="flex items-center gap-2">
        <span className="inline-block size-1.5 bg-primary shadow-[0_0_14px_rgba(49,85,255,0.8)]" aria-hidden />
        <span className="tlabel">
          {kicker} / {index}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
        <h1 className="text-[clamp(2.75rem,8vw,5.5rem)] font-medium leading-[0.95] tracking-[-0.04em]">
          {title}
        </h1>
        {meta && meta.length > 0 && (
          <dl className="mb-1 grid grid-cols-[auto_auto] gap-x-6 gap-y-1.5 font-mono text-[10px] uppercase tracking-[0.14em]">
            {meta.map((row) => (
              <div key={row.label} className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="text-right text-foreground tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}
