import { notFound } from "next/navigation"
import { getStoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { isStoreBrowsingBlocked } from "@/lib/server/auth/store-maintenance-gate"

/** Ver `app/loja/categoria/[categoria]/layout.tsx`: o 404 tem de sair antes do `loading.tsx`. */
export default async function LojaMarcaLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ marca: string }>
}) {
  if (!(await isStoreBrowsingBlocked())) {
    const { marca } = await params
    const filterOptions = await getStoreFilterOptions("store")
    if (!filterOptions.brands.includes(decodeURIComponent(marca))) notFound()
  }
  return children
}
