import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"
import { Suspense } from "react"
import { getStoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { getStoreWideReviewAggregate, listStoreWideReviews } from "@/lib/server/repositories/store-reviews-repository"
import { StoreReviewsContent } from "@/components/store/StoreReviewsContent"
import { ShoppingBag } from "lucide-react"
import { ComingSoon } from "@/components/store/ComingSoon"
import {
  isStoreBrowsingBlocked,
  storeMaintenanceMetadata,
} from "@/lib/server/auth/store-maintenance-gate"
import { getStoreLaunchAt } from "@/lib/store-maintenance"

export const revalidate = 60

// `generateMetadata` (e não o `metadata` estático de antes) porque a decisão
// depende da env de manutenção — ver storeMaintenanceMetadata.
export function generateMetadata(): Metadata {
  return (
    storeMaintenanceMetadata({ title: "Loja", path: "/loja/avaliacoes" }) ??
    buildMetadata({
      title: "Avaliações - Loja",
      description: "Veja as avaliações de quem já comprou na Loja Sunano: notas e comentários reais de compradores verificados.",
      path: "/loja/avaliacoes",
      eyebrow: "Loja",
      subtitle: "Avaliações de compradores",
    })
  )
}

export default async function LojaAvaliacoesPage() {
  // Ver `/loja/categoria`: sem esta guarda a rota listava produtos e
  // avaliações da Loja durante a manutenção.
  if (await isStoreBrowsingBlocked()) {
    return (
      <ComingSoon
        icon={ShoppingBag}
        title="Loja"
        description="A Loja, com produtos selecionados pelo Sunano, está sendo preparada. Fique de olho nas redes para o lançamento."
        accent="emerald"
        launchAt={getStoreLaunchAt()}
      />
    )
  }

  const [filterOptions, aggregate, reviews] = await Promise.all([
    getStoreFilterOptions("store"),
    getStoreWideReviewAggregate(),
    listStoreWideReviews(60),
  ])

  return (
    <Suspense>
      <StoreReviewsContent filterOptions={filterOptions} aggregate={aggregate} reviews={reviews} />
    </Suspense>
  )
}
