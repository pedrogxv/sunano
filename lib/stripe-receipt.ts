/**
 * Comprovante do Stripe: só `https` em domínio do próprio Stripe vira link.
 *
 * O valor entra em `store_orders.metadata.stripe_receipt_url` pelo webhook e é
 * lido por três telas (Meus Pedidos, polling do PIX, e-mail de confirmação),
 * duas delas como `href`. A origem é o Stripe, mas um `href` vindo de coluna
 * nunca deve confiar na origem: aqui há UM validador, usado na escrita e na
 * leitura. Módulo puro (sem `server-only`) porque a tela de pedidos também usa.
 */
export function safeStripeReceiptUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "https:") return null
    const host = url.hostname.toLowerCase()
    if (host !== "stripe.com" && !host.endsWith(".stripe.com")) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Comprovante gravado no `metadata` de um pedido, já validado. */
export function stripeReceiptUrlOf(metadata: Record<string, unknown> | null | undefined): string | null {
  return safeStripeReceiptUrl(metadata?.stripe_receipt_url)
}
