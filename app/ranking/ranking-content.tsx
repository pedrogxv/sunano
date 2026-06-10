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
  ranking: number
  score: number | null
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
  const hasScores = items.some((p) => p.score != null)

  // Sort: by score desc if available, else by ranking position asc
  const sorted = [...items].sort((a, b) =>
    hasScores
      ? (b.score ?? 0) - (a.score ?? 0)
      : a.ranking - b.ranking
  )

  const maxScore = hasScores ? Math.max(...sorted.map((p) => p.score ?? 0)) : 0
  const total = sorted.length

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
        const barPct = hasScores
          ? Math.round(((item.score ?? 0) / maxScore) * 100)
          : Math.round(100 - (index / Math.max(total - 1, 1)) * 70)

        const displayValue = hasScores ? (item.score ?? "") : `#${item.ranking}`
        const href = `/perifericos/${buildPeripheralSlug(item.name, item.id)}`

        return (
          <Link
            key={item.id}
            href={href}
            className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/30"
          >
            {/* Position badge */}
            <span
              className={cn(
                "w-8 shrink-0 text-right text-xs font-bold tabular-nums",
                index === 0
                  ? "text-yellow-400"
                  : index === 1
                  ? "text-zinc-300"
                  : index === 2
                  ? "text-amber-600"
                  : "text-muted-foreground/60"
              )}
            >
              #{item.ranking}
            </span>

            {/* Name */}
            <span className="w-48 shrink-0 truncate text-sm font-medium text-foreground group-hover:text-primary">
              {item.name}
            </span>

            {/* Bar */}
            <div className="flex flex-1 items-center gap-2">
              <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-muted/20">
                <div
                  className="absolute inset-y-0 left-0 rounded-sm bg-gradient-to-r from-primary/50 to-primary transition-all duration-300"
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                {displayValue}
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

export function RankingContent({ peripherals }: { peripherals: RankedPeripheral[] }) {
  usePageHeader("Ranking", "Classificação dos periféricos por pontuação")

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
      <div className="mb-6 flex flex-wrap gap-1.5">
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

      {/* Legend */}
      <div className="mb-3 flex items-center gap-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
        <span className="w-8 text-right">#</span>
        <span className="w-48">Nome</span>
        <span className="flex-1">Pontuação</span>
      </div>

      <BarChart items={filtered} />
    </div>
  )
}
