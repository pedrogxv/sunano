import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import type { ForumCategoryInfo } from "@/lib/server/repositories/forum-repository"

/**
 * Badge de categoria/subcategoria do post — "Teclado / Magnético" ou só "Mouse" se raiz.
 * Só vira link para `/forum/categoria/[slug]` quando `linked` (post individual/página de
 * categoria) — na listagem o card inteiro já é um `<Link>`, e aninhar outro quebraria o HTML.
 */
export function CategoryBadge({ category, linked = false }: { category: ForumCategoryInfo | null; linked?: boolean }) {
  if (!category) return null

  const label = category.parent ? `${category.parent.name} / ${category.name}` : category.name
  const badge = (
    <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
      {label}
    </Badge>
  )

  if (!linked) return badge

  return (
    <Link href={`/forum/categoria/${category.slug}`} onClick={(e) => e.stopPropagation()}>
      {badge}
    </Link>
  )
}
