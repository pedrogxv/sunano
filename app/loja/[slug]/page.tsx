import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ShoppingBag } from "lucide-react"
import { getStoreProductDetail } from "@/lib/server/repositories/store-repository"
import { ProductDetailContent } from "@/components/store/ProductDetailContent"
import { ComingSoon } from "@/components/store/ComingSoon"

export const revalidate = 120

interface PageProps {
  params: Promise<{ slug: string }>
}

function isStoreMaintenanceEnabled() {
  const value = process.env.STORE_MAINTENANCE_MODE ?? process.env.NEXT_PUBLIC_STORE_MAINTENANCE_MODE
  return value === "true"
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (isStoreMaintenanceEnabled()) return {}

  const { slug } = await params
  const detail = await getStoreProductDetail(slug, "store")
  if (!detail) return {}

  return {
    title: detail.product.name,
    description: detail.product.description ?? `${detail.product.name} — disponível na Loja Sunano.`,
    alternates: { canonical: `/loja/${slug}` },
  }
}

export default async function ProductPage({ params }: PageProps) {
  if (isStoreMaintenanceEnabled()) {
    return (
      <ComingSoon
        icon={ShoppingBag}
        title="Mercado"
        description="O Mercado, com produtos selecionados pelo Sunano, está sendo preparado. Fique de olho nas redes para o lançamento."
        accent="emerald"
      />
    )
  }

  const { slug } = await params
  const detail = await getStoreProductDetail(slug, "store")
  if (!detail) notFound()

  return <ProductDetailContent {...detail} />
}
