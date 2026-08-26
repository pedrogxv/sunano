import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ShoppingBag } from "lucide-react"
import { getStoreProductDetail, getStoreFilterOptions, listStoreProductsPaginated } from "@/lib/server/repositories/store-repository"
import { ProductDetailContent } from "@/components/store/ProductDetailContent"
import { ComingSoon } from "@/components/store/ComingSoon"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { isWebMaster } from "@/lib/admin-permissions"
import { isStoreMaintenanceEnabled, getStoreLaunchAt } from "@/lib/store-maintenance"
import { SITE_URL } from "@/lib/site-url"

export const revalidate = 120

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (isStoreMaintenanceEnabled()) return {}

  const { slug } = await params
  const detail = await getStoreProductDetail(slug)
  if (!detail) return {}

  const title = detail.product.name
  const description = detail.product.description ?? `${detail.product.name} — disponível na Loja Sunano.`
  const canonical = `/loja/${slug}`
  const image = detail.product.images[0]

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${SITE_URL}${canonical}`,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default async function ProductPage({ params }: PageProps) {
  if (isStoreMaintenanceEnabled()) {
    // WEB MASTER ignora o modo de manutenção da Loja e continua vendo tudo.
    const { profile } = await getAuthorizedProfile()
    if (!isWebMaster(profile)) {
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
  }

  const { slug } = await params
  const detail = await getStoreProductDetail(slug)
  if (!detail) notFound()

  const [filterOptions, { items: previewPool }] = await Promise.all([
    getStoreFilterOptions("store"),
    listStoreProductsPaginated({ type: "store", page: 1, pageSize: 24 }),
  ])

  return <ProductDetailContent {...detail} filterOptions={filterOptions} previewPool={previewPool} />
}
