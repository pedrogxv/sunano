/**
 * `src` da imagem do QR PIX a partir de `store_orders.pix_qr_code_base64`.
 *
 * A coluna tem dois formatos, por gateway: a Asaas grava o PNG em base64 CRU
 * (`encodedImage`), e Stripe e Mercado Pago gravam a data URI pronta
 * (`data:image/png;base64,…`). Prefixar sempre quebrava os dois últimos
 * (`data:…;base64,data:…`), e não prefixar quebrava a Asaas. Toda tela que
 * desenha o QR passa por aqui.
 */
export function pixQrSrc(value: string | null | undefined): string | null {
  const v = value?.trim()
  if (!v) return null
  return v.startsWith("data:") ? v : `data:image/png;base64,${v}`
}
