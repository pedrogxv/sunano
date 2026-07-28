import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
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
  "id, display_name, avatar_url, banner_url, bio, account_tier, created_at"

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
    avatar_url: string | null
    banner_url: string | null
    bio: string | null
    account_tier: string | null
    created_at: string
  }

  const tier = coerceAccountTier(row.account_tier)

  const [setup, medals, favorites] = await Promise.all([
    getUserSetup(userId),
    getUserMedals(userId),
    getUserFavorites(userId),
  ])

  return {
    id: row.id,
    display_name: row.display_name?.trim() || defaultNameFrom(row.id),
    avatar_url: row.avatar_url,
    banner_url: row.banner_url,
    bio: row.bio,
    account_tier: tier,
    member_since: row.created_at,
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
    .select(`slot, custom_label, peripherals ( ${PERIPHERAL_COLUMNS} )`)
    .eq("user_id", userId)

  if (error) {
    console.error("[profile-showcase-repository] getUserSetup:", error)
    return SLOTS.map((slot) => ({ slot, peripheral: null, custom_label: null }))
  }

  const rows = (data ?? []) as unknown as Array<{
    slot: SetupSlot
    custom_label: string | null
    peripherals: PeripheralRow | PeripheralRow[] | null
  }>

  const bySlot = new Map<SetupSlot, SetupItem>()
  for (const r of rows) {
    // O join do PostgREST devolve objeto ou array conforme a cardinalidade.
    const peripheral = Array.isArray(r.peripherals) ? (r.peripherals[0] ?? null) : r.peripherals
    bySlot.set(r.slot, { slot: r.slot, peripheral, custom_label: r.custom_label })
  }

  return SLOTS.map((slot) => bySlot.get(slot) ?? { slot, peripheral: null, custom_label: null })
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

/** Define (ou limpa) um slot do setup. */
export async function setSetupItem(
  userId: string,
  slot: SetupSlot,
  value: { peripheralId?: string | null; customLabel?: string | null }
): Promise<void> {
  const db = createSupabaseAdminClient()
  const peripheralId = value.peripheralId ?? null
  const customLabel = value.customLabel?.trim() || null

  if (!peripheralId && !customLabel) {
    await db.from("user_setup_items").delete().eq("user_id", userId).eq("slot", slot)
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from("user_setup_items") as any).upsert(
    {
      user_id: userId,
      slot,
      peripheral_id: peripheralId,
      custom_label: customLabel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,slot" }
  )
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
