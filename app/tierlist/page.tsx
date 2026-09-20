import { Suspense } from "react"

import { buildMetadata } from "@/lib/seo"
import { getTierlistPageData, orderedForCategory, itemListEntries } from "@/lib/server/tierlist-page-data"
import { TierlistPageHeader } from "@/components/tierlist/TierlistPageHeader"
import { TierlistContent } from "@/components/tierlist/TierlistContent"
import { TierlistSeoBlock } from "@/components/tierlist/TierlistSeoBlock"

// ISR: serve do cache e revalida em background a cada 120s, em vez de
// re-renderizar (com nova query ao banco) em toda requisição.
export const revalidate = 120

// O sinal de "última atualização" (dateModified) vai no JSON-LD CollectionPage
// dentro de `TierlistSeoBlock` — `modifiedTime` no OpenGraph exigiria
// `type: "article"`, que não é o caso de uma página de coleção.
export const metadata = buildMetadata({
  title: "Tierlist",
  socialTitle: "Tierlist de periféricos, do S ao F",
  description:
    "A tierlist definitiva de periféricos gamers, com filtros avançados por categoria, preço e modo de avaliação.",
  path: "/tierlist",
  eyebrow: "Tierlist",
  subtitle: "Do S ao F, com nota de verdade",
})

// A aba "Minha Tierlist" vive em `/tierlist/pessoal`, rota separada: ler
// `searchParams` aqui tornaria esta página dinâmica e mataria o ISR acima —
// o catálogo inteiro voltaria a rodar em toda visita à tierlist oficial.
export default async function TierlistPage() {
  const { items, tierlistMeta } = await getTierlistPageData()

  // A rota base abre em Teclados — a mesma categoria padrão do grid cliente.
  const defaultCategory = "keyboard" as const
  const orderedDefault = orderedForCategory(items, defaultCategory)

  return (
    <div className="mx-auto max-w-6xl px-2 py-5 sm:px-3 md:px-6 md:py-6 lg:px-8 space-y-4 md:space-y-5">
      <TierlistPageHeader
        active="oficial"
        latestUpdate={tierlistMeta}
        heading="Tierlist de Periféricos Gamers"
        sharePath="/tierlist"
      />

      <TierlistSeoBlock
        category={defaultCategory}
        heading="Tierlist de Periféricos Gamers"
        intro="Ranking de periféricos avaliados pela Sunano — do S ao F, com nota de verdade. Escolha uma categoria abaixo para ver a tier list completa."
        itemListEntries={itemListEntries(orderedDefault)}
        canonicalPath="/tierlist"
        updatedAt={tierlistMeta?.updatedAt ?? null}
      />

      <Suspense fallback={null}>
        <TierlistContent
          initialData={items as never}
        />
      </Suspense>
    </div>
  )
}
