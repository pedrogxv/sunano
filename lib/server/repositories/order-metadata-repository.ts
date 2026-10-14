import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Grava chaves em `store_orders.metadata` SEM ler antes.
 *
 * O padrão antigo (ler o objeto, espalhar, gravar tudo) perdia chave quando
 * dois eventos do mesmo pedido chegavam juntos: o webhook de pagamento, o aviso
 * de fraude e a disputa mexem em `metadata` e podem cair no mesmo segundo. Aqui
 * o merge roda no banco, num UPDATE só (`merge_store_order_metadata`,
 * 20261226000000): cada chamada troca apenas as chaves de primeiro nível que
 * passou e preserva as outras.
 *
 * Lança em erro de banco, para o webhook responder 500 e o Stripe reentregar.
 * Devolve `false` quando o pedido não existe ou saiu do status exigido em
 * `requireStatus`.
 */
export async function patchOrderMetadata(
  orderId: string,
  patch: Record<string, unknown>,
  options?: {
    /** O merge só vale se o pedido ainda estiver neste status. */
    requireStatus?: string
    /** Novo `pix_expires_at` (ISO), gravado no mesmo UPDATE. */
    pixExpiresAt?: string
  }
): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("merge_store_order_metadata", {
    p_order_id: orderId,
    p_patch: patch,
    ...(options?.requireStatus ? { p_require_status: options.requireStatus } : {}),
    ...(options?.pixExpiresAt ? { p_pix_expires_at: options.pixExpiresAt } : {}),
  })
  if (error) {
    throw new Error(`merge_store_order_metadata falhou (${orderId}): ${error.message}`)
  }
  return data === true
}
