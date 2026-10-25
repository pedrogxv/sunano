import { notFound } from "next/navigation"
import { getStoreProductDetail, getStoreFilterOptions, listProductRecommendations } from "@/lib/server/repositories/store-repository"
import { getReviewAggregate } from "@/lib/server/repositories/store-reviews-repository"
import { JsonLd } from "@/components/seo/JsonLd"
import { ProductDetailContent } from "@/components/store/ProductDetailContent"
import { hasFreeShipping } from "@/lib/store-shipping"
import { isSinglePriceProduct } from "@/lib/store-pricing"
import { productGalleryImages } from "@/lib/store-product-images"
import { effectivePreorderStatus } from "@/lib/store-preorder"
import { buildDescription } from "@/lib/seo"
import { getCategoryLabel } from "@/lib/store-category-icons"
import { SITE_URL } from "@/lib/site-url"

/**
 * Conteúdo da página de produto da Loja. Compartilhado entre a rota pública
 * (`/loja/[slug]`, ISR) e a cópia dinâmica que o proxy serve a quem atravessa
 * a manutenção (`/loja/acesso-equipe/produto/[slug]`): uma tela só, para as
 * duas nunca divergirem. Mesmo desenho de `StoreCategoryPageBody`.
 */
export async function StoreProductPageBody({ slug }: { slug: string }) {
  const detail = await getStoreProductDetail(slug)
  if (!detail) notFound()

  // O card "Em destaque" do menu vem de `filterOptions.menuHighlights`: a
  // página não busca mais 24 produtos só para alimentá-lo.
  const [filterOptions, reviewAggregate, recommendations] = await Promise.all([
    getStoreFilterOptions("store"),
    // Já existia no repositório e alimentava só a UI — é o que habilita as
    // estrelas no resultado de busca.
    getReviewAggregate(detail.product.id),
    // Complemento de Pagamento é pagar outro pedido: nada a recomendar.
    detail.product.is_payment_complement ? Promise.resolve([]) : listProductRecommendations(detail.product),
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
    // Inclui a galeria das cores: a maioria dos anúncios só tem 1 foto no produto.
    image: productGalleryImages(product.images, detail.variants, SITE_URL),
    // Código de SKU quando o produto simples tem um; senão o id, que já era
    // o identificador estável que o Merchant Center via.
    sku: product.sku ?? product.id,
    ...(product.category ? { category: product.category } : {}),
    itemCondition:
      product.condition === "new"
        ? "https://schema.org/NewCondition"
        : "https://schema.org/UsedCondition",
    /**
     * `aggregateRating` é o que troca o link de texto por estrelas na SERP —
     * o maior ganho de CTR disponível numa página de produto. Só entra com
     * review de verdade: o Google trata agregado com `reviewCount: 0` como
     * schema inválido e pode derrubar o rich result da página inteira.
     */
    ...(reviewAggregate.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviewAggregate.avgRating.toFixed(1),
            reviewCount: reviewAggregate.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "BRL",
      price: (priceCents / 100).toFixed(2),
      // `priceValidUntil` fica de fora de propósito: a query do produto não
      // traz data de alteração, e derivá-la do relógio deixaria o render impuro
      // (a página é ISR — o mesmo conteúdo geraria HTML diferente a cada
      // revalidação). O campo é opcional; data inventada é pior que ausente.
      availability: product.is_sold_out
        ? "https://schema.org/OutOfStock"
        : product.preorder
          ? // Lote fechado, cheio ou "em breve" não é reservável: anunciar
            // PreOrder ali levaria a pessoa da busca a um botão que não existe.
            effectivePreorderStatus(product.preorder, false) === "open"
            ? "https://schema.org/PreOrder"
            : "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
      itemCondition:
        product.condition === "new"
          ? "https://schema.org/NewCondition"
          : "https://schema.org/UsedCondition",
      seller: { "@id": `${SITE_URL}/#organization` },
      /**
       * Frete e devolução: sem os dois o Merchant Center marca a oferta como
       * incompleta e o item perde elegibilidade nos resultados de compra.
       * A política referenciada é a mesma publicada em /trocas-e-devolucoes.
       */
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "BR",
        },
        // Frete grátis é o que o checkout cobra (nada), não promoção: ver
        // lib/store-shipping.ts. O prazo fica de fora: o schema pede
        // manuseio e trânsito separados, e só sabemos o total.
        ...(hasFreeShipping(product)
          ? { shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "BRL" } }
          : {}),
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "BR",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        // 7 dias corridos é o direito de arrependimento do CDC (art. 49),
        // que é o prazo publicado em /trocas-e-devolucoes.
        merchantReturnDays: 7,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
        merchantReturnLink: `${SITE_URL}/trocas-e-devolucoes`,
      },
    },
  }

  /**
   * JSON-LD BreadcrumbList: espelha a trilha visual do topo da página. Com
   * ele o Google troca a URL crua do resultado por "Loja > Categoria >
   * Marca", que é o mesmo caminho que o usuário vê ao chegar.
   */
  const breadcrumbItems = [
    { name: "Loja", item: `${SITE_URL}/loja` },
    ...(product.category
      ? [
          {
            name: getCategoryLabel(product.category),
            item: `${SITE_URL}/loja/categoria/${encodeURIComponent(product.category)}`,
          },
        ]
      : []),
    ...(product.brand
      ? [{ name: product.brand, item: `${SITE_URL}/loja/marca/${encodeURIComponent(product.brand)}` }]
      : []),
    { name: product.name, item: url },
  ]

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  }

  return (
    <>
      {/* Sem schema de Product no complemento nem em serviço: a oferta diria
          o preço de tabela (R$ 6), que nunca é o que se paga, e o Merchant
          Center importava o Xianyu Express como produto. Mesma régua do feed
          em `app/merchant-feed.xml`. */}
      {!product.is_payment_complement && !isSinglePriceProduct(product) && <JsonLd data={productJsonLd} />}
      <JsonLd data={breadcrumbJsonLd} />
      <ProductDetailContent
        {...detail}
        filterOptions={filterOptions}
        recommendations={recommendations}
        rating={reviewAggregate.count > 0 ? { average: reviewAggregate.avgRating, count: reviewAggregate.count } : null}
      />
    </>
  )
}
