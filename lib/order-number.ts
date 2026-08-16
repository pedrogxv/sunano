/**
 * Não existe coluna sequencial em `store_orders` (id é uuid) — deriva um
 * número curto e estável a partir do uuid só para exibição (recibo, "Meus
 * Pedidos"). Não é único no sentido estrito, mas colisão nos 8 primeiros
 * hex chars de um uuid v4 é irrelevante para esse uso.
 */
export function orderNumber(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase()
}
