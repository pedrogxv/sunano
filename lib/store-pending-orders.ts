/**
 * Pedido em aberto x carrinho novo. A regra (um pedido pendente por produto)
 * mora no servidor, em `pending-order-conflicts-repository`; este módulo é a
 * parte que o cliente precisa para avisar ANTES do clique e entender o 409.
 */

/** `code` do 409 do checkout quando um produto do carrinho já está num pedido pendente. */
export const PENDING_ORDER_CONFLICT_CODE = "pending_order_conflict"

type PendingOrderLike = { id: string; items: { id?: string }[] }

/** Pedidos com algum produto do carrinho (mesmo critério do servidor: produto, qualquer variante). */
export function pendingOrdersSharingCart<T extends PendingOrderLike>(orders: T[], cartProductIds: Iterable<string>): T[] {
  const cart = new Set(cartProductIds)
  return orders.filter((order) => order.items.some((item) => typeof item.id === "string" && cart.has(item.id)))
}

/** "vence em 40 min" / "vence em 3 h" — o prazo da loja para pagar o pedido. */
export function paymentDeadlineLabel(expiresAt: string | null, now = Date.now()): string | null {
  if (!expiresAt) return null
  const minutes = Math.ceil((new Date(expiresAt).getTime() - now) / 60_000)
  if (!Number.isFinite(minutes)) return null
  if (minutes <= 0) return "vencendo agora"
  if (minutes < 60) return `vence em ${minutes} min`
  return `vence em ${Math.round(minutes / 60)} h`
}
