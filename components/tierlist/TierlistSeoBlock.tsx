import Link from "next/link"

import { JsonLd, BreadcrumbJsonLd, ItemListJsonLd, type ItemListEntry } from "@/components/seo/JsonLd"
import { SITE_URL, absoluteUrl } from "@/lib/site-url"
import { TIERLIST_CATEGORY_LABELS, tierlistCategoryPath } from "@/lib/tierlist-categories"
import type { Category } from "@/lib/tag-options"

/**
 * Rótulos de categoria para a UI do grid (Client Component). Igual ao mapa que
 * antes vivia inline em `app/tierlist/page.tsx`; centralizado aqui para as duas
 * rotas (`/tierlist` e `/tierlist/[categoria]`) usarem o mesmo.
 */
export const TIERLIST_CATEGORY_UI_LABELS: Record<string, string> = {
  all: "Geral",
  keyboard: "Teclados",
  pcb: "PCB",
  mouse: "Mouses",
  mousepad: "Mousepads",
  glasspad: "Glasspads",
  iem: "IEMs",
  headset: "Headsets",
  feet: "Feet",
  chairs: "Cadeiras",
  monitors: "Monitores",
  switches: "Switches",
  dac_amp: "DAC/AMP",
  psu: "Fontes",
}

const NAV_CATEGORIES: Category[] = [
  "keyboard",
  "mouse",
  "mousepad",
  "glasspad",
  "iem",
  "headset",
  "monitors",
  "switches",
  "pcb",
  "feet",
  "chairs",
  "dac_amp",
  "psu",
]

interface TierlistSeoBlockProps {
  category: Category
  heading: string
  intro: string
  /** `{ name, url }` dos periféricos da categoria, em ordem de tier. */
  itemListEntries: ItemListEntry[]
  canonicalPath: string
  updatedAt: string | null
}

/**
 * Bloco de SEO server-side da Tierlist.
 *
 * O `<h1>` visível vive no `TierlistPageHeader`; o grid e a `FilterBar` já
 * renderizam para HTML no servidor. Aqui fica só o que a UI não expõe:
 *
 * - JSON-LD: `BreadcrumbList`, `ItemList` (a coleção rankeada) e
 *   `CollectionPage` com `dateModified` (frescor);
 * - navegação por categoria em `<a href>` reais para `/tierlist/[categoria]`
 *   em `sr-only` (a `FilterBar` troca de categoria por estado do cliente, sem
 *   link rastreável) — clip, não `display:none`, então o Google segue com peso
 *   normal; na tela a `FilterBar` já é a navegação visível.
 */
export function TierlistSeoBlock({
  category,
  heading,
  intro,
  itemListEntries,
  canonicalPath,
  updatedAt,
}: TierlistSeoBlockProps) {
  const url = absoluteUrl(canonicalPath)
  const isBase = canonicalPath === "/tierlist"

  const breadcrumb = isBase
    ? [
        { name: "Início", item: "/" },
        { name: "Tierlist", item: "/tierlist" },
      ]
    : [
        { name: "Início", item: "/" },
        { name: "Tierlist", item: "/tierlist" },
        { name: TIERLIST_CATEGORY_LABELS[category], item: canonicalPath },
      ]

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumb} />
      <ItemListJsonLd items={itemListEntries} name={heading} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": url,
          url,
          name: heading,
          description: intro,
          inLanguage: "pt-BR",
          isPartOf: { "@id": `${SITE_URL}/#website` },
          ...(updatedAt ? { dateModified: updatedAt } : {}),
        }}
      />

      <nav aria-label="Tierlists por categoria" className="sr-only">
        <ul>
          {NAV_CATEGORIES.map((cat) => (
            <li key={cat}>
              <Link
                href={tierlistCategoryPath(cat)}
                aria-current={cat === category && !isBase ? "page" : undefined}
              >
                Tierlist de {TIERLIST_CATEGORY_LABELS[cat]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
