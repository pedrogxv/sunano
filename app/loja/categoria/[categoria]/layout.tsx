import { notFound } from "next/navigation"
import { getStoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { isStoreBrowsingBlocked } from "@/lib/server/auth/store-maintenance-gate"
import { hasCategoryPage } from "@/lib/store-catalog"

/**
 * Valida a categoria ANTES do `loading.tsx`: o layout fica fora do boundary
 * dele, então o `notFound()` aqui ainda vira 404 de verdade. Na página, depois
 * do esqueleto começar a transmitir, sairia 200.
 */
export default async function LojaCategoriaLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ categoria: string }>
}) {
  // Em manutenção a página mostra o "Coming soon" para qualquer slug.
  if (!(await isStoreBrowsingBlocked())) {
    const { categoria } = await params
    const filterOptions = await getStoreFilterOptions("store")
    // Mesma regra da página: `audio` é página de grupo, não categoria do banco.
    if (!hasCategoryPage(decodeURIComponent(categoria), filterOptions.categories)) notFound()
  }
  return children
}
