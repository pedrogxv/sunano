/**
 * Aura que uma compra na Loja rende: 1 a cada R$ 10 do preço PIX, creditada
 * na confirmação do pagamento e estornada se o pedido for cancelado ou
 * reembolsado (07/10/2026; antes era na entrega).
 *
 * Espelha `v_cents_per_aura` em `trg_reward_store_purchase_aura`
 * (migration 20261223000000). O do banco é o que vale: mudar um sem o outro
 * faz a página prometer uma Aura que a compra não credita.
 */
export const STORE_PURCHASE_CENTS_PER_AURA = 1000

/** Aura de um valor em centavos (preço PIX). Arredonda para baixo, igual ao banco. */
export function purchaseAuraFor(pixCents: number): number {
  if (!Number.isFinite(pixCents) || pixCents <= 0) return 0
  return Math.floor(pixCents / STORE_PURCHASE_CENTS_PER_AURA)
}
