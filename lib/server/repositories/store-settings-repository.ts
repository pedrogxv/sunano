import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { logAdminAction } from "@/lib/server/repositories/store-admin-audit-repository"

export interface StoreSettings {
  cardSurchargePercent: number
  cardMaxInstallments: number
}

// Usado só se a linha única faltar por algum motivo (não deveria acontecer —
// a migração já garante 1 linha via `insert ... on conflict do nothing`).
const DEFAULT_SETTINGS: StoreSettings = { cardSurchargePercent: 10, cardMaxInstallments: 6 }

export async function getStoreSettings(): Promise<StoreSettings> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_settings")
    .select("card_surcharge_percent, card_max_installments")
    .eq("id", true)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error("[store-settings-repository] getStoreSettings:", error)
    return DEFAULT_SETTINGS
  }

  return {
    cardSurchargePercent: Number(data.card_surcharge_percent),
    cardMaxInstallments: data.card_max_installments,
  }
}

export interface UpdateStoreSettingsParams {
  cardSurchargePercent: number
  cardMaxInstallments: number
  adminId: string
}

export interface RepositoryResult {
  ok: boolean
  error?: string
}

/**
 * Revalida os limites em código mesmo já existindo CHECK no banco — defesa
 * em profundidade barata, e dá uma mensagem de erro em português em vez de
 * deixar o Postgres estourar uma constraint crua pro usuário.
 */
export async function updateStoreSettings(params: UpdateStoreSettingsParams): Promise<RepositoryResult> {
  if (params.cardSurchargePercent < 0 || params.cardSurchargePercent > 100) {
    return { ok: false, error: "Percentual de acréscimo deve estar entre 0 e 100." }
  }
  if (!Number.isInteger(params.cardMaxInstallments) || params.cardMaxInstallments < 1 || params.cardMaxInstallments > 6) {
    return { ok: false, error: "Parcelas máximas deve ser um número inteiro entre 1 e 6." }
  }

  const db = createSupabaseAdminClient()
  const before = await getStoreSettings()

  const { error } = await db
    .from("store_settings")
    .update({
      card_surcharge_percent: params.cardSurchargePercent,
      card_max_installments: params.cardMaxInstallments,
      updated_by: params.adminId,
    })
    .eq("id", true)

  if (error) {
    console.error("[store-settings-repository] updateStoreSettings:", error)
    return { ok: false, error: "Não foi possível salvar as configurações." }
  }

  await logAdminAction({
    adminId: params.adminId,
    action: "store_settings.update",
    entityType: "store_settings",
    entityId: params.adminId,
    before: { ...before },
    after: { cardSurchargePercent: params.cardSurchargePercent, cardMaxInstallments: params.cardMaxInstallments },
  })

  return { ok: true }
}
