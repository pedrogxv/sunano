import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { countFollowers } from "@/lib/server/repositories/users-repository"
import {
  coerceAccountTier,
  selectVisibleFavorites,
  selectVisibleMedals,
  type AccountTier,
} from "@/lib/account-tier"
import {
  SETUP_SLOTS as SLOTS,
  type ProfileShowcase,
  type SetupItem,
  type SetupSlot,
  type ShowcaseMedal,
  type ShowcasePeripheral,
} from "@/lib/profile-showcase"

/**
 * Repositório do Perfil Público (vitrine) — banner, bio, setup, medalhas e
 * periféricos favoritos exibidos em `/perfil/[id]`.
 *
 * Só expõe colunas públicas de `user_profiles`: CPF, telefone e endereço
 * (adicionados por `supabase/user_purchase_profile.sql`) nunca saem daqui.
 */

// Os tipos vivem em `lib/profile-showcase.ts` (módulo puro) para que
// Client Components possam importá-los sem tocar em `lib/server/**`.
export {
  SETUP_SLOTS,
  type SetupSlot,
  type ShowcasePeripheral,
  type SetupItem,
  type ShowcaseMedal,
  type ProfileShowcase,
} from "@/lib/profile-showcase"

const PUBLIC_PROFILE_COLUMNS =
  "id, display_name, display_slug, avatar_url, banner_url, mini_banner_url, bio, account_tier, created_at"

const PERIPHERAL_COLUMNS = "id, name, brand, category, image_url, tier"

type PeripheralRow = ShowcasePeripheral

function defaultNameFrom(id: string) {
  return `Membro ${id.slice(0, 6)}`
}

/**
 * Monta o perfil público completo de um usuário.
 * Retorna `null` quando o perfil não existe.
 */
export async function getProfileShowcase(userId: string): Promise<ProfileShowcase | null> {
  const db = createSupabaseAdminClient()

  const { data: profile, error } = await db
    .from("user_profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.error("[profile-showcase-repository] getProfileShowcase:", error)
    return null
  }
  if (!profile) return null

  const row = profile as unknown as {
    id: string
    display_name: string | null
    display_slug: string | null
    avatar_url: string | null
    banner_url: string | null
    mini_banner_url: string | null
    bio: string | null
    account_tier: string | null
    created_at: string
  }

  const tier = coerceAccountTier(row.account_tier)

  const [setup, medals, favorites, followers] = await Promise.all([
    getUserSetup(userId),
    getUserMedals(userId),
    getUserFavorites(userId),
    countFollowers(userId),
  ])

  return {
    id: row.id,
    display_name: row.display_name?.trim() || defaultNameFrom(row.id),
    display_slug: row.display_slug,
    avatar_url: row.avatar_url,
    banner_url: row.banner_url,
    mini_banner_url: row.mini_banner_url,
    bio: row.bio,
    account_tier: tier,
    member_since: row.created_at,
    followers,
    setup,
    medals: selectVisibleMedals(medals, tier),
    medals_total: medals.length,
    favorites: selectVisibleFavorites(favorites, tier).map((f) => f.peripheral),
    favorites_total: favorites.length,
  }
}

/** Setup do usuário, sempre com os 5 slots (vazios inclusive). */
export async function getUserSetup(userId: string): Promise<SetupItem[]> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db
    .from("user_setup_items")
    .select(`slot, peripherals ( ${PERIPHERAL_COLUMNS} )`)
    .eq("user_id", userId)

  if (error) {
    console.error("[profile-showcase-repository] getUserSetup:", error)
    return SLOTS.map((slot) => ({ slot, peripheral: null }))
  }

  const rows = (data ?? []) as unknown as Array<{
    slot: SetupSlot
    peripherals: PeripheralRow | PeripheralRow[] | null
  }>

  const bySlot = new Map<SetupSlot, SetupItem>()
  for (const r of rows) {
    // O join do PostgREST devolve objeto ou array conforme a cardinalidade.
    const peripheral = Array.isArray(r.peripherals) ? (r.peripherals[0] ?? null) : r.peripherals
    bySlot.set(r.slot, { slot: r.slot, peripheral })
  }

  return SLOTS.map((slot) => bySlot.get(slot) ?? { slot, peripheral: null })
}

/** Todas as medalhas conquistadas (sem aplicar limite de tier). */
export async function getUserMedals(userId: string): Promise<ShowcaseMedal[]> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db
    .from("user_medals")
    .select("awarded_at, pinned, pinned_order, medals ( id, slug, name, description, icon_url, rarity )")
    .eq("user_id", userId)

  if (error) {
    console.error("[profile-showcase-repository] getUserMedals:", error)
    return []
  }

  type MedalRow = {
    id: string
    slug: string
    name: string
    description: string | null
    icon_url: string | null
    rarity: ShowcaseMedal["rarity"]
  }

  const rows = (data ?? []) as unknown as Array<{
    awarded_at: string
    pinned: boolean
    pinned_order: number | null
    medals: MedalRow | MedalRow[] | null
  }>

  return rows.flatMap((r) => {
    const medal = Array.isArray(r.medals) ? r.medals[0] : r.medals
    if (!medal) return []
    return [{
      ...medal,
      awarded_at: r.awarded_at,
      pinned: r.pinned,
      pinned_order: r.pinned_order,
    }]
  })
}

/** Favoritos do usuário (sem aplicar limite de tier). */
export async function getUserFavorites(
  userId: string
): Promise<Array<{ position: number; peripheral: ShowcasePeripheral }>> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db
    .from("user_favorite_peripherals")
    .select(`position, peripherals ( ${PERIPHERAL_COLUMNS} )`)
    .eq("user_id", userId)
    .order("position", { ascending: true })

  if (error) {
    console.error("[profile-showcase-repository] getUserFavorites:", error)
    return []
  }

  const rows = (data ?? []) as unknown as Array<{
    position: number
    peripherals: PeripheralRow | PeripheralRow[] | null
  }>

  return rows.flatMap((r) => {
    const peripheral = Array.isArray(r.peripherals) ? r.peripherals[0] : r.peripherals
    if (!peripheral) return []
    return [{ position: r.position, peripheral }]
  })
}

/** Tier de conta de um usuário (usado para validar uploads/edições). */
export async function getAccountTier(userId: string): Promise<AccountTier> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("account_tier")
    .eq("id", userId)
    .maybeSingle()
  return coerceAccountTier((data as { account_tier?: string } | null)?.account_tier)
}

/**
 * Define (ou limpa, com `null`) um slot do setup. Só periférico do catálogo:
 * o slot guarda uma referência a `peripherals`, nunca um texto do usuário.
 */
export async function setSetupItem(
  userId: string,
  slot: SetupSlot,
  peripheralId: string | null
): Promise<void> {
  const db = createSupabaseAdminClient()

  if (!peripheralId) {
    await db.from("user_setup_items").delete().eq("user_id", userId).eq("slot", slot)
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from("user_setup_items") as any).upsert(
    {
      user_id: userId,
      slot,
      peripheral_id: peripheralId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,slot" }
  )
}

/** IDs de todos os periféricos favoritados pelo usuário (sem aplicar limite de tier). */
export async function getFavoriteIds(userId: string): Promise<string[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_favorite_peripherals")
    .select("peripheral_id")
    .eq("user_id", userId)

  if (error) {
    console.error("[profile-showcase-repository] getFavoriteIds:", error)
    return []
  }
  return (data ?? []).map((r) => (r as { peripheral_id: string }).peripheral_id)
}

export type AddFavoriteResult = "liked" | "already_liked" | "limit_reached"

/**
 * Favorita um periférico ao final da lista (coração do card em
 * `/perifericos`), respeitando o limite do tier.
 *
 * A checagem do limite e o insert acontecem dentro da função
 * `add_favorite_peripheral` porque em duas queries separadas dois likes
 * simultâneos do mesmo usuário passariam ambos pela verificação e
 * estourariam o plano (ver `20260728_atomic_favorite_like.sql`). O limite
 * continua sendo decidido aqui em cima, em `lib/account-tier.ts`.
 */
export async function addFavorite(
  userId: string,
  peripheralId: string,
  limit: number
): Promise<AddFavoriteResult> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db.rpc("add_favorite_peripheral", {
    p_user_id: userId,
    p_peripheral_id: peripheralId,
    p_limit: limit,
  })

  if (error) {
    console.error("[profile-showcase-repository] addFavorite:", error)
    throw error
  }
  return data as AddFavoriteResult
}

/** Desfavorita um periférico do usuário. Idempotente. */
export async function removeFavorite(userId: string, peripheralId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  await db
    .from("user_favorite_peripherals")
    .delete()
    .eq("user_id", userId)
    .eq("peripheral_id", peripheralId)
}

/**
 * Substitui a lista de favoritos do usuário pela informada, na ordem dada.
 * O limite de tier é aplicado pelo chamador (rota `/api`).
 */
export async function replaceFavorites(userId: string, peripheralIds: string[]): Promise<void> {
  const db = createSupabaseAdminClient()
  await db.from("user_favorite_peripherals").delete().eq("user_id", userId)
  if (peripheralIds.length === 0) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from("user_favorite_peripherals") as any).insert(
    peripheralIds.map((peripheral_id, position) => ({ user_id: userId, peripheral_id, position }))
  )
}

/**
 * Define quais medalhas ficam fixadas no perfil, na ordem informada.
 * Medalhas não conquistadas são ignoradas (o update só atinge as do usuário).
 */
export async function setPinnedMedals(userId: string, medalIds: string[]): Promise<void> {
  const db = createSupabaseAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from("user_medals") as any)
    .update({ pinned: false, pinned_order: null })
    .eq("user_id", userId)

  for (const [index, medalId] of medalIds.entries()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("user_medals") as any)
      .update({ pinned: true, pinned_order: index })
      .eq("user_id", userId)
      .eq("medal_id", medalId)
  }
}
