import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório do conteúdo editável do painel de informações da Tierlist
 * (por enquanto, só a aba "Última Atualização").
 */

const ROW_ID = 1

export type TierlistMeta = {
  latestUpdateDescription: string
  updatedAt: string
}

export async function getTierlistMeta(): Promise<TierlistMeta | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("tierlist_meta")
    .select("latest_update_description, updated_at")
    .eq("id", ROW_ID)
    .maybeSingle()

  if (error || !data) return null

  return {
    latestUpdateDescription: data.latest_update_description,
    updatedAt: data.updated_at,
  }
}

export async function updateTierlistMeta(input: { latestUpdateDescription: string }): Promise<TierlistMeta> {
  const db = createSupabaseAdminClient()
  const updatedAt = new Date().toISOString()
  const { error } = await db.from("tierlist_meta").upsert({
    id: ROW_ID,
    // Coluna legada, não é mais editável manualmente; mantida vazia (updated_at é a fonte da data).
    latest_update_month: "",
    latest_update_description: input.latestUpdateDescription,
    updated_at: updatedAt,
  })

  if (error) throw error

  return { latestUpdateDescription: input.latestUpdateDescription, updatedAt }
}
