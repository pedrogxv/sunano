import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ShoppingBag } from "lucide-react"
import { getStoreProductDetail, getStoreFilterOptions, listStoreProductsPaginated } from "@/lib/server/repositories/store-repository"
import { ProductDetailContent } from "@/components/store/ProductDetailContent"
import { ComingSoon } from "@/components/store/ComingSoon"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { isWebMaster } from "@/lib/admin-permissions"
import { isStoreMaintenanceEnabled, getStoreLaunchAt } from "@/lib/store-maintenance"
import { buildDescription, buildMetadata } from "@/lib/seo"
import { SITE_URL } from "@/lib/site-url"

export const revalidate = 120

interface PageProps {
  params: Promise<{ slug: string }>
}

const CONDITION_LABEL: Record<string, string> = {
  new: "Novo",
  used: "Usado",
  opened: "Aberto",
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (isStoreMaintenanceEnabled()) return {}

  const { slug } = await params
  const detail = await getStoreProductDetail(slug)
  if (!detail) return {}

  const { product } = detail
  const priceCents = product.promo_price_cents ?? product.price_cents
  const price = (priceCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
  const condition = CONDITION_LABEL[product.condition] ?? ""

  return buildMetadata({
    title: product.name,
    titleSuffix: " | Loja Sunano",
    // Sem descrição própria a página caía numa frase de 40 chars ("X —
    // disponível na Loja Sunano"), abaixo do mínimo útil de card. O
    // complemento carrega preço e condição, que é o que decide o clique.
    description: buildDescription(product.description, product.name, {
      context: `${condition} por ${price} na Loja Sunano.`,
      extraContext: "Testado antes de anunciar, com PIX na hora e envio para todo o Brasil.",
    }),
    path: `/loja/${slug}`,
    eyebrow: "Loja",
    subtitle: `${condition} · ${price}`,
    // `product` desenha a foto com `contain`: recortar foto de produto corta o
    // próprio produto. Antes ela ia crua em 800×800 (1:1) e saía distorcida.
    image: product.images[0],
    imageVariant: "product",
  })
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

  const { product } = detail
  const url = `${SITE_URL}/loja/${slug}`
  const priceCents = product.promo_price_cents ?? product.price_cents

  /**
   * JSON-LD Product: é o que habilita o resultado rico da busca (preço,
   * disponibilidade e condição direto na SERP). Sem ele o produto concorre
   * como link de texto puro contra marketplaces que enviam esse schema.
   */
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url,
    name: product.name,
    description: buildDescription(product.description, product.name, {
      context: `Disponível na Loja Sunano.`,
    }),
    // Absolutas: o Google descarta imagem relativa no schema.
    image: product.images.map((image) => new URL(image, SITE_URL).toString()),
    sku: product.id,
    ...(product.category ? { category: product.category } : {}),
    itemCondition:
      product.condition === "new"
        ? "https://schema.org/NewCondition"
        : "https://schema.org/UsedCondition",
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "BRL",
      price: (priceCents / 100).toFixed(2),
      availability: product.is_sold_out
        ? "https://schema.org/OutOfStock"
        : product.sale_type === "pre_order"
          ? "https://schema.org/PreOrder"
          : "https://schema.org/InStock",
      itemCondition:
        product.condition === "new"
          ? "https://schema.org/NewCondition"
          : "https://schema.org/UsedCondition",
      seller: { "@id": `${SITE_URL}/#organization` },
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <ProductDetailContent {...detail} filterOptions={filterOptions} previewPool={previewPool} />
    </>
  )
}
