"use client"

import Link from "next/link"
import { useState } from "react"

import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { usePageHeader } from "@/components/providers/page-header-context"
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

function BarChart({ items }: { items: RankedPeripheral[] }) {
  const sorted = [...items].sort((a, b) => b.score - a.score)

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
    <div className="flex flex-col gap-0.5">
      {sorted.map((item, index) => {
        const barPct = Math.round((item.score / maxScore) * 100)
        const displayValue = item.score
        const href = `/perifericos/${buildPeripheralSlug(item.name, item.id)}`

        return (
          <Link
            key={item.id}
            href={href}
            className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/30 sm:gap-3 sm:px-3"
          >
            {/* Position badge */}
            <span
              className={cn(
                "w-6 shrink-0 text-right text-xs font-bold tabular-nums sm:w-8",
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
                fixa (w-48) somada ao # e à pontuação estourava a largura da tela e
                espremia a barra a ~15px, tornando a comparação visual inútil. */}
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              {/* Name */}
              <span className="truncate text-sm font-medium text-foreground group-hover:text-primary sm:w-48 sm:shrink-0">
                {item.name}
              </span>

              {/* Bar */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted/20 sm:h-5">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-sm bg-gradient-to-r transition-all duration-300",
                      index === 0
                        ? "from-yellow-700 via-yellow-300 to-yellow-500"
                        : index === 1
                        ? "from-slate-500 via-slate-100 to-slate-400"
                        : index === 2
                        ? "from-amber-900 via-amber-400 to-amber-700"
                        : "from-primary/50 to-primary"
                    )}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground sm:w-12">
                  {displayValue}
                </span>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

export function RankingContent({ peripherals }: { peripherals: RankedPeripheral[] }) {
  usePageHeader("Ranking", "Pontuação (Performance e Estabilidade)")

  const categoriesWithData = CATEGORIES.filter((cat) =>
    peripherals.some((p) => p.category === cat.key)
  )

  const [selected, setSelected] = useState(
    categoriesWithData[0]?.key ?? "keyboard"
  )

  const filtered = peripherals.filter((p) => p.category === selected)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Category tabs */}
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {categoriesWithData.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setSelected(cat.key)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
              selected === cat.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <p className="mb-6 px-1 text-xs font-medium text-muted-foreground">
        Quanto maior, melhor
      </p>

      {/* Legend — acompanha as larguras responsivas das linhas. No mobile a barra
          fica na segunda linha de cada item, então o rótulo de pontuação sai. */}
      <div className="mb-3 flex items-center gap-2.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 sm:gap-3 sm:px-3">
        <span className="w-6 text-right sm:w-8">#</span>
        <span className="min-w-0 flex-1 sm:w-48 sm:flex-none">Nome</span>
        <span className="hidden flex-1 sm:block">Pontuação</span>
      </div>

      <BarChart items={filtered} />
    </div>
  )
}
