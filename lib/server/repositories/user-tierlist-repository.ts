import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  PERIPHERAL_SHOWCASE_COLUMNS,
  toShowcasePeripheral,
  type PeripheralShowcaseRow,
} from "@/lib/server/repositories/peripheral-showcase-mapping"

// Os tipos vivem em `lib/personal-tierlist.ts` (módulo puro) para que Client
// Components possam importá-los sem tocar em `lib/server/**`.
export type { TierlistTier, TierlistItem } from "@/lib/personal-tierlist"

import type { TierlistItem, TierlistTier } from "@/lib/personal-tierlist"

/**
 * Itens da tierlist pessoal de um usuário, com dados do periférico para
 * exibição — leitura pública.
 *
 * Usa as mesmas colunas de setup/favoritos (`PERIPHERAL_SHOWCASE_COLUMNS`):
 * `tier`, `tags` e `specs` entram só para alimentar o hover reaproveitado da
 * tierlist oficial — `specs` bruto nunca sai daqui, `toShowcasePeripheral`
 * extrai apenas as notas públicas.
 */
export async function getUserTierlistItems(userId: string): Promise<TierlistItem[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_tierlist_items")
    .select(`peripheral_id, tier, position, peripherals ( ${PERIPHERAL_SHOWCASE_COLUMNS} )`)
    .eq("user_id", userId)
    .order("tier", { ascending: true })
    .order("position", { ascending: true })

  if (error) throw error

  type Row = {
    peripheral_id: string
    tier: TierlistTier
    position: number
    peripherals: PeripheralShowcaseRow | PeripheralShowcaseRow[] | null
  }

  return ((data as unknown as Row[]) ?? []).flatMap((row) => {
    const raw = Array.isArray(row.peripherals) ? (row.peripherals[0] ?? null) : row.peripherals
    if (!raw) return []

    const showcase = toShowcasePeripheral(raw)
    return [
      {
        peripheralId: row.peripheral_id,
        tier: row.tier,
        position: row.position,
        peripheral: {
          id: showcase.id,
          name: showcase.name,
          brandName: showcase.brand || null,
          category: showcase.category,
          imageUrl: showcase.image_url,
          siteTier: showcase.tier,
          tags: showcase.tags,
          ratings: showcase.ratings,
        },
      },
    ]
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

// Idem aos tipos de item: `TierlistMeta` e o limite do recado vivem no módulo
// puro para o editor (Client Component) poder importá-los.
export { TIERLIST_NOTE_MAX_LENGTH } from "@/lib/personal-tierlist"
export type { TierlistMeta } from "@/lib/personal-tierlist"

import type { TierlistMeta } from "@/lib/personal-tierlist"

/**
 * Meta pública da tierlist de um usuário.
 *
 * `hearts_count` é o contador desnormalizado mantido por trigger
 * (`sync_user_tierlist_hearts_count`) — nunca um `count(*)` por visita, já
 * que este bloco é renderizado em toda abertura de perfil.
 */
export async function getUserTierlistMeta(
  userId: string,
  viewerId?: string | null
): Promise<TierlistMeta> {
  const db = createSupabaseAdminClient()

  const [metaResult, heartResult] = await Promise.all([
    db.from("user_tierlist_meta").select("note, hearts_count").eq("user_id", userId).maybeSingle(),
    viewerId && viewerId !== userId
      ? db
          .from("user_tierlist_hearts")
          .select("user_id")
          .eq("owner_id", userId)
          .eq("user_id", viewerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (metaResult.error) throw metaResult.error

  return {
    note: metaResult.data?.note?.trim() || null,
    heartsCount: metaResult.data?.hearts_count ?? 0,
    viewerHearted: Boolean(heartResult.data),
  }
}

/** Grava (ou apaga, com `null`) o recado do dono — checagem de VIP fica na rota. */
export async function saveUserTierlistNote(userId: string, note: string | null): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_tierlist_meta")
    .upsert({ user_id: userId, note, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (error) throw error
}

/**
 * Dá ou tira o coração de um visitante na tierlist de `ownerId`.
 *
 * Devolve a contagem nova para o cliente reconciliar o estado otimista com o
 * número real (dois visitantes curtindo ao mesmo tempo, por exemplo).
 * O contador em si é escrito pela trigger, nunca daqui.
 */
export async function setTierlistHeart(
  ownerId: string,
  viewerId: string,
  hearted: boolean
): Promise<number> {
  if (ownerId === viewerId) throw new Error("Não é possível curtir a própria tierlist.")

  const db = createSupabaseAdminClient()

  if (hearted) {
    // `upsert` e não `insert`: um duplo-clique não pode virar erro 500 — a PK
    // (owner_id, user_id) já garante um coração por pessoa.
    const { error } = await db
      .from("user_tierlist_hearts")
      .upsert({ owner_id: ownerId, user_id: viewerId }, { onConflict: "owner_id,user_id", ignoreDuplicates: true })
    if (error) throw error
  } else {
    const { error } = await db
      .from("user_tierlist_hearts")
      .delete()
      .eq("owner_id", ownerId)
      .eq("user_id", viewerId)
    if (error) throw error
  }

  const { data, error } = await db
    .from("user_tierlist_meta")
    .select("hearts_count")
    .eq("user_id", ownerId)
    .maybeSingle()
  if (error) throw error

  return data?.hearts_count ?? 0
}

/**
 * O visitante já deu coração na tierlist de `ownerId`?
 *
 * Consulta separada de `getUserTierlistMeta` porque o perfil público é
 * `React.cache`ado por dono (compartilhado entre `generateMetadata` e a
 * página): o estado por visitante não pode entrar naquele cache, então vem
 * daqui — mesmo arranjo do `isFollowing`.
 */
export async function hasTierlistHeart(ownerId: string, viewerId: string): Promise<boolean> {
  if (ownerId === viewerId) return false

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_tierlist_hearts")
    .select("user_id")
    .eq("owner_id", ownerId)
    .eq("user_id", viewerId)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}
