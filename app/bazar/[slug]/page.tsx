import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getStoreProductDetail } from "@/lib/server/repositories/store-repository"
import { ProductDetailContent } from "@/components/store/ProductDetailContent"

export const revalidate = 120

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const detail = await getStoreProductDetail(slug, "bazaar")
  if (!detail) return {}

  return {
    title: detail.product.name,
    description: detail.product.description ?? `${detail.product.name} — disponível no Bazar Sunano.`,
    alternates: { canonical: `/bazar/${slug}` },
  }
}

export default async function BazarProductPage({ params }: PageProps) {
  const { slug } = await params
  const detail = await getStoreProductDetail(slug, "bazaar")
  if (!detail) notFound()

  return <ProductDetailContent {...detail} />
}
