import "server-only"

import { coerceAccountTier } from "@/lib/account-tier"
import { calculateListingFee, isPriceChangeAllowed } from "@/lib/market-fees"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório do Mercado — única porta de acesso a `market_listings` e
 * `market_listing_price_changes`. Ownership é checado aqui contra o banco
 * (nunca confiando no `userId` que o cliente alega ter), mesmo padrão de
 * `forum-repository.ts` (`deleteOwnForumPost`/`setOwnForumPostHidden`).
 */

export type RepositoryResult = { ok: true } | { ok: false; error: string; status: number }

export type MarketListingStatus = "pending_review" | "active" | "rejected" | "sold" | "removed"
export type MarketFeeStatus = "waived" | "pending" | "paid"

export type MarketListingRow = {
  id: string
  seller_id: string
  title: string
  description: string | null
  price_cents: number
  initial_price_cents: number
  olx_url: string
  images: string[]
  status: MarketListingStatus
  fee_cents: number
  fee_status: MarketFeeStatus
  is_free_vip_slot: boolean
  stripe_session_id: string | null
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

const LISTING_COLUMNS =
  "id, seller_id, title, description, price_cents, initial_price_cents, olx_url, images, status, fee_cents, fee_status, is_free_vip_slot, stripe_session_id, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at"

/** Tier e status de ban do vendedor — usado para calcular a taxa e bloquear criação. */
export async function getSellerMarketStatus(userId: string) {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("account_tier, market_banned_at")
    .eq("id", userId)
    .maybeSingle()

  return {
    tier: coerceAccountTier(data?.account_tier),
    isBanned: Boolean(data?.market_banned_at),
  }
}

/** Anúncios ativos, visíveis a qualquer visitante. */
export async function listActiveMarketListings(): Promise<MarketListingRow[]> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("market_listings")
    .select(LISTING_COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: false })
  return (data ?? []) as MarketListingRow[]
}

/** Todos os anúncios do próprio vendedor, qualquer status. */
export async function listMyMarketListings(userId: string): Promise<MarketListingRow[]> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("market_listings")
    .select(LISTING_COLUMNS)
    .eq("seller_id", userId)
    .order("created_at", { ascending: false })
  return (data ?? []) as MarketListingRow[]
}

/** Detalhe público (só `active`) ou do próprio dono (qualquer status). */
export async function getMarketListingDetail(id: string, viewerId?: string): Promise<MarketListingRow | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("market_listings").select(LISTING_COLUMNS).eq("id", id).maybeSingle()
  if (!data) return null
  const listing = data as MarketListingRow
  if (listing.status !== "active" && listing.seller_id !== viewerId) return null
  return listing
}

/**
 * Cota a taxa de publicação antes de criar qualquer registro — a rota usa
 * isto para decidir se abre um checkout do Stripe antes de gravar o anúncio
 * (evitando um anúncio "pendente" sem `stripe_session_id` associada).
 */
export async function quoteMarketListingFee(sellerId: string, priceCents: number): Promise<
  | { ok: true; feeCents: number; isFreeVipSlot: boolean }
  | { ok: false; error: string; status: number }
> {
  const db = createSupabaseAdminClient()

  const { tier, isBanned } = await getSellerMarketStatus(sellerId)
  if (isBanned) {
    return { ok: false, error: "Sua conta está banida do Mercado.", status: 403 }
  }

  const { count } = await db
    .from("market_listings")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .eq("is_free_vip_slot", true)
    .in("status", ["pending_review", "active"])

  const { feeCents, isFreeVipSlot } = calculateListingFee(priceCents, {
    tier,
    occupiesFreeSlot: (count ?? 0) > 0,
  })

  return { ok: true, feeCents, isFreeVipSlot }
}

/**
 * Insere o anúncio como `pending_review`, com a taxa já cotada por
 * `quoteMarketListingFee`. Quando `feeCents` é zero, `fee_status` já nasce
 * `waived` e o anúncio entra direto na fila de moderação; caso contrário fica
 * `pending` até o webhook do Stripe confirmar o pagamento
 * (`markMarketFeePaid`) — só aí aparece para o admin revisar.
 */
export async function insertMarketListing(params: {
  sellerId: string
  title: string
  description: string | null
  priceCents: number
  olxUrl: string
  images: string[]
  feeCents: number
  isFreeVipSlot: boolean
  stripeSessionId: string | null
}): Promise<{ ok: true; listingId: string } | { ok: false; error: string; status: number }> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db
    .from("market_listings")
    .insert({
      seller_id: params.sellerId,
      title: params.title,
      description: params.description,
      price_cents: params.priceCents,
      initial_price_cents: params.priceCents,
      olx_url: params.olxUrl,
      images: params.images,
      fee_cents: params.feeCents,
      fee_status: params.isFreeVipSlot ? "waived" : "pending",
      is_free_vip_slot: params.isFreeVipSlot,
      stripe_session_id: params.stripeSessionId,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { ok: false, error: "Não foi possível criar o anúncio.", status: 400 }
  }

  return { ok: true, listingId: data.id }
}

/** Chamado pelo webhook do Stripe quando a taxa é paga — idempotente. */
export async function markMarketFeePaid(stripeSessionId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  await db
    .from("market_listings")
    .update({ fee_status: "paid" })
    .eq("stripe_session_id", stripeSessionId)
    .neq("fee_status", "paid")
}

/** Chamado pelo webhook quando a checkout session expira sem pagamento. */
export async function markMarketFeeExpired(stripeSessionId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  await db
    .from("market_listings")
    .update({ status: "removed" })
    .eq("stripe_session_id", stripeSessionId)
    .eq("fee_status", "pending")
}

/**
 * Edita o próprio anúncio. Preço só é aceito se for menor ou igual ao atual
 * — tentativa de aumento é rejeitada aqui, antes de gravar qualquer coisa,
 * com uma mensagem explícita sobre a regra e o risco de banimento.
 */
export async function updateOwnMarketListing(params: {
  id: string
  userId: string
  patch: {
    title?: string
    description?: string | null
    priceCents?: number
    olxUrl?: string
    images?: string[]
  }
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: listing } = await db
    .from("market_listings")
    .select("id, seller_id, price_cents, status")
    .eq("id", params.id)
    .maybeSingle()

  if (!listing) {
    return { ok: false, error: "Anúncio não encontrado.", status: 404 }
  }
  if (listing.seller_id !== params.userId) {
    return { ok: false, error: "Você só pode editar os seus próprios anúncios.", status: 403 }
  }
  if (listing.status === "sold" || listing.status === "removed") {
    return { ok: false, error: "Este anúncio não pode mais ser editado.", status: 400 }
  }

  const update: Partial<{
    title: string
    description: string | null
    olx_url: string
    images: string[]
    price_cents: number
  }> = {}
  if (params.patch.title !== undefined) update.title = params.patch.title
  if (params.patch.description !== undefined) update.description = params.patch.description
  if (params.patch.olxUrl !== undefined) update.olx_url = params.patch.olxUrl
  if (params.patch.images !== undefined) update.images = params.patch.images

  if (params.patch.priceCents !== undefined && params.patch.priceCents !== listing.price_cents) {
    if (!isPriceChangeAllowed(listing.price_cents, params.patch.priceCents)) {
      return {
        ok: false,
        error:
          "O preço de um anúncio publicado só pode ser reduzido, nunca aumentado. Tentativas de burlar essa regra podem resultar em banimento do Mercado.",
        status: 400,
      }
    }
    await db.from("market_listing_price_changes").insert({
      listing_id: listing.id,
      old_price_cents: listing.price_cents,
      new_price_cents: params.patch.priceCents,
    })
    update.price_cents = params.patch.priceCents
  }

  if (Object.keys(update).length === 0) {
    return { ok: true }
  }

  const { error } = await db.from("market_listings").update(update).eq("id", listing.id)
  if (error) {
    return { ok: false, error: "Não foi possível atualizar o anúncio.", status: 400 }
  }
  return { ok: true }
}

/** Marca o próprio anúncio como vendido — só a partir de `active`. */
export async function markOwnMarketListingSold(id: string, userId: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: listing } = await db
    .from("market_listings")
    .select("id, seller_id, status")
    .eq("id", id)
    .maybeSingle()

  if (!listing) {
    return { ok: false, error: "Anúncio não encontrado.", status: 404 }
  }
  if (listing.seller_id !== userId) {
    return { ok: false, error: "Você só pode alterar os seus próprios anúncios.", status: 403 }
  }
  if (listing.status !== "active") {
    return { ok: false, error: "Só é possível marcar como vendido um anúncio ativo.", status: 400 }
  }

  const { error } = await db.from("market_listings").update({ status: "sold" }).eq("id", id)
  if (error) {
    return { ok: false, error: "Não foi possível atualizar o anúncio.", status: 400 }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Admin (moderação)
// ---------------------------------------------------------------------------

export type ModerationListingRow = MarketListingRow & {
  seller_display_name: string | null
  seller_market_banned_at: string | null
}

/**
 * Fila de moderação. Anúncios com `fee_status = 'pending'` (taxa ainda não
 * confirmada pelo Stripe) nunca aparecem aqui — são só rascunhos.
 */
export async function listMarketListingsForModeration(
  status: MarketListingStatus = "pending_review"
): Promise<ModerationListingRow[]> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("market_listings")
    .select(LISTING_COLUMNS)
    .eq("status", status)
    .in("fee_status", ["waived", "paid"])
    .order("created_at", { ascending: false })

  const listings = (data ?? []) as MarketListingRow[]
  const sellerIds = [...new Set(listings.map((l) => l.seller_id))]
  if (sellerIds.length === 0) return []

  const { data: sellers } = await db
    .from("user_profiles")
    .select("id, display_name, market_banned_at")
    .in("id", sellerIds)

  const sellerMap = new Map((sellers ?? []).map((s) => [s.id, s]))

  return listings.map((listing) => ({
    ...listing,
    seller_display_name: sellerMap.get(listing.seller_id)?.display_name ?? null,
    seller_market_banned_at: sellerMap.get(listing.seller_id)?.market_banned_at ?? null,
  }))
}

export async function approveMarketListing(id: string, adminId: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("market_listings")
    .select("id")
    .eq("id", id)
    .eq("status", "pending_review")
    .maybeSingle()
  if (!existing) {
    return { ok: false, error: "Anúncio não encontrado ou já revisado.", status: 404 }
  }

  const { error } = await db
    .from("market_listings")
    .update({ status: "active", reviewed_by: adminId, reviewed_at: new Date().toISOString(), rejection_reason: null })
    .eq("id", id)

  if (error) {
    return { ok: false, error: "Não foi possível aprovar o anúncio.", status: 400 }
  }
  return { ok: true }
}

export async function rejectMarketListing(id: string, adminId: string, reason: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("market_listings")
    .select("id")
    .eq("id", id)
    .eq("status", "pending_review")
    .maybeSingle()
  if (!existing) {
    return { ok: false, error: "Anúncio não encontrado ou já revisado.", status: 404 }
  }

  const { error } = await db
    .from("market_listings")
    .update({ status: "rejected", reviewed_by: adminId, reviewed_at: new Date().toISOString(), rejection_reason: reason })
    .eq("id", id)

  if (error) {
    return { ok: false, error: "Não foi possível rejeitar o anúncio.", status: 400 }
  }
  return { ok: true }
}

/** Banimento restrito ao Mercado — `reason: null` desbane. */
export async function setMarketBan(userId: string, reason: string | null): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_profiles")
    .update({ market_banned_at: reason ? new Date().toISOString() : null, market_ban_reason: reason })
    .eq("id", userId)

  if (error) {
    return { ok: false, error: "Não foi possível atualizar o banimento.", status: 400 }
  }
  return { ok: true }
}
