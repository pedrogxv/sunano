import type { Metadata } from "next"
import { Suspense } from "react"
import { ShoppingBag } from "lucide-react"

import { ComingSoon } from "@/components/store/ComingSoon"
import { StoreFavoritesContent } from "@/components/store/StoreFavoritesContent"
import {
  isStoreBrowsingBlocked,
  storeMaintenanceMetadata,
} from "@/lib/server/auth/store-maintenance-gate"
import { getStoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { buildMetadata } from "@/lib/seo"
import { getStoreLaunchAt } from "@/lib/store-maintenance"

export const revalidate = 60

// Lista pessoal: fora do índice. A página em si é igual para todo mundo (o
// menu da Loja); os favoritos chegam no cliente, da sessão de quem abriu.
export function generateMetadata(): Metadata {
  return (
    storeMaintenanceMetadata({ title: "Loja", path: "/loja/favoritos" }) ??
    buildMetadata({
      title: "Favoritos - Loja",
      description: "Os produtos da Loja Sunano que você salvou para ver depois.",
      path: "/loja/favoritos",
      eyebrow: "Loja",
      subtitle: "Favoritos",
      noIndex: true,
    })
  )
}

export default async function LojaFavoritosPage() {
  // Ver `/loja/categoria`: sem esta guarda a rota mostraria a Loja durante a manutenção.
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

  const filterOptions = await getStoreFilterOptions("store")

  return (
    <Suspense>
      <StoreFavoritesContent filterOptions={filterOptions} />
    </Suspense>
  )
}
