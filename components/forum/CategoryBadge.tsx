import { Badge } from "@/components/ui/badge"
import type { ForumCategoryInfo } from "@/lib/server/repositories/forum-repository"

/** Badge de categoria/subcategoria do post — "Teclado / Magnético" ou só "Mouse" se raiz. */
export function CategoryBadge({ category }: { category: ForumCategoryInfo | null }) {
  if (!category) return null

  return (
    <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
      {category.parent ? `${category.parent.name} / ${category.name}` : category.name}
    </Badge>
  )
}
