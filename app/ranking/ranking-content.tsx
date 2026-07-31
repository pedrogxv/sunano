"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"

import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { usePageHeader } from "@/components/providers/page-header-context"
import { AnimatedCounter } from "@/components/animated-counter"
import { RankingInfo } from "@/components/ranking/RankingInfo"
import { cn } from "@/lib/utils"

export type RankedPeripheral = {
  id: string
  name: string
  category: string
  score: number
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: "keyboard", label: "Teclados" },
  { key: "mouse", label: "Mouse" },
  { key: "mousepad", label: "Mousepad" },
  { key: "glasspad", label: "Glasspad" },
  { key: "switches", label: "Switches" },
  { key: "iem", label: "IEM" },
  { key: "headset", label: "Headset" },
  { key: "monitors", label: "Monitor" },
]

function BarChart({ items, isAdmin }: { items: RankedPeripheral[]; isAdmin: boolean }) {
  const sorted = [...items].sort((a, b) => b.score - a.score)

  // Começa em 0% e só assume a largura final depois do mount, pra barra
  // crescer junto com o número — mesmo efeito e velocidade do contador da home.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const total = sorted.length
  // Evita divisão por zero (todos os scores zerados) — daria `width: NaN%`.
  const maxScore = Math.max(...sorted.map((p) => p.score), 1)

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-sm">Nenhum item com ranking nesta categoria.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {sorted.map((item, index) => {
        const barPct = Math.round((item.score / maxScore) * 100)
        const displayValue = item.score
        // Em modo admin, o clique leva para a edição do periférico, não para a
        // página pública — senão a navegação "vaza" para o site público.
        const href = isAdmin
          ? `/admin/perifericos/${item.id}`
          : `/perifericos/${buildPeripheralSlug(item.name, item.id)}`

        return (
          <Link
            key={item.id}
            href={href}
            className="group flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 transition-all duration-150 hover:border-border/50 hover:bg-muted/40 hover:shadow-sm active:scale-[0.995] sm:gap-4 sm:px-4"
          >
            {/* Position badge */}
            <span
              className={cn(
                "w-6 shrink-0 text-right text-xs font-bold tabular-nums sm:w-8 sm:text-sm",
                index === 0
                  ? "text-yellow-400"
                  : index === 1
                  ? "text-zinc-300"
                  : index === 2
                  ? "text-amber-600"
                  : "text-muted-foreground/60"
              )}
            >
              #{index + 1}
            </span>

            {/* Nome + barra. No mobile ficam empilhados: lado a lado, a coluna de nome
                fixa (w-56) somada ao # e à pontuação estourava a largura da tela e
                espremia a barra a ~15px, tornando a comparação visual inútil. */}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
              {/* Name */}
              <span className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary sm:w-56 sm:shrink-0">
                {item.name}
              </span>

              {/* Bar */}
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted/20 sm:h-5">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-sm bg-gradient-to-r transition-[width] duration-[2600ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
                      index === 0
                        ? "from-yellow-700 via-yellow-300 to-yellow-500"
                        : index === 1
                        ? "from-slate-500 via-slate-100 to-slate-400"
                        : index === 2
                        ? "from-amber-900 via-amber-400 to-amber-700"
                        : "from-primary/50 to-primary"
                    )}
                    style={{ width: ready ? `${barPct}%` : "0%" }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground sm:w-12 sm:text-sm">
                  <AnimatedCounter value={displayValue} />
                </span>
              </div>
            </div>

            {/* Nudge de navegação — só some no mobile pra não brigar com o layout empilhado */}
            <ChevronRight className="hidden size-4 shrink-0 -translate-x-1 text-muted-foreground/60 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 sm:block" />
          </Link>
        )
      })}
    </div>
  )
}

export function RankingContent({ peripherals }: { peripherals: RankedPeripheral[] }) {
  usePageHeader("Ranking", "Pontuação (Performance e Estabilidade)")
  const isAdmin = usePathname()?.startsWith("/admin") ?? false

  const categoriesWithData = CATEGORIES.filter((cat) =>
    peripherals.some((p) => p.category === cat.key)
  )

  const [selected, setSelected] = useState(
    categoriesWithData[0]?.key ?? "keyboard"
  )

  const filtered = peripherals.filter((p) => p.category === selected)

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      {/* Category tabs */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {categoriesWithData.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setSelected(cat.key)}
            className={cn(
              "rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              selected === cat.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Card que contém legenda + lista — dá ao ranking um limite visual próprio
          em telas largas, em vez de flutuar solto num container só um pouco
          mais estreito que a página inteira. */}
      <div className="rounded-2xl border border-border/40 bg-card/40 p-2 sm:p-3">
        {/* Legend — acompanha as larguras responsivas das linhas. No mobile a barra
            fica na segunda linha de cada item, então o rótulo de pontuação sai. */}
        <div className="flex items-center gap-3 px-2.5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 sm:gap-4 sm:px-4">
          <span className="w-6 text-right sm:w-8">#</span>
          <span className="min-w-0 flex-1 sm:w-56 sm:flex-none">Nome</span>
          <span className="hidden flex-1 sm:block">Pontuação</span>
        </div>

        <BarChart key={selected} items={filtered} isAdmin={isAdmin} />
      </div>

      <div className="mt-4">
        <RankingInfo />
      </div>
    </div>
  )
}
