import { cn } from "@/lib/utils"

export type Estatistica = {
  icone: React.ElementType
  rotulo: string
  valor: number
  /** Cor do ícone e do número. */
  tom: string
  /** Fundo do círculo atrás do ícone — mesma cor, bem diluída. */
  fundo: string
  /** Ícone chapado (aura é uma chama cheia, não um contorno). */
  preenchido?: boolean
}

export function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(value)
}

/**
 * Ícone + número + rótulo — a unidade repetida dentro de cada caixa de
 * `EstatisticasGrid` e dentro dos gatilhos de modal em `ProfileStatsDialogs`.
 * Isolado num arquivo próprio (sem "use client") para os dois poderem
 * importá-lo sem criar um ciclo entre um Server e um Client Component.
 */
export function Contador({ item, destaque = false }: { item: Estatistica; destaque?: boolean }) {
  const Icone = item.icone
  return (
    <div className="flex items-center gap-3 sm:gap-3.5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full sm:size-10",
          item.fundo,
          destaque && "aura-stat-icon-holder"
        )}
      >
        <Icone
          className={cn("size-[18px] sm:size-5", item.tom, destaque && "aura-stat-icon")}
          {...(item.preenchido ? { fill: "currentColor", strokeWidth: 1.5 } : {})}
        />
      </span>
      <div className="flex flex-col leading-none">
        <span className="text-lg font-bold text-foreground sm:text-xl">
          {formatCount(item.valor)}
        </span>
        <span className="mt-1 text-xs leading-none text-muted-foreground">{item.rotulo}</span>
      </div>
    </div>
  )
}
