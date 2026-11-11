import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { logAdminAction } from "@/lib/server/repositories/store-admin-audit-repository"
// Só tipo: o repositório de pedidos não importa este.
import type { RepositoryResult } from "@/lib/server/repositories/orders-repository"
import { ORDER_PAID_STATUSES } from "@/lib/order-status"

/**
 * Troca do produto de um item do pedido (acabou o estoque do que foi comprado
 * e o cliente levou outro, pagando a diferença por fora ou por Complemento).
 *
 * O pedido é a fonte da avaliação: `hasVerifiedPurchase` e o convite de
 * "Avalie sua compra" leem `store_orders.items`. Enquanto o item dizia o
 * produto antigo, o cliente só conseguia avaliar o que NÃO recebeu. Trocar o
 * item corrige isso e o "Ver pedido" passa a mostrar o que foi entregue.
 *
 * O que NÃO muda:
 * - Preço da linha e total: é o que o cliente pagou neste pedido. A
 *   diferença paga fica no Complemento/registro próprio.
 * - Estoque: a unidade já saiu fisicamente; mexer aqui faria o painel
 *   contar duas vezes. Se precisar acertar, é na ficha do produto.
 *
 * A avaliação que o cliente já deixou POR ESTE PEDIDO acompanha a troca
 * (era do produto que ele recebeu, só estava pendurada no errado). O lançamento
 * de Aura da avaliação vai junto, senão apagar e refazer a avaliação pagaria
 * de novo (a chave anti-duplicidade é usuário + produto).
 */

const PAID_STATUSES = ORDER_PAID_STATUSES as string[]

type OrderLine = Record<string, unknown> & { id?: unknown; name?: unknown; variant_label?: unknown }

export type OrderItemSwapResult =
  | { ok: true; items: Record<string, unknown>[]; movedReviews: number }
  | Extract<RepositoryResult, { ok: false }>

export async function swapOrderItemProduct(
  orderId: string,
  params: { lineIndex: number; productId: string; variantId: string | null },
  adminId: string
): Promise<OrderItemSwapResult> {
  const db = createSupabaseAdminClient()

  const { data: order, error: orderError } = await db
    .from("store_orders")
    .select("id, status, items, metadata")
    .eq("id", orderId)
    .maybeSingle()
  if (orderError) {
    console.error("[order-item-swap] load order:", orderError)
    return { ok: false, error: "Erro ao carregar o pedido.", status: 500 }
  }
  if (!order) return { ok: false, error: "Pedido não encontrado.", status: 404 }
  if (!PAID_STATUSES.includes(order.status)) {
    return { ok: false, error: "Só dá para trocar o produto de um pedido pago.", status: 409 }
  }

  const items = (Array.isArray(order.items) ? order.items : []) as OrderLine[]
  const line = items[params.lineIndex]
  if (!line) return { ok: false, error: "Item não encontrado no pedido.", status: 404 }

  const { data: product, error: productError } = await db
    .from("store_products")
    .select("id, name, images, is_payment_complement, variants:store_product_variants(id, label, image_url)")
    .eq("id", params.productId)
    .maybeSingle()
  if (productError) {
    console.error("[order-item-swap] load product:", productError)
    return { ok: false, error: "Erro ao carregar o produto.", status: 500 }
  }
  if (!product) return { ok: false, error: "Produto não encontrado.", status: 404 }
  if (product.is_payment_complement) {
    return { ok: false, error: "Complemento de Pagamento não é produto entregável.", status: 400 }
  }

  // Os tipos gerados não conhecem o embed (o mesmo de store-repository).
  const variants = ((product as unknown as { variants?: unknown }).variants ?? []) as {
    id: string
    label: string
    image_url: string | null
  }[]
  const variant = params.variantId ? variants.find((v) => v.id === params.variantId) ?? null : null
  if (params.variantId && !variant) {
    return { ok: false, error: "A cor escolhida não é deste produto.", status: 400 }
  }
  if (!variant && variants.length > 0) {
    return { ok: false, error: "Escolha a cor do produto entregue.", status: 400 }
  }

  const oldProductId = typeof line.id === "string" ? line.id : null
  if (oldProductId === product.id && (line.variant_id ?? null) === (variant?.id ?? null)) {
    return { ok: false, error: "O item já é esse produto.", status: 400 }
  }

  const swapped: OrderLine = {
    ...line,
    id: product.id,
    name: product.name,
    image: variant?.image_url ?? product.images?.[0] ?? null,
    variant_id: variant?.id ?? null,
    variant_label: variant?.label ?? null,
    // Opções e combinação eram do produto antigo: não existem no novo.
    variant_options: [],
    sku: null,
    sku_id: null,
    sku_stock: false,
    // Mantém o que foi comprado originalmente (a primeira troca, se houver várias).
    swapped_from: line.swapped_from ?? {
      id: oldProductId,
      name: typeof line.name === "string" ? line.name : null,
      variant_label: typeof line.variant_label === "string" ? line.variant_label : null,
    },
  }
  const nextItems = items.map((item, idx) => (idx === params.lineIndex ? swapped : item))

  const { error: updateError } = await db.from("store_orders").update({ items: nextItems }).eq("id", orderId)
  if (updateError) {
    console.error("[order-item-swap] update items:", updateError)
    return { ok: false, error: "Erro ao salvar a troca.", status: 500 }
  }

  const movedReviews = oldProductId && oldProductId !== product.id
    ? await moveOrderReview(db, {
        orderId,
        userId: (order.metadata as { user_id?: unknown } | null)?.user_id,
        fromProductId: oldProductId,
        toProductId: product.id,
        // Outro item do mesmo pedido ainda é o produto antigo: a avaliação é dele.
        oldStillInOrder: nextItems.some((item) => item.id === oldProductId),
      })
    : 0

  await logAdminAction({
    adminId,
    action: "order.item_swap",
    entityType: "store_order",
    entityId: orderId,
    before: { lineIndex: params.lineIndex, productId: oldProductId, name: line.name ?? null, variant: line.variant_label ?? null },
    after: { productId: product.id, name: product.name, variant: variant?.label ?? null, movedReviews },
  })

  return { ok: true, items: nextItems, movedReviews }
}

async function moveOrderReview(
  db: ReturnType<typeof createSupabaseAdminClient>,
  args: { orderId: string; userId: unknown; fromProductId: string; toProductId: string; oldStillInOrder: boolean }
): Promise<number> {
  if (typeof args.userId !== "string" || args.oldStillInOrder) return 0

  // Já avaliou o produto novo (outra compra): a unicidade usuário + produto
  // impede ter duas, então a antiga fica onde está.
  const { data: existing } = await db
    .from("store_product_reviews")
    .select("id")
    .eq("user_id", args.userId)
    .eq("product_id", args.toProductId)
    .maybeSingle()
  if (existing) return 0

  const { data: moved, error } = await db
    .from("store_product_reviews")
    .update({ product_id: args.toProductId })
    .eq("user_id", args.userId)
    .eq("product_id", args.fromProductId)
    .eq("order_id", args.orderId)
    .select("id")
  if (error) {
    console.error("[order-item-swap] move review:", error)
    return 0
  }
  if (!moved || moved.length === 0) return 0

  const { error: ledgerError } = await db
    .from("aura_ledger")
    .update({ source_store_product_id: args.toProductId })
    .eq("user_id", args.userId)
    .eq("reason", "store_review")
    .eq("source_store_product_id", args.fromProductId)
  if (ledgerError) console.error("[order-item-swap] move review aura:", ledgerError)

  return moved.length
}

export type SwapProductVariant = { id: string; label: string }

/** Cores do produto, para o admin escolher a que foi entregue. */
export async function listSwapProductVariants(productId: string): Promise<SwapProductVariant[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from("store_product_variants")
    .select("id, label")
    .eq("product_id", productId)
    .order("position", { ascending: true })
  if (error) {
    console.error("[order-item-swap] listSwapProductVariants:", error)
    return []
  }
  return (data ?? []) as SwapProductVariant[]
}
