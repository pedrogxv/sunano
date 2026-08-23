import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

export type TierlistTier = "S" | "A" | "B" | "C" | "D"

export type TierlistItem = {
  peripheralId: string
  tier: TierlistTier
  position: number
  peripheral: {
    id: string
    name: string
    brandName: string | null
    category: string
    imageUrl: string | null
  }
}

/** Itens da tierlist pessoal de um usuário, com dados do periférico para exibição — leitura pública. */
export async function getUserTierlistItems(userId: string): Promise<TierlistItem[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_tierlist_items")
    .select(
      "peripheral_id, tier, position, peripherals ( id, name, category, image_url, brands ( name ) )"
    )
    .eq("user_id", userId)
    .order("tier", { ascending: true })
    .order("position", { ascending: true })

  if (error) throw error

  type Row = {
    peripheral_id: string
    tier: TierlistTier
    position: number
    peripherals: {
      id: string
      name: string
      category: string
      image_url: string | null
      brands: { name: string } | { name: string }[] | null
    } | null
  }

  return ((data as unknown as Row[]) ?? [])
    .filter((row) => row.peripherals)
    .map((row) => {
      const brand = Array.isArray(row.peripherals!.brands) ? row.peripherals!.brands[0] : row.peripherals!.brands
      return {
        peripheralId: row.peripheral_id,
        tier: row.tier,
        position: row.position,
        peripheral: {
          id: row.peripherals!.id,
          name: row.peripherals!.name,
          brandName: brand?.name ?? null,
          category: row.peripherals!.category,
          imageUrl: row.peripherals!.image_url,
        },
      }
    })
}

/** Adiciona ou move um item para um tier/posição — dono só, checagem de VIP feita na rota (defesa em profundidade com a RLS). */
export async function upsertTierlistItem(
  userId: string,
  peripheralId: string,
  tier: TierlistTier,
  position: number
): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_tierlist_items")
    .upsert(
      { user_id: userId, peripheral_id: peripheralId, tier, position, updated_at: new Date().toISOString() },
      { onConflict: "user_id,peripheral_id" }
    )
  if (error) throw error
}

/** Remove um item da tierlist do usuário. */
export async function removeTierlistItem(userId: string, peripheralId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_tierlist_items")
    .delete()
    .eq("user_id", userId)
    .eq("peripheral_id", peripheralId)
  if (error) throw error
}

/** Quantos itens o usuário já tem na própria tierlist — usado para decidir se mostra o card resumido no perfil. */
export async function countUserTierlistItems(userId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from("user_tierlist_items")
    .select("peripheral_id", { count: "exact", head: true })
    .eq("user_id", userId)
  if (error) throw error
  return count ?? 0
}
