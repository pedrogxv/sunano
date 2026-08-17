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

const PAGE_SIZE = 24

function isStoreMaintenanceEnabled() {
  const value = process.env.STORE_MAINTENANCE_MODE ?? process.env.NEXT_PUBLIC_STORE_MAINTENANCE_MODE
  return value === "true"
}

export default async function LojaPage() {
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

  const [{ items, total }, filterOptions] = await Promise.all([
    listStoreProductsPaginated({
      type: "store",
      page: 1,
      pageSize: PAGE_SIZE,
    }),
    getStoreFilterOptions(),
  ])

  if (total === 0 && filterOptions.countByType.store === 0) {
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
      initialFilterOptions={filterOptions}
      pageSize={PAGE_SIZE}
    />
  )
}
