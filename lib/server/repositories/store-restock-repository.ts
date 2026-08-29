import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Inscrições de "Avise-me quando voltar" (ver 20260929000000_store_restock_alerts.sql).
 *
 * Este arquivo só cuida da inscrição: o disparo do aviso é feito por trigger no
 * banco quando o produto (ou a cor) sai do estado esgotado, reaproveitando
 * `push_notification` — mesmo caminho das outras notificações do site.
 *
 * `variantId` null significa "me avise quando qualquer cor voltar".
 */

export type RestockAlertState = {
  /** Inscrito no produto inteiro (variantId null). */
  product: boolean
  /** Ids das cores em que o usuário está inscrito. */
  variantIds: string[]
}

/**
 * Inscreve o usuário. Idempotente: reinscrever depois de já ter sido avisado
 * limpa `notified_at`, senão a linha antiga bloquearia o próximo aviso.
 */
export async function subscribeRestockAlert(params: {
  userId: string
  productId: string
  variantId: string | null
}): Promise<void> {
  const db = createSupabaseAdminClient()

  // Delete-then-insert em vez de upsert: o índice único usa
  // `coalesce(variant_id, ...)`, expressão que o PostgREST não aceita como
  // alvo de `on_conflict`. Apagar antes também resolve a reinscrição depois de
  // já ter sido avisado — a linha antiga tem `notified_at` preenchido e
  // bloquearia o próximo aviso.
  await unsubscribeRestockAlert(params)

  const { error } = await db.from("store_restock_alerts").insert({
    user_id: params.userId,
    product_id: params.productId,
    variant_id: params.variantId,
  })

  if (error) {
    console.error("[store-restock-repository] subscribeRestockAlert:", error)
    throw new Error("Não foi possível ativar o aviso.")
  }
}

/** Remove a inscrição do usuário naquele produto/cor. */
export async function unsubscribeRestockAlert(params: {
  userId: string
  productId: string
  variantId: string | null
}): Promise<void> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("store_restock_alerts")
    .delete()
    .eq("user_id", params.userId)
    .eq("product_id", params.productId)

  query = params.variantId ? query.eq("variant_id", params.variantId) : query.is("variant_id", null)

  const { error } = await query
  if (error) {
    console.error("[store-restock-repository] unsubscribeRestockAlert:", error)
    throw new Error("Não foi possível desativar o aviso.")
  }
}

/**
 * O que o usuário já assinou nesse produto — usado pela página do produto pra
 * já desenhar o botão no estado certo em vez de sempre oferecer "ativar".
 * Só inscrições ainda não avisadas contam: depois do aviso a assinatura se
 * encerra e o botão volta a oferecer ativação.
 */
export async function getRestockAlertState(
  userId: string,
  productId: string
): Promise<RestockAlertState> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_restock_alerts")
    .select("variant_id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .is("notified_at", null)

  if (error) {
    console.error("[store-restock-repository] getRestockAlertState:", error)
    return { product: false, variantIds: [] }
  }

  const rows = data ?? []
  return {
    product: rows.some((r) => r.variant_id === null),
    variantIds: rows.map((r) => r.variant_id as string | null).filter((id): id is string => id !== null),
  }
}
