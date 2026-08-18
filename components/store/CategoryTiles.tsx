"use client"

import { cn } from "@/lib/utils"
import { getCategoryIcon } from "@/lib/store-category-icons"

interface CategoryTilesProps {
  categories: string[]
  categoryCounts: Record<string, number>
  activeCategory: string | null
  onSelect: (category: string | null) => void
}

export function CategoryTiles({ categories, categoryCounts, activeCategory, onSelect }: CategoryTilesProps) {
  if (categories.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {categories.map((category) => {
        const { icon: Icon, tint } = getCategoryIcon(category)
        const active = activeCategory === category
        return (
          <button
            key={category}
            type="button"
            onClick={() => onSelect(active ? null : category)}
            className={cn(
              "group relative flex h-[150px] flex-col justify-end gap-1.5 overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200",
              active ? "border-foreground/50" : "border-border hover:-translate-y-0.5 hover:border-foreground/25"
            )}
            style={{ background: `radial-gradient(120% 120% at 100% 100%, color-mix(in oklab, ${tint} 18%, var(--card)), var(--card))` }}
          >
            <Icon
              className="absolute right-3.5 top-3.5 size-6 transition-transform duration-200 group-hover:scale-110"
              style={{ color: tint }}
              strokeWidth={1.5}
            />
            <Icon
              className="pointer-events-none absolute -bottom-3.5 -right-2.5 size-24 opacity-[0.14]"
              style={{ color: tint }}
              strokeWidth={1}
            />
            <span className="relative font-display text-[15px] font-bold capitalize text-foreground">{category}</span>
            <span className="relative text-[11px] font-semibold text-muted-foreground">
              {categoryCounts[category] ?? 0} produto{categoryCounts[category] === 1 ? "" : "s"}
            </span>
          </button>
        )
      })}
    </div>
  )
}
