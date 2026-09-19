import "server-only"

import { isVipActive, profileMediaProxyUrl } from "@/lib/account-tier"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { parseSlug } from "@/lib/format"
import { validateDisplayName } from "@/lib/profile-name"
import { isDisplayNameAvailable } from "@/lib/server/repositories/users-repository"
import type { ShippingAddressInput } from "@/lib/server/validation/shipping-address"

/**
 * Repositório da loja de itens cosméticos da Central de Aura (molduras de
 * avatar). Mesmo padrão de `aura-repository.ts`: toda a atomicidade do
 * resgate (checar item ativo, conceder posse, debitar a wallet) vive na
 * função Postgres `redeem_aura_item` (ver
 * 20260921000022_aura_store_items.sql); este repositório só chama a RPC e
 * lê as tabelas resultantes.
 */

export type AuraItemKind =
  | "avatar_frame"
  | "vip_month"
  | "display_name_change"
  | "streak_shield"
  | "mini_profile_bg"
  | "peripheral"

/**
 * Como o item é obtido — espelha `aura_items.acquisition` (migration
 * 20261116000000). Só `purchase` passa pela RPC de resgate; os demais são
 * concedidos pelo sistema (VIP, ranking) ou pelo admin. Ver
 * `lib/profile-frames.ts`.
 */
export type AuraItemAcquisition = "purchase" | "vip" | "rank" | "grant"

export type AuraItem = {
  id: string
  slug: string
  name: string
  description: string | null
  kind: AuraItemKind
  acquisition: AuraItemAcquisition
  imageUrl: string | null
  /** Asset sobreposto ao avatar (só molduras). `null` para kinds sem asset, ex. periférico. */
  frameAssetUrl: string | null
  auraCost: number
  active: boolean
  /** Unidades disponíveis — só relevante para `kind='peripheral'`. Outros kinds ignoram. */
  stock: number
}

export type AuraItemAdmin = AuraItem & { sortOrder: number }

const ADMIN_SELECT =
  "id, slug, name, description, kind, acquisition, image_url, frame_asset_url, aura_cost, active, sort_order, stock"

function toAuraItemAdmin(row: {
  id: string
  slug: string
  name: string
  description: string | null
  kind: string
  acquisition: string | null
  image_url: string | null
  frame_asset_url: string | null
  aura_cost: number
  active: boolean
  sort_order: number
  stock: number
}): AuraItemAdmin {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind: row.kind as AuraItemKind,
    acquisition: (row.acquisition ?? "purchase") as AuraItemAcquisition,
    imageUrl: row.image_url,
    frameAssetUrl: row.frame_asset_url,
    auraCost: row.aura_cost,
    active: row.active,
    sortOrder: row.sort_order,
    stock: row.stock,
  }
}

/** Catálogo ativo, ordenado para exibição na loja. */
export async function listActiveAuraItems(): Promise<AuraItem[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("aura_items")
    .select(
      "id, slug, name, description, kind, acquisition, image_url, frame_asset_url, aura_cost, active, stock"
    )
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
    acquisition: (row.acquisition ?? "purchase") as AuraItemAcquisition,
    imageUrl: row.image_url,
    frameAssetUrl: row.frame_asset_url,
    auraCost: row.aura_cost,
    active: row.active,
    stock: row.stock,
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

/**
 * Se o dono escolheu NÃO exibir moldura nenhuma.
 *
 * Distinto de "slot vazio": sem esta flag, `resolveProfileFrame` cai no
 * fallback de honraria (Fundador/VIP/Ofensiva) e desenha uma moldura em quem
 * pediu para não ter nenhuma.
 */
export async function getAvatarFrameOptOut(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("avatar_frame_opt_out")
    .eq("id", userId)
    .maybeSingle()
  return Boolean(data?.avatar_frame_opt_out)
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

/**
 * Fundo de Mini Perfil equipado, se houver — devolve o SLUG (a chave da arte
 * em `lib/mini-profile-backgrounds.ts`), não o id: quem desenha o cartão
 * precisa do tema, e o id do item não diz nada a ele.
 */
export async function getEquippedMiniProfileBg(
  userId: string
): Promise<{ itemId: string; slug: string } | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_profiles")
    .select(
      "equipped_mini_profile_bg_id, aura_items!user_profiles_equipped_mini_profile_bg_id_fkey ( slug )"
    )
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.error("[aura-store-repository] getEquippedMiniProfileBg:", error)
    return null
  }

  // `as unknown as`: o join embutido não é tipado (`Relationships` vazio em
  // `database.types.ts`), mesmo padrão de `getProfileShowcase`.
  const row = data as unknown as
    | { equipped_mini_profile_bg_id: string | null; aura_items: { slug: string } | { slug: string }[] | null }
    | null
  if (!row?.equipped_mini_profile_bg_id) return null

  const item = Array.isArray(row.aura_items) ? row.aura_items[0] : row.aura_items
  if (!item) return null

  return { itemId: row.equipped_mini_profile_bg_id, slug: item.slug }
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

// ── Periféricos (unidade única) ──

export type RedeemPeripheralErrorCode =
  | "not_found"
  | "already_claimed"
  | "not_verified"
  | "insufficient_balance"
  | "unknown"

export type RedeemPeripheralResult =
  | { ok: true; orderId: string | null }
  | { ok: false; error: string; code: RedeemPeripheralErrorCode; status: number }

/**
 * Resgata um produto (periférico) da loja de Aura. Diferente de
 * `redeemAuraItem`: a RPC `redeem_aura_peripheral` impõe estoque (esgota
 * globalmente quando os resgates atingem `aura_items.stock`), 1 por pessoa e
 * trust tier `verified`. Tem desconto VIP de 10%, igual ao resto da Central
 * (aplicado dentro da RPC). Retorna um código para o client distinguir
 * "esgotado" de "sem nível".
 *
 * Depois da RPC ter sucesso, cria um "pseudo-pedido" em `store_orders`
 * (`payment_method='aura'`, `aura_cost_paid` = Aura debitada, `total_cents=0`)
 * — é ele que entra na fila do admin e em "Meus Pedidos" para ser despachado.
 * O `shipping` é obrigatório aqui (produto físico, sem checkout depois); a
 * validação de formato fica na rota. Falha ao criar o pedido é logada mas não
 * desfaz o resgate: a posse já foi concedida na RPC e o admin consegue
 * reconstruir o pedido pelo extrato de `aura_purchases`.
 */
export async function redeemAuraPeripheral(
  userId: string,
  itemId: string,
  shipping: ShippingAddressInput
): Promise<RedeemPeripheralResult> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db.rpc("redeem_aura_peripheral", {
    p_user_id: userId,
    p_item_id: itemId,
  })

  if (error) {
    if (error.message?.includes("insufficient_aura_balance")) {
      return { ok: false, error: "Saldo de Aura insuficiente.", code: "insufficient_balance", status: 400 }
    }
    console.error("[aura-store-repository] redeemAuraPeripheral:", error)
    return { ok: false, error: "Erro ao resgatar o periférico.", code: "unknown", status: 400 }
  }

  switch (data) {
    case "ok": {
      const orderId = await createAuraPeripheralOrder(db, userId, itemId, shipping)
      return { ok: true, orderId }
    }
    case "already_claimed":
      return {
        ok: false,
        error: "Sem unidades disponíveis, ou você já resgatou este item.",
        code: "already_claimed",
        status: 409,
      }
    case "not_verified":
      return {
        ok: false,
        error:
          "Seu Trust Factor ainda não alcançou a faixa \"Muito Bom\", ou sua conta está em análise. Participe de forma legítima e mantenha a conta sem punições.",
        code: "not_verified",
        status: 403,
      }
    default:
      return {
        ok: false,
        error: "Periférico não encontrado ou indisponível.",
        code: "not_found",
        status: 404,
      }
  }
}

/**
 * Cria o `store_orders` do resgate — lê o recorte real da compra em
 * `aura_purchases` (gravado na mesma transação da RPC) para não recalcular o
 * desconto VIP aqui. Também guarda o endereço no perfil (`shipping_*`), igual
 * ao checkout, para pré-preencher a próxima entrega. Retorna o id do pedido
 * ou `null` se o INSERT falhar (resgate já concluído; só logamos).
 */
async function createAuraPeripheralOrder(
  db: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  itemId: string,
  shipping: ShippingAddressInput
): Promise<string | null> {
  const { data: purchase } = await db
    .from("aura_purchases")
    .select("item_name, item_slug, amount_paid, list_price")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: item } = await db
    .from("aura_items")
    .select("name, slug, image_url, aura_cost")
    .eq("id", itemId)
    .maybeSingle()

  const name = purchase?.item_name ?? item?.name ?? "Produto"
  const auraCostPaid = purchase?.amount_paid ?? item?.aura_cost ?? 0
  const nowIso = new Date().toISOString()

  const { data: order, error } = await db
    .from("store_orders")
    .insert({
      items: [
        {
          id: itemId,
          name,
          quantity: 1,
          price_cents: 0,
          image: item?.image_url ?? null,
          aura_cost: auraCostPaid,
        },
      ],
      total_cents: 0,
      aura_cost_paid: auraCostPaid,
      status: "paid",
      payment_method: "aura",
      is_sandbox: false,
      metadata: { user_id: userId, source: "aura_redeem", aura_item_id: itemId },
      shipping_recipient: shipping.shippingRecipient,
      shipping_phone: shipping.shippingPhone,
      shipping_postal_code: shipping.shippingPostalCode,
      shipping_street: shipping.shippingStreet,
      shipping_number: shipping.shippingNumber,
      shipping_complement: shipping.shippingComplement ?? null,
      shipping_neighborhood: shipping.shippingNeighborhood,
      shipping_city: shipping.shippingCity,
      shipping_state: shipping.shippingState,
      shipping_address_filled_at: nowIso,
      requires_shipping_address: true,
    })
    .select("id")
    .single()

  if (error || !order) {
    console.error("[aura-store-repository] createAuraPeripheralOrder:", error)
    return null
  }

  // Pré-preenche a próxima entrega. Falha aqui não importa — o snapshot que
  // vale para despachar já está no pedido acima.
  const { error: profileError } = await db
    .from("user_profiles")
    .update({
      shipping_recipient: shipping.shippingRecipient,
      shipping_phone: shipping.shippingPhone,
      shipping_postal_code: shipping.shippingPostalCode,
      shipping_street: shipping.shippingStreet,
      shipping_number: shipping.shippingNumber,
      shipping_complement: shipping.shippingComplement ?? null,
      shipping_neighborhood: shipping.shippingNeighborhood,
      shipping_city: shipping.shippingCity,
      shipping_state: shipping.shippingState,
    })
    .eq("id", userId)
  if (profileError) {
    console.error("[aura-store-repository] createAuraPeripheralOrder profile:", profileError)
  }

  return order.id
}

export type PeripheralOwner = {
  userId: string
  displayName: string
  displaySlug: string | null
  avatarUrl: string | null
}

/**
 * Quem já resgatou cada periférico — chave = `item_id`, valor = LISTA de donos
 * (o item agora tem estoque, então pode ter mais de um). Uma query em
 * `user_aura_items` (join com `aura_items` para filtrar `kind='peripheral'`)
 * + um `.in()` em lote em `user_profiles`, mesmo padrão de `listAuraPurchases`.
 * Periféricos sem nenhum resgate simplesmente não aparecem no Map.
 */
export async function getPeripheralOwners(): Promise<Map<string, PeripheralOwner[]>> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db
    .from("user_aura_items")
    .select("item_id, user_id, acquired_at, aura_items!inner ( kind )")
    .eq("aura_items.kind", "peripheral")
    .order("acquired_at", { ascending: true })

  if (error) {
    console.error("[aura-store-repository] getPeripheralOwners:", error)
    return new Map()
  }

  type Row = { item_id: string; user_id: string }
  const rows = (data ?? []) as unknown as Row[]
  if (rows.length === 0) return new Map()

  const buyerIds = [...new Set(rows.map((r) => r.user_id))]
  const buyerById = new Map<
    string,
    { display_name: string | null; display_slug: string | null; avatar_url: string | null }
  >()
  const { data: profiles } = await db
    .from("user_profiles")
    .select("id, display_name, display_slug, avatar_url")
    .in("id", buyerIds)
  for (const p of (profiles ?? []) as Array<{
    id: string
    display_name: string | null
    display_slug: string | null
    avatar_url: string | null
  }>) {
    buyerById.set(p.id, {
      display_name: p.display_name,
      display_slug: p.display_slug,
      // Nunca a coluna crua — ver `profileMediaProxyUrl` em `lib/account-tier.ts`.
      avatar_url: p.avatar_url ? profileMediaProxyUrl(p.id, "avatar") : null,
    })
  }

  const owners = new Map<string, PeripheralOwner[]>()
  for (const r of rows) {
    const b = buyerById.get(r.user_id)
    const owner: PeripheralOwner = {
      userId: r.user_id,
      displayName: b?.display_name?.trim() || `Membro ${r.user_id.slice(0, 6)}`,
      displaySlug: b?.display_slug ?? null,
      avatarUrl: b?.avatar_url ?? null,
    }
    const list = owners.get(r.item_id)
    if (list) list.push(owner)
    else owners.set(r.item_id, [owner])
  }
  return owners
}

export type EquipAvatarFrameResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

/** Equipa (ou remove, com `itemId: null`) uma moldura de avatar já possuída pelo usuário. */
export async function equipAvatarFrame(userId: string, itemId: string | null): Promise<EquipAvatarFrameResult> {
  const db = createSupabaseAdminClient()

  if (itemId) {
    // Checagem de KIND, igual à de `equipMiniProfileBg`. Sem ela, um POST com
    // o id de um item possuído de outro kind (um Fundo de Mini Perfil, um
    // escudo de ofensiva) gravava esse item no slot de MOLDURA: a pessoa
    // possui a linha, então a checagem de posse abaixo passava. O avatar não
    // chegava a desenhar nada (o slug não casa com arte nenhuma), mas o slot
    // ficava ocupado por lixo e o Fundo sumia do cartão.
    const { data: item } = await db
      .from("aura_items")
      .select("id, kind")
      .eq("id", itemId)
      .maybeSingle()

    if (!item || item.kind !== "avatar_frame") {
      return { ok: false, error: "Este item não é uma moldura de avatar.", status: 400 }
    }

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
    .update({
      equipped_avatar_frame_id: itemId,
      // Equipar é a escolha oposta de "nenhuma": limpa o opt-out junto, senão
      // a pessoa equiparia uma moldura e o avatar continuaria limpo. O trigger
      // `trg_clear_frame_opt_out` (migration 20261122000000) faz o mesmo no
      // banco, para os backfills; aqui é explícito para a intenção ficar legível.
      ...(itemId ? { avatar_frame_opt_out: false } : {}),
    })
    .eq("id", userId)

  if (error) {
    console.error("[aura-store-repository] equipAvatarFrame:", error)
    return { ok: false, error: "Erro ao equipar item.", status: 400 }
  }

  return { ok: true }
}

/**
 * Liga/desliga o "não quero moldura nenhuma".
 *
 * Existe porque `equipAvatarFrame(userId, null)` só esvazia o SLOT, e slot
 * vazio cai no fallback de honraria (`resolveProfileFrame`): quem é Fundador
 * clicava em "Nenhuma", a rota respondia ok e o avatar continuava com a
 * moldura no site inteiro. São duas decisões distintas — "qual eu exibo" e
 * "eu exibo alguma" —, então são duas colunas e duas chamadas.
 *
 * Ligar o opt-out também esvazia o slot: manter uma moldura equipada por trás
 * de "nenhuma" deixaria a tela mostrando duas escolhas contraditórias, e
 * desligar o opt-out ressuscitaria uma moldura que a pessoa já tinha tirado.
 */
export async function setAvatarFrameOptOut(
  userId: string,
  optOut: boolean
): Promise<EquipAvatarFrameResult> {
  const db = createSupabaseAdminClient()

  const { error } = await db
    .from("user_profiles")
    .update({
      avatar_frame_opt_out: optOut,
      ...(optOut ? { equipped_avatar_frame_id: null } : {}),
    })
    .eq("id", userId)

  if (error) {
    console.error("[aura-store-repository] setAvatarFrameOptOut:", error)
    return { ok: false, error: "Erro ao salvar a preferência.", status: 400 }
  }

  return { ok: true }
}

/**
 * Equipa (ou remove, com `itemId: null`) um Fundo de Mini Perfil já possuído.
 *
 * Slot independente do de moldura de avatar: equipar um fundo não mexe em
 * `equipped_avatar_frame_id`. A checagem de posse é a mesma de
 * `equipAvatarFrame`, mais uma checagem de `kind` — sem ela, um POST com o id
 * de uma moldura possuída gravaria uma moldura no slot de fundo.
 */
export async function equipMiniProfileBg(
  userId: string,
  itemId: string | null
): Promise<EquipAvatarFrameResult> {
  const db = createSupabaseAdminClient()

  if (itemId) {
    const { data: item } = await db
      .from("aura_items")
      .select("id, kind")
      .eq("id", itemId)
      .maybeSingle()

    if (!item || item.kind !== "mini_profile_bg") {
      return { ok: false, error: "Este item não é um Fundo de Mini Perfil.", status: 400 }
    }

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
    .update({ equipped_mini_profile_bg_id: itemId })
    .eq("id", userId)

  if (error) {
    console.error("[aura-store-repository] equipMiniProfileBg:", error)
    return { ok: false, error: "Erro ao equipar o fundo.", status: 400 }
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
  // `isVipActive` é o ponto único de verdade (espelho TS de `is_vip_active` no
  // SQL). Repetir a regra aqui à mão já esteve correto, mas duplicata de regra
  // de acesso é duplicata que diverge — e divergir aqui significa cobrar VIP
  // de quem já tem, ou liberar benefício a quem não tem.
  const active = isVipActive(data?.account_tier, expiresAt)
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

/**
 * Custo de tabela da troca de nome, lido do catálogo (`aura_items`, kind
 * `display_name_change`) — o mesmo número que a Central de Aura mostra no
 * card. Nunca hardcode esse valor no client: quem edita o preço é o admin.
 *
 * `null` quando o item está inativo/ausente — a troca fica indisponível, que
 * é exatamente o que a RPC responde nesse caso (`item_unavailable`).
 */
export async function getDisplayNameChangeCost(): Promise<number | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("aura_items")
    .select("aura_cost")
    .eq("kind", "display_name_change")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[aura-store-repository] getDisplayNameChangeCost:", error)
    return null
  }
  return data?.aura_cost ?? null
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
  /** `null` para kinds sem asset sobreposto (periférico). Molduras exigem valor — checado na rota. */
  frameAssetUrl: string | null
  auraCost: number
  sortOrder: number
  /** Unidades disponíveis (só `kind='peripheral'`). Default 1. */
  stock?: number
  /** Só a criação define o kind; a edição não o troca. Default `avatar_frame`. */
  kind?: AuraItemKind
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
      ...(input.stock !== undefined ? { stock: input.stock } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
    })
    .select(ADMIN_SELECT)
    .single()

  if (error || !data) {
    throw error ?? new Error("Erro ao criar o item de Aura.")
  }

  return toAuraItemAdmin(data)
}

export type AuraItemUpdateInput = Partial<AuraItemInput> & { active?: boolean }

export class AuraItemUpdateError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
    this.name = "AuraItemUpdateError"
  }
}

/** Kinds entre os quais o admin pode converter um item já existente. */
const CONVERTIBLE_KINDS: ReadonlySet<AuraItemKind> = new Set(["avatar_frame", "peripheral"])

export async function updateAuraItem(id: string, input: AuraItemUpdateInput): Promise<AuraItemAdmin | null> {
  const db = createSupabaseAdminClient()

  const update: Record<string, unknown> = {}
  if (input.name !== undefined) update.name = input.name
  if (input.description !== undefined) update.description = input.description
  if (input.imageUrl !== undefined) update.image_url = input.imageUrl
  if (input.frameAssetUrl !== undefined) update.frame_asset_url = input.frameAssetUrl
  if (input.auraCost !== undefined) update.aura_cost = input.auraCost
  if (input.sortOrder !== undefined) update.sort_order = input.sortOrder
  if (input.stock !== undefined) update.stock = input.stock
  if (input.active !== undefined) update.active = input.active

  // Conversão de kind (moldura ⇄ produto): só permitida se o kind atual E o
  // novo são conversíveis, e se ninguém resgatou/equipou o item ainda — trocar
  // depois disso deixaria posses órfãs numa mecânica que não as entende.
  if (input.kind !== undefined) {
    const { data: current } = await db
      .from("aura_items")
      .select("kind")
      .eq("id", id)
      .maybeSingle()
    if (!current) return null

    const from = current.kind as AuraItemKind
    if (from !== input.kind) {
      if (!CONVERTIBLE_KINDS.has(from) || !CONVERTIBLE_KINDS.has(input.kind)) {
        throw new AuraItemUpdateError(
          "Só é possível converter entre Moldura de avatar e Produto."
        )
      }

      const [{ count: owners }, { count: equipped }] = await Promise.all([
        db.from("user_aura_items").select("*", { count: "exact", head: true }).eq("item_id", id),
        db
          .from("user_profiles")
          .select("*", { count: "exact", head: true })
          .eq("equipped_avatar_frame_id", id),
      ])
      if ((owners ?? 0) > 0 || (equipped ?? 0) > 0) {
        throw new AuraItemUpdateError(
          "Não dá para mudar o tipo: alguém já resgatou ou equipou este item."
        )
      }

      update.kind = input.kind
      // Produto não tem asset sobreposto ao avatar; moldura precisa de um
      // (o admin reenvia no próximo save se converter de volta).
      if (input.kind === "peripheral") update.frame_asset_url = null
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from("aura_items") as any).update(update).eq("id", id).select(ADMIN_SELECT).maybeSingle()

  if (error) {
    console.error("[aura-store-repository] updateAuraItem:", error)
    throw error
  }
  if (!data) return null

  return toAuraItemAdmin(data)
}

/** Itens já resgatados não são afetados — `user_aura_items` referencia por FK com `on delete cascade`, então deletar o item some com a posse de quem já tinha. Mantido simples: sem soft-delete, mesmo padrão de `deleteEvent`. `aura_purchases.item_id` é `on delete set null` — o histórico de receita do item sobrevive via snapshot de nome/slug. */
export async function deleteAuraItem(id: string): Promise<void> {
  const db = createSupabaseAdminClient()
  await db.from("aura_items").delete().eq("id", id)
}

// ── Histórico de compras (admin) ──

export type AuraPurchaseItemSummary = {
  /** Quantidade de compras concluídas do item. */
  count: number
  /** Soma de `amount_paid` (Aura efetivamente gasta) no item. */
  auraTotal: number
}

/**
 * Resumo por item para os badges da tabela do admin: uma query agrupada,
 * não N. Chave = `item_id`; compras cujo item foi deletado (`item_id` null)
 * não entram em nenhuma linha da tabela, então são ignoradas aqui.
 */
export async function getAuraPurchaseSummaryByItem(): Promise<Record<string, AuraPurchaseItemSummary>> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("aura_purchases")
    .select("item_id, amount_paid")
    .not("item_id", "is", null)

  if (error) {
    console.error("[aura-store-repository] getAuraPurchaseSummaryByItem:", error)
    return {}
  }

  const map: Record<string, AuraPurchaseItemSummary> = {}
  for (const row of (data ?? []) as Array<{ item_id: string; amount_paid: number }>) {
    const entry = map[row.item_id] ?? { count: 0, auraTotal: 0 }
    entry.count += 1
    entry.auraTotal += row.amount_paid
    map[row.item_id] = entry
  }
  return map
}

export type AuraPurchaseRow = {
  id: string
  createdAt: string
  itemId: string | null
  itemName: string
  itemSlug: string
  itemKind: AuraItemKind
  listPrice: number
  amountPaid: number
  vipDiscountApplied: boolean
  balanceBefore: number | null
  balanceAfter: number | null
  buyer: {
    id: string
    displayName: string
    displaySlug: string | null
    avatarUrl: string | null
  }
}

export type AuraPurchaseTotals = {
  /** Aura arrecadada (soma de `amount_paid`) no recorte filtrado. */
  grossAura: number
  /** Número de compras no recorte. */
  purchases: number
  /** Compradores distintos no recorte. */
  uniqueBuyers: number
}

export type ListAuraPurchasesParams = {
  itemId?: string | null
  userId?: string | null
  kind?: AuraItemKind | null
  /** Cursor keyset: `<createdAtISO>|<id>` da última linha da página anterior. */
  cursor?: string | null
  limit?: number
}

export type ListAuraPurchasesResult = {
  rows: AuraPurchaseRow[]
  nextCursor: string | null
  totals: AuraPurchaseTotals
}

const PURCHASE_SELECT =
  "id, created_at, item_id, item_name, item_slug, item_kind, list_price, amount_paid, vip_discount_applied, balance_before, balance_after, user_id"

/**
 * Histórico paginado por keyset (`created_at desc, id desc`) — sem `offset`,
 * escala com a tabela crescendo. Filtros opcionais por item, comprador e
 * tipo. Os totais são calculados sobre o MESMO recorte (não só a página).
 * PII do comprador (nome/avatar) resolvida num único `.in()` em lote, mesmo
 * padrão de `listStoreAuditLog`.
 */
export async function listAuraPurchases(
  params: ListAuraPurchasesParams
): Promise<ListAuraPurchasesResult> {
  const db = createSupabaseAdminClient()
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 50)

  function applyFilters<T>(q: T): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = q as any
    if (params.itemId) query = query.eq("item_id", params.itemId)
    if (params.userId) query = query.eq("user_id", params.userId)
    if (params.kind) query = query.eq("item_kind", params.kind)
    return query as T
  }

  // ── Página ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pageQuery: any = applyFilters(db.from("aura_purchases").select(PURCHASE_SELECT))
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1)

  if (params.cursor) {
    const sep = params.cursor.lastIndexOf("|")
    if (sep > 0) {
      const cAt = params.cursor.slice(0, sep)
      const cId = params.cursor.slice(sep + 1)
      // (created_at, id) < (cursor) em ordem decrescente.
      pageQuery = pageQuery.or(
        `created_at.lt.${cAt},and(created_at.eq.${cAt},id.lt.${cId})`
      )
    }
  }

  const { data: pageData, error: pageError } = await pageQuery
  if (pageError) {
    console.error("[aura-store-repository] listAuraPurchases page:", pageError)
    return { rows: [], nextCursor: null, totals: { grossAura: 0, purchases: 0, uniqueBuyers: 0 } }
  }

  type Raw = {
    id: string
    created_at: string
    item_id: string | null
    item_name: string
    item_slug: string
    item_kind: string
    list_price: number
    amount_paid: number
    vip_discount_applied: boolean
    balance_before: number | null
    balance_after: number | null
    user_id: string
  }

  const raw = (pageData ?? []) as Raw[]
  const hasMore = raw.length > limit
  const pageRows = hasMore ? raw.slice(0, limit) : raw
  const last = pageRows[pageRows.length - 1]
  // Normaliza o timestamp para a forma "…Z" (sem "+00:00") — o "+" no filtro
  // `.or()` do PostgREST seria interpretado como espaço.
  const nextCursor =
    hasMore && last ? `${new Date(last.created_at).toISOString()}|${last.id}` : null

  // ── Nomes dos compradores (lote) ──
  const buyerIds = [...new Set(pageRows.map((r) => r.user_id))]
  const buyerById = new Map<string, { display_name: string | null; display_slug: string | null; avatar_url: string | null }>()
  if (buyerIds.length > 0) {
    const { data: profiles } = await db
      .from("user_profiles")
      .select("id, display_name, display_slug, avatar_url")
      .in("id", buyerIds)
    for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null; display_slug: string | null; avatar_url: string | null }>) {
      // Nunca a coluna crua — ver `profileMediaProxyUrl` em `lib/account-tier.ts`.
      buyerById.set(p.id, {
        display_name: p.display_name,
        display_slug: p.display_slug,
        avatar_url: p.avatar_url ? profileMediaProxyUrl(p.id, "avatar") : null,
      })
    }
  }

  const rows: AuraPurchaseRow[] = pageRows.map((r) => {
    const b = buyerById.get(r.user_id)
    return {
      id: r.id,
      createdAt: r.created_at,
      itemId: r.item_id,
      itemName: r.item_name,
      itemSlug: r.item_slug,
      itemKind: r.item_kind as AuraItemKind,
      listPrice: r.list_price,
      amountPaid: r.amount_paid,
      vipDiscountApplied: r.vip_discount_applied,
      balanceBefore: r.balance_before,
      balanceAfter: r.balance_after,
      buyer: {
        id: r.user_id,
        displayName: b?.display_name?.trim() || `Membro ${r.user_id.slice(0, 6)}`,
        displaySlug: b?.display_slug ?? null,
        avatarUrl: b?.avatar_url ?? null,
      },
    }
  })

  // ── Totais do recorte (não só da página) ──
  const { data: totalsData, error: totalsError } = await applyFilters(
    db.from("aura_purchases").select("amount_paid, user_id")
  )
  let totals: AuraPurchaseTotals = { grossAura: 0, purchases: 0, uniqueBuyers: 0 }
  if (totalsError) {
    console.error("[aura-store-repository] listAuraPurchases totals:", totalsError)
  } else {
    const seen = new Set<string>()
    let gross = 0
    for (const t of (totalsData ?? []) as Array<{ amount_paid: number; user_id: string }>) {
      gross += t.amount_paid
      seen.add(t.user_id)
    }
    totals = { grossAura: gross, purchases: (totalsData ?? []).length, uniqueBuyers: seen.size }
  }

  return { rows, nextCursor, totals }
}
