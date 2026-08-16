import type { Metadata } from "next"
import { ShoppingBag } from "lucide-react"
import { listStoreProductsPaginated, getStoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { StoreContent } from "@/components/store/StoreContent"
import { ComingSoon } from "@/components/store/ComingSoon"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { isWebMaster } from "@/lib/admin-permissions"

export const revalidate = 60

export const metadata: Metadata = {
  title: "Mercado",
  description: "Mercado Sunano: periféricos novos e usados, com filtros de marca, categoria, estado e preço.",
  alternates: { canonical: "/loja" },
}

interface LojaPageProps {
  searchParams: Promise<{ type?: string }>
}

const PAGE_SIZE = 24

function isStoreMaintenanceEnabled() {
  const value = process.env.STORE_MAINTENANCE_MODE ?? process.env.NEXT_PUBLIC_STORE_MAINTENANCE_MODE
  return value === "true"
}

export default async function LojaPage({ searchParams }: LojaPageProps) {
  if (isStoreMaintenanceEnabled()) {
    // WEB MASTER ignora o modo de manutenção da Loja e continua vendo tudo.
    const { profile } = await getAuthorizedProfile()
    if (!isWebMaster(profile)) {
      return (
        <ComingSoon
          icon={ShoppingBag}
          title="Mercado"
          description="O Mercado, com produtos selecionados pelo Sunano, está sendo preparado. Fique de olho nas redes para o lançamento."
          accent="emerald"
        />
      )
    }
  }

  const { type: typeParam } = await searchParams
  const initialType = typeParam === "bazaar" || typeParam === "store" ? typeParam : "all"

  const [{ items, total }, filterOptions] = await Promise.all([
    listStoreProductsPaginated({
      type: initialType === "all" ? undefined : initialType,
      page: 1,
      pageSize: PAGE_SIZE,
    }),
    getStoreFilterOptions(),
  ])

  if (total === 0 && filterOptions.countByType.all === 0) {
    return (
      <ComingSoon
        icon={ShoppingBag}
        title="Mercado"
        description="O Mercado, com produtos selecionados pelo Sunano, está sendo preparado. Fique de olho nas redes para o lançamento."
        accent="emerald"
      />
    )
  }

  return (
    <StoreContent
      initialItems={items}
      initialTotal={total}
      initialType={initialType}
      initialFilterOptions={filterOptions}
      pageSize={PAGE_SIZE}
    />
  )
}
