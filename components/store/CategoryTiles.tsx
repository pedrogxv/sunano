import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCategoryIcon, getCategoryLabel } from "@/lib/store-category-icons"

interface CategoryTilesProps {
  categories: string[]
  categoryCounts: Record<string, number>
}

export function CategoryTiles({ categories, categoryCounts }: CategoryTilesProps) {
  if (categories.length === 0) return null

  // As duas categorias com mais produtos ganham um tile maior — dá pra quem
  // tem mais estoque um destaque proporcional, sem depender de posições fixas
  // (o catálogo real muda de tamanho conforme o admin cadastra categorias).
  const sorted = [...categories].sort((a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0))

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3.5">
      {sorted.map((category, idx) => {
        const { icon: Icon, tint } = getCategoryIcon(category)
        const big = idx < 2 && sorted.length > 2
        return (
          <Link
            key={category}
            href={`/loja/categoria/${encodeURIComponent(category)}`}
            className={cn(
              "group relative flex h-[116px] flex-col justify-end gap-[3px] overflow-hidden rounded-2xl border border-[#262626] p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 lg:gap-1.5 lg:rounded-[18px] lg:p-[22px]",
              big ? "lg:col-span-3 lg:h-[240px]" : "lg:col-span-2 lg:h-[176px]"
            )}
            style={{ background: `radial-gradient(115% 115% at 100% 0%, color-mix(in oklab, ${tint} 20%, var(--card)), var(--card))` }}
          >
            <Icon
              className={cn(
                "pointer-events-none absolute -bottom-3 -right-2.5 size-[86px] opacity-[0.16] transition-transform duration-200 group-hover:scale-105 lg:-bottom-[18px] lg:-right-3.5",
                big ? "lg:size-[187px]" : "lg:size-[137px]"
              )}
              style={{ color: tint }}
              strokeWidth={0.9}
            />
            <span
              className={cn(
                "relative font-display text-base font-bold tracking-tight text-white",
                big ? "lg:text-[26px]" : "lg:text-lg"
              )}
            >
              {getCategoryLabel(category)}
            </span>
            <span className="relative flex items-center gap-1.5 text-[11px] font-semibold text-[#909090] lg:text-xs">
              {categoryCounts[category] ?? 0} produto{categoryCounts[category] === 1 ? "" : "s"}
              {/* A seta só existe no artboard desktop — no mobile o tile é
                  metade da altura e ela empurraria a contagem pra segunda linha. */}
              <ArrowRight className="hidden size-[13px] lg:inline" style={{ color: tint }} strokeWidth={2.2} />
            </span>
          </Link>
        )
      })}
    </div>
  )
}
