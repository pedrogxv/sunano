import {
  getStoreProductFeedExtras,
  listActiveProductsByType,
  type StoreProductCard,
  type StoreProductFeedExtras,
} from "@/lib/server/repositories/store-repository"
import { productGalleryImages } from "@/lib/store-product-images"
import { toPlainText } from "@/lib/seo"
import { cardActiveVariant, computeCardDisplayPrice, isCardSoldOut, isSinglePriceProduct } from "@/lib/store-pricing"
import { hasFreeShipping } from "@/lib/store-shipping"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"
import { getCategoryLabel } from "@/lib/store-category-icons"
import { SITE_URL } from "@/lib/site-url"

/**
 * Feed de produtos do Google Merchant Center (RSS 2.0 + namespace `g:`).
 *
 * Sem ele o Merchant descobria a Loja rastreando as páginas: produto novo
 * levava semanas para entrar (14 dos 36 ativos não estavam lá), produto
 * apagado ficava como "Reprovado" apontando para um 404, e o Xianyu Express
 * (serviço de R$ 6 com "valor simbólico") entrava como produto. O feed é a
 * lista exata da vitrine: o que sai daqui some do Merchant na busca seguinte.
 *
 * O preço sai do mesmo `computeCardDisplayPrice` do card e do JSON-LD da
 * página; divergir do que a página mostra é o motivo mais comum de reprovação
 * ("preço incompatível").
 *
 * Fica fora do proxy (o matcher ignora `.xml`), por isso a manutenção da Loja
 * é checada aqui: Loja fechada devolve o feed vazio, e o Merchant tira os
 * produtos do ar em vez de mandar gente para a tela "Coming soon".
 */
export const revalidate = 3600

const MAX_EXTRA_IMAGES = 10

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function tag(name: string, value: string | null | undefined): string {
  return value ? `<${name}>${escapeXml(value)}</${name}>` : ""
}

function money(cents: number): string {
  return `${(cents / 100).toFixed(2)} BRL`
}

function absolute(url: string): string {
  return new URL(url, SITE_URL).toString()
}

/** Texto puro para o `description`: o cadastro é markdown. */
function plainText(input: string | null | undefined, fallback: string): string {
  return (toPlainText(input) || fallback).slice(0, 5000)
}

/** Mesma regra de disponibilidade do JSON-LD de `StoreProductPageBody`. */
function availabilityOf(product: StoreProductCard): { value: string; date: string | null } {
  if (isCardSoldOut(product)) return { value: "out_of_stock", date: null }
  if (product.preorder) {
    return product.preorder.status === "open"
      ? { value: "preorder", date: product.preorder.shipsAt ? `${product.preorder.shipsAt}T12:00-03:00` : null }
      : { value: "out_of_stock", date: null }
  }
  return { value: "in_stock", date: null }
}

function itemXml(product: StoreProductCard, description: string, variants: StoreProductFeedExtras["variants"]): string {
  const url = `${SITE_URL}/loja/${product.slug}`
  const price = computeCardDisplayPrice(product)
  // A foto principal é a da cor que o card anuncia; o resto é a galeria
  // inteira (produto + cores), que é onde mora a maioria das fotos.
  const variant = cardActiveVariant(product)
  const gallery = productGalleryImages(product.images, variants, SITE_URL)
  const [mainImage, ...extraImages] = [
    ...new Set([variant?.image_url ? absolute(variant.image_url) : null, ...gallery].filter(Boolean) as string[]),
  ]
  const availability = availabilityOf(product)

  return [
    "<item>",
    tag("g:id", product.id),
    tag("g:title", product.name.slice(0, 150)),
    tag("g:description", description),
    tag("g:link", url),
    tag("g:image_link", mainImage),
    ...extraImages.slice(0, MAX_EXTRA_IMAGES).map((image) => tag("g:additional_image_link", image)),
    tag("g:availability", availability.value),
    tag("g:availability_date", availability.date),
    tag("g:price", money(price.baseCents)),
    price.hasDiscount ? tag("g:sale_price", money(price.effectiveCents)) : "",
    tag("g:condition", product.condition === "new" ? "new" : "used"),
    tag("g:brand", product.brand),
    // Sem GTIN/MPN cadastrados: declarar evita a reprovação por "identificador ausente".
    tag("g:identifier_exists", "no"),
    tag("g:product_type", getCategoryLabel(product.category)),
    hasFreeShipping(product)
      ? `<g:shipping><g:country>BR</g:country><g:price>${money(0)}</g:price></g:shipping>`
      : "",
    "</item>",
  ].join("")
}

export async function GET() {
  const products = isStoreMaintenanceEnabled() ? [] : await listActiveProductsByType("store")

  const listed = products
    // Serviço (consulta, Xianyu Express) e complemento de pagamento não são
    // produto: o preço é simbólico ou sai do pedido. Mesma régua do JSON-LD.
    .filter((product) => !product.is_payment_complement && !isSinglePriceProduct(product))
    // Item sem imagem é reprovado pelo Merchant: melhor não enviar.
    .filter((product) => product.images.length > 0)
  const extras = await getStoreProductFeedExtras(listed.map((product) => product.id))
  const items = listed.map((product) => {
    const extra = extras.get(product.id)
    return itemXml(product, plainText(extra?.description, product.name), extra?.variants ?? [])
  })

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    tag("title", "Loja Sunano"),
    tag("link", `${SITE_URL}/loja`),
    tag("description", "Periféricos da Loja Sunano"),
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n")

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  })
}
