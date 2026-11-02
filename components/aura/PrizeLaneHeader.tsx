import { cn } from "@/lib/utils"

/**
 * Cabeçalho de uma "faixa" do painel de Prêmios da Central de Aura (Sorteios,
 * Resgate com Aura). Ícone num quadrado de cor, título, etiqueta e um fio que
 * se apaga até o que a faixa mostra à direita — no lugar do título solto com
 * parágrafo embaixo, que ocupava duas linhas para dizer pouco.
 */
export function PrizeLaneHeader({
  icon,
  iconClassName,
  title,
  tag,
  tagClassName,
  right,
}: {
  icon: React.ReactNode
  /** Fundo e cor do quadrado do ícone. */
  iconClassName: string
  title: string
  tag?: React.ReactNode
  tagClassName?: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", iconClassName)}>{icon}</span>
      <h3 className="font-display text-base font-bold tracking-tight text-foreground">{title}</h3>
      {tag && (
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            tagClassName
          )}
        >
          {tag}
        </span>
      )}
      <span aria-hidden className="hidden h-px min-w-8 flex-1 bg-gradient-to-r from-border to-transparent sm:block" />
      {right && <div className="flex items-center gap-2 max-sm:w-full">{right}</div>}
    </div>
  )
}

/**
 * Progresso em gomos ("2 de 3 missões"): um gomo aceso por item feito, no
 * lado direito de uma faixa. Diz o mesmo que "2/3 concluídas" sem ser mais
 * uma linha de texto cinza.
 */
export function LaneProgress({ done, total, label }: { done: number; total: number; label: string }) {
  const complete = total > 0 && done >= total
  return (
    <div className="flex items-center gap-2" title={`${done} de ${total} ${label}`}>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 w-5 rounded-full transition-colors",
              index < done
                ? complete
                  ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60"
                  : "bg-amber-400"
                : "bg-muted"
            )}
          />
        ))}
      </div>
      <span className={cn("text-[11px] font-bold tabular-nums", complete ? "text-emerald-300" : "text-muted-foreground")}>
        {done}/{total}
      </span>
    </div>
  )
}
