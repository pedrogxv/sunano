import "server-only"

import {
  STREAK_FRAMES,
  VIP_FOUNDER_FRAME,
  profileFrameOf,
  type ProfileFrameIdentity,
} from "@/lib/profile-frames"
import { getUserStreakPairsByUser } from "@/lib/server/repositories/achievements-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Posse da Moldura de Fundador (`vip:founder`).
 *
 * MÓDULO PRÓPRIO, e não mais uma função em `aura-store-repository`, porque
 * quem mais precisa dela é `users-repository` — e esse já é importado por
 * `aura-store-repository` (`isDisplayNameAvailable`). Pendurar a consulta lá
 * e importá-la de volta fecharia um ciclo entre os dois repositórios.
 *
 * A posse é PERMANENTE: quem assinou o VIP dentro da janela de lançamento
 * mantém a moldura depois de cancelar (ver `lib/profile-frames.ts` e a
 * migration `20261118000000`). Por isso ela não se deriva de `account_tier` —
 * toda tela que desenha a moldura certa precisa deste dado.
 */

/**
 * Id do item `vip:founder` no catálogo, ou `null` se a migration ainda não
 * rodou.
 *
 * A Central de Aura precisa dele porque a moldura NÃO vem em
 * `listActiveAuraItems()`: a linha é `active = false` de propósito (não entra
 * na vitrine de compráveis). Sem o id, a tela não teria como saber se o
 * usuário a possui nem como equipá-la.
 */
export async function getVipFounderItemId(): Promise<string | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("aura_items")
    .select("id")
    .eq("slug", VIP_FOUNDER_FRAME.slug)
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Ids das molduras de Ofensiva no catálogo, por slug (`streak:10` → uuid).
 *
 * Mesmo papel de `getVipFounderItemId`: elas não vêm em
 * `listActiveAuraItems()` (linhas `active = false`, fora da vitrine de
 * compráveis), então a Central precisa do id para saber quais o usuário
 * possui e para equipá-las.
 *
 * Um mapa, e não quatro consultas: são quatro itens fixos, e buscar um a um
 * seria N+1 numa tela só.
 */
export async function getStreakFrameItemIds(): Promise<Record<string, string>> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("aura_items")
    .select("id, slug")
    .in("slug", STREAK_FRAMES.map((frame) => frame.slug))

  // Migration não aplicada: mapa vazio, a vitrine degrada para "não possui" e
  // nenhuma tela quebra — mesma postura do item de Fundador ausente.
  if (error) {
    console.error("[vip-founder-repository] getStreakFrameItemIds:", error)
    return {}
  }

  return Object.fromEntries((data ?? []).map((row) => [row.slug, row.id]))
}

/**
 * Quem, entre `userIds`, é fundador.
 *
 * Consulta em LOTE de propósito: as telas que desenham avatar quase sempre
 * desenham vários (fórum, ranking, comentários), e uma consulta por avatar
 * seria um N+1 em cima da listagem inteira. Quem tem um id só passa um array
 * de um elemento.
 *
 * Devolve um Set vazio no erro — perder a moldura degrada a tela em silêncio;
 * derrubar a listagem do fórum por causa dela, não.
 */
export async function getVipFounderOwners(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()

  const db = createSupabaseAdminClient()
  const { data: item } = await db
    .from("aura_items")
    .select("id")
    .eq("slug", VIP_FOUNDER_FRAME.slug)
    .maybeSingle()

  // Item ausente (migration não aplicada): ninguém é fundador, e nenhuma tela
  // quebra — mesma degradação suave de "item sem arte".
  if (!item) return new Set()

  const { data, error } = await db
    .from("user_aura_items")
    .select("user_id")
    .eq("item_id", item.id)
    .in("user_id", userIds)

  if (error) {
    console.error("[vip-founder-repository] getVipFounderOwners:", error)
    return new Set()
  }

  return new Set((data ?? []).map((row) => row.user_id))
}

/** Se UM usuário é fundador. */
export async function ownsVipFounderFrame(userId: string): Promise<boolean> {
  return (await getVipFounderOwners([userId])).has(userId)
}

/**
 * Resolvedor de moldura em LOTE, para as consultas que não conseguem trazer a
 * moldura por JOIN — tipicamente as que vêm de RPC (o card da comunidade na
 * tierlist), onde a linha devolvida não tem as colunas do perfil.
 *
 * Faz duas consultas para a página inteira e devolve uma FUNÇÃO que monta a
 * `ProfileFrameIdentity` de cada usuário. O formato de função existe para
 * impedir o erro que ele veio evitar: com um `Map` cru, cada chamador
 * remontaria o objeto à mão e voltaria a esquecer um campo.
 */
export async function getProfileFramesByUser(
  userIds: string[]
): Promise<(userId: string, accountTier: string | null, vipExpiresAt: string | null) => ProfileFrameIdentity> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) {
    return (_id, tier, expiresAt) =>
      profileFrameOf({ account_tier: tier, vip_expires_at: expiresAt })
  }

  const db = createSupabaseAdminClient()
  const [{ data, error }, founders, streaks] = await Promise.all([
    db
      .from("user_profiles")
      .select(
        "id, avatar_frame_opt_out," +
          " equipped_avatar_frame:aura_items!user_profiles_equipped_avatar_frame_id_fkey ( slug, frame_asset_url )"
      )
      .in("id", ids),
    getVipFounderOwners(ids),
    // O recorde de ofensiva também em lote: é o que decide a moldura de
    // marco (`STREAK_FRAMES`), e sem ele quem vem de RPC sairia sem ela.
    getUserStreakPairsByUser(ids),
  ])

  if (error) console.error("[vip-founder-repository] getProfileFramesByUser:", error)

  const equippedByUser = new Map<string, { slug: string; frame_asset_url: string | null }>()
  const optOutByUser = new Set<string>()
  for (const row of (data ?? []) as unknown as Array<{
    id: string
    avatar_frame_opt_out: boolean | null
    equipped_avatar_frame:
      | { slug: string; frame_asset_url: string | null }
      | { slug: string; frame_asset_url: string | null }[]
      | null
  }>) {
    const frame = Array.isArray(row.equipped_avatar_frame)
      ? row.equipped_avatar_frame[0]
      : row.equipped_avatar_frame
    if (frame) equippedByUser.set(row.id, frame)
    if (row.avatar_frame_opt_out) optOutByUser.add(row.id)
  }

  return (userId, accountTier, vipExpiresAt) => {
    const equipped = equippedByUser.get(userId)
    return profileFrameOf({
      equipped_avatar_frame_slug: equipped?.slug ?? null,
      equipped_avatar_frame_url: equipped?.frame_asset_url ?? null,
      account_tier: accountTier,
      vip_expires_at: vipExpiresAt,
      is_founder: founders.has(userId),
      longest_streak: streaks[userId]?.longest ?? 0,
      avatar_frame_opt_out: optOutByUser.has(userId),
    })
  }
}
