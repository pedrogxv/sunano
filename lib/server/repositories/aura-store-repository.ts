import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { parseSlug } from "@/lib/format"
import { validateDisplayName } from "@/lib/profile-name"
import { isDisplayNameAvailable } from "@/lib/server/repositories/users-repository"

/**
 * Repositório da loja de itens cosméticos da Central de Aura (molduras de
 * avatar). Mesmo padrão de `aura-repository.ts`: toda a atomicidade do
 * resgate (checar item ativo, conceder posse, debitar a wallet) vive na
 * função Postgres `redeem_aura_item` (ver
 * 20260921000022_aura_store_items.sql); este repositório só chama a RPC e
 * lê as tabelas resultantes.
 */

export type AuraItemKind = "avatar_frame" | "vip_month" | "display_name_change" | "streak_shield"

export type AuraItem = {
  id: string
  slug: string
  name: string
  description: string | null
  kind: AuraItemKind
  imageUrl: string | null
  frameAssetUrl: string
  auraCost: number
  active: boolean
}

export type AuraItemAdmin = AuraItem & { sortOrder: number }

const ADMIN_SELECT = "id, slug, name, description, kind, image_url, frame_asset_url, aura_cost, active, sort_order"

function toAuraItemAdmin(row: {
  id: string
  slug: string
  name: string
  description: string | null
  kind: string
  image_url: string | null
  frame_asset_url: string
  aura_cost: number
  active: boolean
  sort_order: number
}): AuraItemAdmin {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind: row.kind as AuraItemKind,
    imageUrl: row.image_url,
    frameAssetUrl: row.frame_asset_url,
    auraCost: row.aura_cost,
    active: row.active,
    sortOrder: row.sort_order,
  }
}

/** Catálogo ativo, ordenado para exibição na loja. */
export async function listActiveAuraItems(): Promise<AuraItem[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("aura_items")
    .select("id, slug, name, description, kind, image_url, frame_asset_url, aura_cost, active")
    .eq("active", true)
    .order("sort_order", { ascending: true })

  if (error) {
    console.error("[aura-store-repository] listActiveAuraItems:", error)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind: row.kind as AuraItemKind,
    imageUrl: row.image_url,
    frameAssetUrl: row.frame_asset_url,
    auraCost: row.aura_cost,
    active: row.active,
  }))
}

/** Ids dos itens que um usuário já possui. */
export async function getUserAuraItemIds(userId: string): Promise<Set<string>> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("user_aura_items").select("item_id").eq("user_id", userId)

  if (error) {
    console.error("[aura-store-repository] getUserAuraItemIds:", error)
    return new Set()
  }

  return new Set((data ?? []).map((row) => row.item_id))
}

/** Item atualmente equipado como moldura de avatar, se houver. */
export async function getEquippedAvatarFrameId(userId: string): Promise<string | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("equipped_avatar_frame_id")
    .eq("id", userId)
    .maybeSingle()
  return data?.equipped_avatar_frame_id ?? null
}

export type RedeemAuraItemErrorCode = "not_found" | "insufficient_balance" | "unauthenticated" | "unknown"

export type RedeemAuraItemResult =
  | { ok: true }
  | { ok: false; error: string; code: RedeemAuraItemErrorCode; status: number }

/** Resgata um item da loja, debitando o custo da wallet do usuário. */
export async function redeemAuraItem(userId: string, itemId: string): Promise<RedeemAuraItemResult> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db.rpc("redeem_aura_item", {
    p_user_id: userId,
    p_item_id: itemId,
  })

  if (error) {
    if (error.message?.includes("insufficient_aura_balance")) {
      return { ok: false, error: "Saldo de Aura insuficiente.", code: "insufficient_balance", status: 400 }
    }
    console.error("[aura-store-repository] redeemAuraItem:", error)
    return { ok: false, error: "Erro ao resgatar item.", code: "unknown", status: 400 }
  }

  if (!data) {
    return { ok: false, error: "Item não encontrado ou indisponível.", code: "not_found", status: 404 }
  }

  return { ok: true }
}

export type EquipAvatarFrameResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

/** Equipa (ou remove, com `itemId: null`) uma moldura de avatar já possuída pelo usuário. */
export async function equipAvatarFrame(userId: string, itemId: string | null): Promise<EquipAvatarFrameResult> {
  const db = createSupabaseAdminClient()

  if (itemId) {
    const { data: owned } = await db
      .from("user_aura_items")
      .select("item_id")
      .eq("user_id", userId)
      .eq("item_id", itemId)
      .maybeSingle()

    if (!owned) {
      return { ok: false, error: "Você ainda não possui este item.", status: 403 }
    }
  }

  const { error } = await db
    .from("user_profiles")
    .update({ equipped_avatar_frame_id: itemId })
    .eq("id", userId)

  if (error) {
    console.error("[aura-store-repository] equipAvatarFrame:", error)
    return { ok: false, error: "Erro ao equipar item.", status: 400 }
  }

  return { ok: true }
}

// ── VIP com Aura ──

export type PurchaseVipErrorCode =
  | "item_unavailable"
  | "vip_already_active"
  | "insufficient_balance"
  | "unknown"

export type PurchaseVipResult =
  | { ok: true; expiresAt: string | null }
  | { ok: false; error: string; code: PurchaseVipErrorCode; status: number }

export type VipStatus = {
  active: boolean
  expiresAt: string | null
}

/** VIP "ativo agora" = account_tier='vip' e (sem expiração ou ainda não expirou). */
export async function getVipStatus(userId: string): Promise<VipStatus> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("account_tier, vip_expires_at")
    .eq("id", userId)
    .maybeSingle()

  const expiresAt = data?.vip_expires_at ?? null
  const active = data?.account_tier === "vip" && (expiresAt === null || new Date(expiresAt) > new Date())
  return { active, expiresAt }
}

/** Compra 1 mês de VIP com Aura — só permitido se o VIP não estiver ativo agora (checado atomicamente na RPC). */
export async function purchaseVipWithAura(userId: string): Promise<PurchaseVipResult> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db.rpc("purchase_vip_with_aura", { p_user_id: userId })

  if (error) {
    if (error.message?.includes("vip_already_active")) {
      return { ok: false, error: "Você já é VIP.", code: "vip_already_active", status: 400 }
    }
    if (error.message?.includes("insufficient_aura_balance")) {
      return { ok: false, error: "Saldo de Aura insuficiente.", code: "insufficient_balance", status: 400 }
    }
    console.error("[aura-store-repository] purchaseVipWithAura:", error)
    return { ok: false, error: "Erro ao comprar VIP.", code: "unknown", status: 400 }
  }

  if (!data) {
    return { ok: false, error: "Item indisponível no momento.", code: "item_unavailable", status: 404 }
  }

  const { expiresAt } = await getVipStatus(userId)
  return { ok: true, expiresAt }
}

// ── Troca de nome com Aura ──

const DISPLAY_NAME_COOLDOWN_DAYS = 3

export type DisplayNameCooldown = {
  onCooldown: boolean
  changedAt: string | null
  endsAt: string | null
}

/** Estado do cooldown de troca de nome — calculado na leitura a partir do timestamp, mesmo padrão de `isStreakActive`. */
export async function getDisplayNameCooldown(userId: string): Promise<DisplayNameCooldown> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("display_name_changed_at")
    .eq("id", userId)
    .maybeSingle()

  const changedAt = data?.display_name_changed_at ?? null
  if (!changedAt) return { onCooldown: false, changedAt: null, endsAt: null }

  const endsAt = new Date(new Date(changedAt).getTime() + DISPLAY_NAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
  const onCooldown = endsAt > new Date()
  return { onCooldown, changedAt, endsAt: onCooldown ? endsAt.toISOString() : null }
}

export type ChangeDisplayNameErrorCode =
  | "invalid_name"
  | "name_taken"
  | "cooldown_active"
  | "item_unavailable"
  | "insufficient_balance"
  | "unknown"

export type ChangeDisplayNameResult =
  | { ok: true; displayName: string; displaySlug: string }
  | { ok: false; error: string; code: ChangeDisplayNameErrorCode; status: number; cooldownEndsAt?: string | null }

/**
 * Troca o nome de exibição pagando com Aura. Formato/reservado/conteúdo e
 * disponibilidade são checados aqui em TypeScript ANTES de chamar a RPC —
 * mesmo padrão que o POST /api/profile já seguia; a RPC garante só a parte
 * atômica: cooldown + débito + gravação (a unicidade real fica com o índice
 * único do banco, reforçado pelo trigger que recalcula display_slug).
 */
export async function changeDisplayNameWithAura(
  userId: string,
  newName: string
): Promise<ChangeDisplayNameResult> {
  const trimmed = newName.trim()
  const invalid = validateDisplayName(trimmed)
  if (invalid) {
    return { ok: false, error: invalid, code: "invalid_name", status: 400 }
  }

  const available = await isDisplayNameAvailable(trimmed, userId)
  if (!available) {
    return { ok: false, error: "Esse nome já está em uso. Escolha outro.", code: "name_taken", status: 409 }
  }

  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("change_display_name_with_aura", {
    p_user_id: userId,
    p_new_name: trimmed,
  })

  if (error) {
    if (error.message?.includes("name_change_on_cooldown")) {
      const { endsAt } = await getDisplayNameCooldown(userId)
      return {
        ok: false,
        error: "Você já trocou de nome recentemente. Aguarde o cooldown terminar.",
        code: "cooldown_active",
        status: 429,
        cooldownEndsAt: endsAt,
      }
    }
    if (error.message?.includes("insufficient_aura_balance")) {
      return { ok: false, error: "Saldo de Aura insuficiente.", code: "insufficient_balance", status: 400 }
    }
    // Corrida rara não pega pela checagem otimista acima: índice único do banco.
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "Esse nome já está em uso. Escolha outro.", code: "name_taken", status: 409 }
    }
    console.error("[aura-store-repository] changeDisplayNameWithAura:", error)
    return { ok: false, error: "Erro ao trocar de nome.", code: "unknown", status: 400 }
  }

  if (!data) {
    return { ok: false, error: "Item indisponível no momento.", code: "item_unavailable", status: 404 }
  }

  const { data: profile } = await db
    .from("user_profiles")
    .select("display_name, display_slug")
    .eq("id", userId)
    .maybeSingle()

  return {
    ok: true,
    displayName: profile?.display_name ?? trimmed,
    displaySlug: profile?.display_slug ?? "",
  }
}

// ── Proteção de Ofensiva (escudo de streak) com Aura ──

/** Slugs das duas variantes do escudo — a fonte de verdade do preço é o banco. */
export const STREAK_SHIELD_SLUGS = {
  "1d": "protecao-ofensiva-1d",
  "3d": "protecao-ofensiva-3d",
} as const

export type StreakShieldVariant = keyof typeof STREAK_SHIELD_SLUGS

export type StreakShieldStatus = {
  /**
   * Há um escudo guardado (comprado, ainda não consumido). Sem prazo — só
   * some quando `complete_daily_mission` o gasta cobrindo um buraco.
   */
  armed: boolean
  /** Margem de atraso do escudo guardado (1 ou 3), ou null se não há. */
  graceDays: number | null
}

/** Escudo guardado do usuário, se houver — `consumed_at is null`. */
export async function getStreakShieldStatus(userId: string): Promise<StreakShieldStatus> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_streak_shields")
    .select("grace_days, consumed_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (!data || data.consumed_at !== null) return { armed: false, graceDays: null }

  return { armed: true, graceDays: data.grace_days }
}

export type PurchaseStreakShieldErrorCode =
  | "item_unavailable"
  | "shield_already_armed"
  | "insufficient_balance"
  | "unknown"

export type PurchaseStreakShieldResult =
  | { ok: true; graceDays: number }
  | { ok: false; error: string; code: PurchaseStreakShieldErrorCode; status: number }

/**
 * Compra uma variante do escudo. `variant` (não um id/preço vindo do
 * client) resolve para o slug do catálogo — o id e o custo são sempre lidos
 * do banco. A RPC `purchase_streak_shield` garante a atomicidade: item
 * ativo + 1 guardado por vez (`shield_already_armed`) + débito + gravação.
 * A compra só ARMA o escudo; a proteção é resolvida depois, quando
 * `complete_daily_mission` detecta um buraco.
 */
export async function purchaseStreakShield(
  userId: string,
  variant: StreakShieldVariant
): Promise<PurchaseStreakShieldResult> {
  const db = createSupabaseAdminClient()

  const slug = STREAK_SHIELD_SLUGS[variant]
  const { data: item } = await db
    .from("aura_items")
    .select("id, active, kind")
    .eq("slug", slug)
    .maybeSingle()

  if (!item || !item.active || item.kind !== "streak_shield") {
    return { ok: false, error: "Item indisponível no momento.", code: "item_unavailable", status: 404 }
  }

  const { data, error } = await db.rpc("purchase_streak_shield", {
    p_user_id: userId,
    p_item_id: item.id,
  })

  if (error) {
    if (error.message?.includes("shield_already_armed")) {
      return {
        ok: false,
        error: "Você já tem uma Proteção de Ofensiva guardada.",
        code: "shield_already_armed",
        status: 409,
      }
    }
    if (error.message?.includes("insufficient_aura_balance")) {
      return { ok: false, error: "Saldo de Aura insuficiente.", code: "insufficient_balance", status: 400 }
    }
    if (error.message?.includes("item_unavailable")) {
      return { ok: false, error: "Item indisponível no momento.", code: "item_unavailable", status: 404 }
    }
    console.error("[aura-store-repository] purchaseStreakShield:", error)
    return { ok: false, error: "Erro ao comprar a proteção.", code: "unknown", status: 400 }
  }

  if (data === null || data === undefined) {
    return { ok: false, error: "Item indisponível no momento.", code: "item_unavailable", status: 404 }
  }

  return { ok: true, graceDays: data as unknown as number }
}

// ── Admin CRUD ──

/** Todos os itens (ativos e inativos), para a tabela do admin. */
export async function listAuraItemsForAdmin(): Promise<AuraItemAdmin[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("aura_items").select(ADMIN_SELECT).order("sort_order", { ascending: true })

  if (error) {
    console.error("[aura-store-repository] listAuraItemsForAdmin:", error)
    return []
  }

  return (data ?? []).map(toAuraItemAdmin)
}

export async function getAuraItemForAdmin(id: string): Promise<AuraItemAdmin | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("aura_items").select(ADMIN_SELECT).eq("id", id).maybeSingle()

  if (error || !data) {
    if (error) console.error("[aura-store-repository] getAuraItemForAdmin:", error)
    return null
  }

  return toAuraItemAdmin(data)
}

async function uniqueAuraItemSlug(base: string): Promise<string> {
  const db = createSupabaseAdminClient()
  let slug = parseSlug(base)
  const { data: existing } = await db.from("aura_items").select("slug").like("slug", `${slug}%`)
  if (existing && existing.length > 0) {
    slug = `${slug}-${Date.now()}`
  }
  return slug
}

export type AuraItemInput = {
  name: string
  description: string | null
  imageUrl: string | null
  frameAssetUrl: string
  auraCost: number
  sortOrder: number
}

export async function createAuraItem(input: AuraItemInput): Promise<AuraItemAdmin> {
  const db = createSupabaseAdminClient()
  const slug = await uniqueAuraItemSlug(input.name)

  const { data, error } = await db
    .from("aura_items")
    .insert({
      slug,
      name: input.name,
      description: input.description,
      image_url: input.imageUrl,
      frame_asset_url: input.frameAssetUrl,
      aura_cost: input.auraCost,
      sort_order: input.sortOrder,
    })
    .select(ADMIN_SELECT)
    .single()

  if (error || !data) {
    throw error ?? new Error("Erro ao criar o item de Aura.")
  }

  return toAuraItemAdmin(data)
}

export type AuraItemUpdateInput = Partial<AuraItemInput> & { active?: boolean }

export async function updateAuraItem(id: string, input: AuraItemUpdateInput): Promise<AuraItemAdmin | null> {
  const db = createSupabaseAdminClient()

  const update: Record<string, unknown> = {}
  if (input.name !== undefined) update.name = input.name
  if (input.description !== undefined) update.description = input.description
  if (input.imageUrl !== undefined) update.image_url = input.imageUrl
  if (input.frameAssetUrl !== undefined) update.frame_asset_url = input.frameAssetUrl
  if (input.auraCost !== undefined) update.aura_cost = input.auraCost
  if (input.sortOrder !== undefined) update.sort_order = input.sortOrder
  if (input.active !== undefined) update.active = input.active

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from("aura_items") as any).update(update).eq("id", id).select(ADMIN_SELECT).maybeSingle()

  if (error) {
    console.error("[aura-store-repository] updateAuraItem:", error)
    throw error
  }
  if (!data) return null

  return toAuraItemAdmin(data)
}

/** Itens já resgatados não são afetados — `user_aura_items` referencia por FK com `on delete cascade`, então deletar o item some com a posse de quem já tinha. Mantido simples: sem soft-delete, mesmo padrão de `deleteEvent`. */
export async function deleteAuraItem(id: string): Promise<void> {
  const db = createSupabaseAdminClient()
  await db.from("aura_items").delete().eq("id", id)
}
