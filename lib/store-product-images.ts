/**
 * Todas as fotos de um produto da Loja, para quem descreve o produto fora da
 * página (JSON-LD e feed do Merchant Center).
 *
 * A maioria dos anúncios guarda UMA foto em `store_products.images` e o resto
 * na galeria de cada cor (`store_product_variant_images`). Lendo só a coluna
 * do produto, o Google recebia uma imagem de um anúncio que tem 12 na página.
 *
 * Ordem: fotos do produto, depois foto principal + galeria de cada variante na
 * ordem das variantes. Sem repetição; URL relativa vira absoluta (o Google
 * descarta a relativa).
 */
export function productGalleryImages(
  productImages: readonly string[],
  variants: readonly { image_url?: string | null; images?: readonly string[] | null }[],
  baseUrl: string
): string[] {
  const all = [
    ...productImages,
    ...variants.flatMap((variant) => [variant.image_url, ...(variant.images ?? [])]),
  ].filter((image): image is string => Boolean(image))

  return [...new Set(all.map((image) => new URL(image, baseUrl).toString()))]
}
