import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { cancelOrder } from "@/lib/server/repositories/orders-repository"
import { onlyUuids } from "@/lib/server/repositories/_shared"

/**
 * Um pedido aberto por produto. Sem esta trava, quem desistia de pagar e
 * voltava à loja criava um segundo pedido do MESMO produto: dois pedidos
 * segurando estoque (com 1 unidade, o próprio cliente via "esgotado"), duas
 * threads no Discord e, no cartão da InfinitePay, dois links que nunca
 * expiram — pagar os dois era compra em dobro com estorno manual.
 *
 * O checkout recusa com 409 enquanto houver um pedido `pending` do usuário
 * com algum produto do carrinho, e a tela oferece as duas saídas: pagar o
 * pedido aberto, ou substituí-lo (cancelar e criar o novo na mesma chamada,
 * com o estoque do antigo já devolvido antes da reserva do novo).
 */

/** Status em que o pedido já foi pago (pagar de novo seria duplicidade). */
const PAID_STATUSES = new Set(["paid", "awaiting_shipping_info", "shipped", "delivered"])

export type PendingOrdersSnapshot = {
  /** Pedidos pendentes do usuário no ambiente atual (todos, com ou sem conflito). */
  pendingIds: string[]
  /** Os que têm algum produto do carrinho. */
  conflictIds: string[]
}

/**
 * Pedidos pendentes do usuário e quais deles têm produto do carrinho. Só o
 * ambiente atual do gateway: pedido de sandbox não prende estoque de produção.
 */
export async function getPendingOrdersSnapshot(params: {
  userId: string
  productIds: string[]
  isSandbox: boolean
}): Promise<{ ok: true; snapshot: PendingOrdersSnapshot } | { ok: false; error: unknown }> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_orders")
    .select("id, items")
    .eq("status", "pending")
    .eq("is_sandbox", params.isSandbox)
    // `metadata->>user_id` usa o índice `idx_store_orders_metadata_user_id`;
    // o `contains` (jsonb @>) de antes não, e varria todos os pedidos
    // pendentes da loja a cada checkout — no pico, milhares.
    .eq("metadata->>user_id", params.userId)
    .limit(50)
  if (error) return { ok: false, error }

  const cartProducts = new Set(params.productIds)
  const rows = data ?? []
  return {
    ok: true,
    snapshot: {
      pendingIds: rows.map((row) => row.id),
      conflictIds: rows
        .filter((row) =>
          ((row.items ?? []) as { id?: unknown }[]).some(
            (item) => typeof item.id === "string" && cartProducts.has(item.id)
          )
        )
        .map((row) => row.id),
    },
  }
}

export type ReplacePendingOrdersResult =
  | { ok: true; cancelledIds: string[] }
  /** Um dos pedidos foi pago no meio (outra aba): criar o novo seria comprar duas vezes. */
  | { ok: false; paidOrderId: string }

/**
 * Cancela os pedidos que o cliente escolheu substituir. Só recebe ids que o
 * próprio servidor achou em `getPendingOrdersSnapshot` (do usuário, pendentes,
 * com produto do carrinho): o corpo da requisição nunca escolhe o que cancelar.
 *
 * `cancelOrder` devolve o estoque e fecha a cobrança no gateway (PIX da Asaas,
 * checkout de cartão da Asaas, Stripe). Pedido que já saiu de `pending` no
 * meio do caminho: expirado/cancelado não atrapalha, pago interrompe.
 */
export async function replacePendingOrders(orderIds: string[]): Promise<ReplacePendingOrdersResult> {
  const ids = onlyUuids(orderIds)
  const cancelledIds: string[] = []
  for (const id of ids) {
    const result = await cancelOrder(id, { reason: "Substituído por um novo pedido do cliente" })
    if (result.ok) {
      cancelledIds.push(id)
      continue
    }
    const db = createSupabaseAdminClient()
    const { data: current } = await db.from("store_orders").select("status").eq("id", id).maybeSingle()
    if (current && PAID_STATUSES.has(current.status)) return { ok: false, paidOrderId: id }
  }
  return { ok: true, cancelledIds }
}
