/**
 * Tetos de quantidade da Loja, num lugar só para o carrinho (cliente) e o
 * checkout (servidor) dizerem a mesma coisa.
 *
 * Antes cada lado tinha o seu: o carrinho deixava subir sem limite um produto
 * sem controle de estoque e a pessoa só descobria no "Gerar PIX", com o
 * servidor recusando 20+ unidades. Um erro no carrinho é recuperável; o
 * mesmo erro depois do clique em pagar é abandono.
 *
 * Quem decide de verdade continua sendo o servidor: o cliente só evita
 * oferecer o que ele recusaria.
 */

/** Unidades por linha do carrinho (mesmo produto + cor + opções). */
export const MAX_QUANTITY_PER_LINE = 20

/**
 * Limite diário (janela de 24h corridas) de unidades por produto e por
 * usuário, aplicado só a produtos SEM controle de estoque e fora de
 * pré-venda (ver `app/api/store/checkout/route.ts`).
 */
export const DAILY_PURCHASE_LIMIT_NO_STOCK = 15

/**
 * Quanto uma linha do carrinho pode ter: o estoque, quando há controle; o
 * limite diário, quando não há (e não é pré-venda, que tem teto próprio no
 * lote); e nunca mais que o teto por linha.
 *
 * O limite diário e o por cliente aqui não descontam o que a pessoa já
 * comprou (o carrinho não sabe disso): são o teto de UMA compra, e o checkout
 * confere o acumulado.
 */
export function cartLineMaxQuantity(line: {
  stock: number | null
  sale_type?: "pre_order" | "ready_stock" | "normal" | null
  /** Teto do produto por cliente (`store_products.max_per_customer`). */
  maxPerCustomer?: number | null
}): number {
  const cap =
    line.stock !== null
      ? line.stock
      : line.sale_type === "pre_order"
        ? MAX_QUANTITY_PER_LINE
        : DAILY_PURCHASE_LIMIT_NO_STOCK
  return Math.max(0, Math.min(cap, line.maxPerCustomer ?? MAX_QUANTITY_PER_LINE, MAX_QUANTITY_PER_LINE))
}
