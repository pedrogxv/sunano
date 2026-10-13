import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { StoreCategoryPageBody } from "@/components/store/StoreCategoryPageBody"
import { isStoreBrowsingBlocked } from "@/lib/server/auth/store-maintenance-gate"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"

/**
 * Cópia DINÂMICA de `/loja/categoria/[categoria]` para quem atravessa a
 * manutenção da Loja (WEB MASTER ou `store_access`). A rota pública é ISR, e
 * página em cache não lê cookie, então ali a manutenção vale para todo mundo
 * (ver `isStoreBrowsingBlockedForCachedRoute`). O proxy reescreve a URL
 * pública para esta, sem mudar o que aparece na barra de endereço.
 *
 * Acessada direto por quem não tem o bypass (ou com a Loja aberta), responde
 * 404: não é uma segunda URL do catálogo.
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Loja",
  robots: { index: false, follow: false },
}

export default async function LojaCategoriaAcessoEquipePage({
  params,
}: {
  params: Promise<{ categoria: string }>
}) {
  if (!isStoreMaintenanceEnabled() || (await isStoreBrowsingBlocked())) notFound()

  const { categoria } = await params
  return <StoreCategoryPageBody category={decodeURIComponent(categoria)} />
}
