import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { StoreProductPageBody } from "@/components/store/StoreProductPageBody"
import { isStoreBrowsingBlocked } from "@/lib/server/auth/store-maintenance-gate"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"

/**
 * Cópia DINÂMICA de `/loja/[slug]` para quem atravessa a manutenção da Loja
 * (WEB MASTER ou `store_access`). A rota pública é ISR, e página em cache não
 * lê cookie, então ali a manutenção vale para todo mundo (ver
 * `isStoreBrowsingBlockedForCachedRoute`). O proxy reescreve a URL pública
 * para esta, sem mudar o que aparece na barra de endereço.
 *
 * Acessada direto por quem não tem o bypass (ou com a Loja aberta), responde
 * 404: não é uma segunda URL do catálogo. Mesmo desenho da cópia da
 * categoria (`acesso-equipe/categoria/[categoria]`).
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Loja",
  robots: { index: false, follow: false },
}

export default async function LojaProdutoAcessoEquipePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  if (!isStoreMaintenanceEnabled() || (await isStoreBrowsingBlocked())) notFound()

  const { slug } = await params
  return <StoreProductPageBody slug={slug} />
}
