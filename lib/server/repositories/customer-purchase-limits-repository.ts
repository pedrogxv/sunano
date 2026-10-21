import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Limite de unidades por CLIENTE (`store_products.max_per_customer`), para
 * lançamento disputado. Cliente = a conta OU o CPF do pagador
 * (`store_orders.payer_document_hash`): várias contas com o mesmo CPF contam
 * juntas, e a mesma conta trocando de CPF também.
 *
 * Conta todo pedido que segura ou já levou o produto, inclusive `pending`:
 * acumular pedidos abertos é exatamente o que o cambista faz.
 */

export type CustomerLimits =
  /** `available` = a migration 20270101000000 está aplicada (a coluna existe e o pedido grava o CPF). */
  | { ok: true; available: boolean; limits: Map<string, number> }
  | { ok: false }

/** Postgres `42703` (coluna inexistente): a migration ainda não rodou. */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204"
}

/** Tetos por produto. Produto sem teto não entra no mapa. */
export async function getCustomerLimits(productIds: string[]): Promise<CustomerLimits> {
  if (productIds.length === 0) return { ok: true, available: true, limits: new Map() }
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("store_products").select("id, max_per_customer").in("id", productIds)

  // Código publicado antes da migration: segue sem limite, como antes dela.
  if (isMissingColumn(error)) return { ok: true, available: false, limits: new Map() }
  if (error) {
    console.error("[customer-purchase-limits] getCustomerLimits:", error)
    return { ok: false }
  }

  const limits = new Map<string, number>()
  for (const row of data ?? []) {
    if (row.max_per_customer != null) limits.set(row.id, row.max_per_customer)
  }
  return { ok: true, available: true, limits }
}

/** Quanto o cliente já tem de cada produto (ver o cabeçalho). `null` = a consulta falhou. */
export async function getCustomerProductQuantities(params: {
  productIds: string[]
  userId: string
  payerFingerprint: string | null
  isSandbox: boolean
}): Promise<Map<string, number> | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("store_customer_product_quantities", {
    p_product_ids: params.productIds,
    p_user_id: params.userId,
    p_payer_document_hash: params.payerFingerprint,
    p_is_sandbox: params.isSandbox,
  })
  if (error) {
    console.error("[customer-purchase-limits] getCustomerProductQuantities:", error)
    return null
  }
  return new Map((data ?? []).map((row) => [row.product_id, row.quantity]))
}
