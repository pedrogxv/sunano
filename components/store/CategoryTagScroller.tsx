import Link from "next/link"
import { cn } from "@/lib/utils"
import { getCategoryIcon } from "@/lib/store-category-icons"

interface CategoryTagScrollerProps {
  categories: string[]
  activeCategory: string
}

/** Fileira de tags de categoria com scroll lateral — usada na landing de
 *  categoria no lugar do grid de cards grandes do <CategoryTiles>. */
export function CategoryTagScroller({ categories, activeCategory }: CategoryTagScrollerProps) {
  if (categories.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {categories.map((category) => {
        const isActive = category === activeCategory
        const { icon: Icon, tint } = getCategoryIcon(category)
        return (
          <Link
            key={category}
            href={`/loja/categoria/${encodeURIComponent(category)}`}
            style={
              isActive
                ? { borderColor: tint, background: `color-mix(in oklab, ${tint} 16%, #141414)` }
                : undefined
            }
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-[7px] whitespace-nowrap rounded-full border px-3.5 text-[12.5px] capitalize transition-colors",
              isActive
                ? "font-bold text-white"
                : "border-[#2a2a2a] bg-[#141414] font-semibold text-[#cfcfcf] hover:border-foreground/25"
            )}
          >
            <Icon className="size-[13px]" style={{ color: tint }} strokeWidth={2} />
            {category}
          </Link>
        )
      })}
    </div>
  )
}
