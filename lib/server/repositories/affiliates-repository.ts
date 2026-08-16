import "server-only"

import { randomBytes } from "crypto"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { clampPage, clampPageSize, rangeFor } from "@/lib/server/repositories/_shared"

/**
 * Repositório do sistema de afiliados — única porta de acesso a `affiliates`,
 * `affiliate_commission_events` (ledger, fonte de verdade do saldo) e
 * `affiliate_payout_requests`. `affiliates.balance_cents` é só um cache
 * somado pelas RPCs `apply_affiliate_commission_event`/`request_affiliate_payout`
 * — nunca é escrito diretamente por este arquivo.
 */

export type RepositoryResult = { ok: true } | { ok: false; error: string; status: number }

export type AffiliateStatus = "pending" | "approved" | "rejected" | "suspended"
export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random"
export type CommissionEventType = "credit" | "refund_debit" | "adjustment"
export type PayoutStatus = "requested" | "paid" | "rejected" | "cancelled"

export type AffiliateRow = {
  id: string
  user_id: string
  code: string | null
  status: AffiliateStatus
  commission_bps: number
  balance_cents: number
  pix_key: string | null
  pix_key_type: PixKeyType | null
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

const AFFILIATE_COLUMNS =
  "id, user_id, code, status, commission_bps, balance_cents, pix_key, pix_key_type, rejection_reason, reviewed_by, reviewed_at, approved_at, created_at, updated_at"

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sem 0/O/1/I — evita confusão na hora de digitar o código
const CODE_LENGTH = 8

function generateCandidateCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return code
}

export async function getAffiliateByUserId(userId: string): Promise<AffiliateRow | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("affiliates").select(AFFILIATE_COLUMNS).eq("user_id", userId).maybeSingle()
  if (error) {
    console.error("[affiliates-repository] getAffiliateByUserId:", error)
    return null
  }
  return data as AffiliateRow | null
}

/** Usado no checkout para resolver o cookie `sn_aff_ref` — só retorna afiliados aprovados. */
export async function getAffiliateByCode(code: string): Promise<AffiliateRow | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("affiliates")
    .select(AFFILIATE_COLUMNS)
    .eq("code", code)
    .eq("status", "approved")
    .maybeSingle()
  if (error) {
    console.error("[affiliates-repository] getAffiliateByCode:", error)
    return null
  }
  return data as AffiliateRow | null
}

/**
 * Cria (ou reenvia, se a solicitação anterior foi rejeitada) um pedido de
 * afiliação. `code` só é gerado na aprovação (ver `approveAffiliate`) — uma
 * solicitação pendente/rejeitada não tem código, evita poluir o namespace
 * único com códigos que nunca ficam ativos.
 */
export async function requestAffiliation(
  userId: string,
  params: { pixKey: string; pixKeyType: PixKeyType }
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("affiliates")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle()

  if (existing && existing.status !== "rejected") {
    return { ok: false, error: "Você já tem uma solicitação de afiliação em andamento ou ativa.", status: 409 }
  }

  if (existing) {
    // Reaproveita a linha de uma solicitação rejeitada — permite reenvio sem duplicar o cadastro (user_id é unique).
    const { error } = await db
      .from("affiliates")
      .update({
        status: "pending",
        pix_key: params.pixKey,
        pix_key_type: params.pixKeyType,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq("id", existing.id)
    if (error) {
      console.error("[affiliates-repository] requestAffiliation — reenvio:", error)
      return { ok: false, error: "Não foi possível enviar sua solicitação.", status: 500 }
    }
    return { ok: true }
  }

  const { error } = await db.from("affiliates").insert({
    user_id: userId,
    status: "pending",
    pix_key: params.pixKey,
    pix_key_type: params.pixKeyType,
  })
  if (error) {
    console.error("[affiliates-repository] requestAffiliation — insert:", error)
    return { ok: false, error: "Não foi possível enviar sua solicitação.", status: 500 }
  }
  return { ok: true }
}

export type AffiliateSummary = {
  balanceCents: number
  totalPaidCents: number
  totalRequestedPendingCents: number
  totalEarnedCents: number
}

/** Saldo + resumo do extrato — usado no dashboard do afiliado e na fila admin. */
export async function getAffiliateSummary(affiliateId: string): Promise<AffiliateSummary> {
  const db = createSupabaseAdminClient()

  const [{ data: affiliate }, { data: payouts }, { data: credits }] = await Promise.all([
    db.from("affiliates").select("balance_cents").eq("id", affiliateId).maybeSingle(),
    db.from("affiliate_payout_requests").select("amount_cents, status").eq("affiliate_id", affiliateId),
    db.from("affiliate_commission_events").select("amount_cents").eq("affiliate_id", affiliateId).eq("type", "credit"),
  ])

  const totalPaidCents = (payouts ?? [])
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount_cents, 0)
  const totalRequestedPendingCents = (payouts ?? [])
    .filter((p) => p.status === "requested")
    .reduce((sum, p) => sum + p.amount_cents, 0)
  const totalEarnedCents = (credits ?? []).reduce((sum, c) => sum + c.amount_cents, 0)

  return {
    balanceCents: affiliate?.balance_cents ?? 0,
    totalPaidCents,
    totalRequestedPendingCents,
    totalEarnedCents,
  }
}

export type CommissionEventRow = {
  id: string
  affiliate_id: string
  order_id: string
  type: CommissionEventType
  amount_cents: number
  order_total_cents: number
  commission_bps: number
  related_event_id: string | null
  note: string | null
  created_at: string
}

const COMMISSION_EVENT_COLUMNS =
  "id, affiliate_id, order_id, type, amount_cents, order_total_cents, commission_bps, related_event_id, note, created_at"

export async function listAffiliateCommissionEvents(
  affiliateId: string,
  page = 1,
  pageSize = 20
): Promise<{ events: CommissionEventRow[]; total: number; hasMore: boolean }> {
  const db = createSupabaseAdminClient()
  const currentPage = clampPage(page)
  const size = clampPageSize(pageSize, 50, 20)

  const { data, count, error } = await db
    .from("affiliate_commission_events")
    .select(COMMISSION_EVENT_COLUMNS, { count: "exact" })
    .eq("affiliate_id", affiliateId)
    .order("created_at", { ascending: false })
    .range(...rangeFor(currentPage, size))

  if (error) {
    console.error("[affiliates-repository] listAffiliateCommissionEvents:", error)
    return { events: [], total: 0, hasMore: false }
  }
  const total = count ?? 0
  return { events: (data ?? []) as CommissionEventRow[], total, hasMore: currentPage * size < total }
}

export type PayoutRequestRow = {
  id: string
  affiliate_id: string
  amount_cents: number
  status: PayoutStatus
  pix_key: string
  pix_key_type: PixKeyType
  admin_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

const PAYOUT_COLUMNS =
  "id, affiliate_id, amount_cents, status, pix_key, pix_key_type, admin_note, reviewed_by, reviewed_at, paid_at, created_at, updated_at"

/** Chama `request_affiliate_payout` — guarda de saldo disponível é atômica, resolvida dentro da RPC. */
export async function createPayoutRequest(
  affiliateId: string,
  amountCents: number,
  pixKey: string,
  pixKeyType: PixKeyType
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("request_affiliate_payout", {
    p_affiliate_id: affiliateId,
    p_amount_cents: amountCents,
    p_pix_key: pixKey,
    p_pix_key_type: pixKeyType,
  })

  if (error) {
    console.error("[affiliates-repository] createPayoutRequest:", error)
    return { ok: false, error: "Não foi possível solicitar o saque.", status: 500 }
  }
  if (!data) {
    return { ok: false, error: "Saldo disponível insuficiente para este valor de saque.", status: 400 }
  }
  return { ok: true }
}

export async function listOwnPayoutRequests(
  affiliateId: string,
  page = 1,
  pageSize = 20
): Promise<{ payouts: PayoutRequestRow[]; total: number; hasMore: boolean }> {
  const db = createSupabaseAdminClient()
  const currentPage = clampPage(page)
  const size = clampPageSize(pageSize, 50, 20)

  const { data, count, error } = await db
    .from("affiliate_payout_requests")
    .select(PAYOUT_COLUMNS, { count: "exact" })
    .eq("affiliate_id", affiliateId)
    .order("created_at", { ascending: false })
    .range(...rangeFor(currentPage, size))

  if (error) {
    console.error("[affiliates-repository] listOwnPayoutRequests:", error)
    return { payouts: [], total: 0, hasMore: false }
  }
  const total = count ?? 0
  return { payouts: (data ?? []) as PayoutRequestRow[], total, hasMore: currentPage * size < total }
}

/**
 * Chamada pelo webhook do Asaas quando o pedido é confirmado como pago —
 * idempotente (o índice único parcial em `affiliate_commission_events`
 * garante no máximo um crédito por pedido, mesmo com reentrega do webhook).
 * Fire-and-forget: erros são logados, nunca propagados pro caller (mesmo
 * estilo de `markMarketFeePaid`).
 */
export async function creditCommissionForOrder(orderId: string): Promise<void> {
  const db = createSupabaseAdminClient()

  const { data: order } = await db
    .from("store_orders")
    .select("id, affiliate_id, total_cents")
    .eq("id", orderId)
    .maybeSingle()

  if (!order?.affiliate_id) return

  const { data: affiliate } = await db
    .from("affiliates")
    .select("id, commission_bps, status")
    .eq("id", order.affiliate_id)
    .maybeSingle()

  if (!affiliate) return

  const commissionCents = Math.round((order.total_cents * affiliate.commission_bps) / 10000)
  if (commissionCents <= 0) return

  const { error } = await db.rpc("apply_affiliate_commission_event", {
    p_affiliate_id: affiliate.id,
    p_order_id: order.id,
    p_delta_cents: commissionCents,
    p_type: "credit",
    p_order_total_cents: order.total_cents,
    p_commission_bps: affiliate.commission_bps,
  })

  if (error) {
    console.error("[affiliates-repository] creditCommissionForOrder:", error)
  }
}

type OrderRefundContext = { id: string; affiliate_id: string | null; total_cents: number }

/**
 * Chamada por `refundOrder`/`syncOrderRefundState` depois que `refunded_cents`
 * já foi gravado com sucesso. Debita comissão proporcional ao INCREMENTO do
 * valor estornado (não ao total) — suporta estornos parciais sucessivos sem
 * debitar duas vezes o mesmo trecho, e é idempotente por natureza quando o
 * incremento é zero (reconciliação repetida sem mudança real de valor).
 */
export async function syncCommissionForRefund(
  order: OrderRefundContext,
  newRefundedCents: number,
  previousRefundedCents: number
): Promise<void> {
  if (!order.affiliate_id) return

  const delta = newRefundedCents - previousRefundedCents
  if (delta === 0) return

  const db = createSupabaseAdminClient()

  const [{ data: affiliate }, { data: creditEvent }] = await Promise.all([
    db.from("affiliates").select("id, commission_bps").eq("id", order.affiliate_id).maybeSingle(),
    db
      .from("affiliate_commission_events")
      .select("id")
      .eq("order_id", order.id)
      .eq("type", "credit")
      .maybeSingle(),
  ])

  // Sem crédito original (afiliado suspenso entre a venda e o estorno, por
  // exemplo): não há comissão a debitar/recreditar.
  if (!affiliate || !creditEvent) return

  const commissionDelta = Math.round((delta * affiliate.commission_bps) / 10000)
  if (commissionDelta === 0) return

  const { error } = await db.rpc("apply_affiliate_commission_event", {
    p_affiliate_id: affiliate.id,
    p_order_id: order.id,
    p_delta_cents: -commissionDelta,
    p_type: "refund_debit",
    p_order_total_cents: order.total_cents,
    p_commission_bps: affiliate.commission_bps,
    p_related_event_id: creditEvent.id,
  })

  if (error) {
    console.error("[affiliates-repository] syncCommissionForRefund:", error)
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listAffiliateApplications(
  status?: AffiliateStatus,
  page = 1,
  pageSize = 20
): Promise<{ affiliates: AffiliateRow[]; total: number }> {
  const db = createSupabaseAdminClient()
  const currentPage = clampPage(page)
  const size = clampPageSize(pageSize, 100, 20)

  let query = db
    .from("affiliates")
    .select(AFFILIATE_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(...rangeFor(currentPage, size))

  if (status) query = query.eq("status", status)

  const { data, count, error } = await query
  if (error) {
    console.error("[affiliates-repository] listAffiliateApplications:", error)
    return { affiliates: [], total: 0 }
  }
  return { affiliates: (data ?? []) as AffiliateRow[], total: count ?? 0 }
}

/** Gera o `code` definitivo só aqui — solicitações pendentes/rejeitadas nunca têm código ativo. */
export async function approveAffiliate(affiliateId: string, reviewerId: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db.from("affiliates").select("id, status").eq("id", affiliateId).maybeSingle()
  if (!existing) return { ok: false, error: "Afiliado não encontrado.", status: 404 }
  if (existing.status === "approved") return { ok: true }

  const now = new Date().toISOString()

  // Retry em colisão de código (unique constraint) — extremamente raro no
  // espaço de 32^8, mas o mesmo cuidado de `generateUniqueDisplaySlug`.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCandidateCode()
    const { error } = await db
      .from("affiliates")
      .update({
        status: "approved",
        code,
        reviewed_by: reviewerId,
        reviewed_at: now,
        approved_at: now,
        rejection_reason: null,
      })
      .eq("id", affiliateId)

    if (!error) return { ok: true }
    if (error.code !== "23505") {
      console.error("[affiliates-repository] approveAffiliate:", error)
      return { ok: false, error: "Não foi possível aprovar o afiliado.", status: 500 }
    }
  }

  return { ok: false, error: "Não foi possível gerar um código único. Tente novamente.", status: 500 }
}

export async function rejectAffiliate(
  affiliateId: string,
  reviewerId: string,
  reason?: string
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("affiliates")
    .update({
      status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason ?? null,
    })
    .eq("id", affiliateId)

  if (error) {
    console.error("[affiliates-repository] rejectAffiliate:", error)
    return { ok: false, error: "Não foi possível rejeitar a solicitação.", status: 500 }
  }
  return { ok: true }
}

export async function suspendAffiliate(
  affiliateId: string,
  reviewerId: string,
  reason?: string
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("affiliates")
    .update({
      status: "suspended",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason ?? null,
    })
    .eq("id", affiliateId)

  if (error) {
    console.error("[affiliates-repository] suspendAffiliate:", error)
    return { ok: false, error: "Não foi possível suspender o afiliado.", status: 500 }
  }
  return { ok: true }
}

export async function listAllPayoutRequests(
  status?: PayoutStatus,
  page = 1,
  pageSize = 20
): Promise<{ payouts: PayoutRequestRow[]; total: number }> {
  const db = createSupabaseAdminClient()
  const currentPage = clampPage(page)
  const size = clampPageSize(pageSize, 100, 20)

  let query = db
    .from("affiliate_payout_requests")
    .select(PAYOUT_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(...rangeFor(currentPage, size))

  if (status) query = query.eq("status", status)

  const { data, count, error } = await query
  if (error) {
    console.error("[affiliates-repository] listAllPayoutRequests:", error)
    return { payouts: [], total: 0 }
  }
  return { payouts: (data ?? []) as PayoutRequestRow[], total: count ?? 0 }
}

/** Marcação manual — o PIX de fato é feito fora do sistema pelo admin. */
export async function markPayoutPaid(payoutId: string, reviewerId: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("affiliate_payout_requests")
    .select("id, status")
    .eq("id", payoutId)
    .maybeSingle()
  if (!existing) return { ok: false, error: "Saque não encontrado.", status: 404 }
  if (existing.status !== "requested") {
    return { ok: false, error: "Este saque já foi decidido.", status: 400 }
  }

  const { error } = await db
    .from("affiliate_payout_requests")
    .update({ status: "paid", reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), paid_at: new Date().toISOString() })
    .eq("id", payoutId)

  if (error) {
    console.error("[affiliates-repository] markPayoutPaid:", error)
    return { ok: false, error: "Não foi possível marcar o saque como pago.", status: 500 }
  }
  return { ok: true }
}

/**
 * Rejeita um saque solicitado. Não precisa devolver saldo — `balance_cents`
 * nunca foi debitado na solicitação (só reservado logicamente pela RPC de
 * saque, que soma saques `requested` em aberto para calcular disponível).
 */
export async function rejectPayoutRequest(
  payoutId: string,
  reviewerId: string,
  reason?: string
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("affiliate_payout_requests")
    .select("id, status")
    .eq("id", payoutId)
    .maybeSingle()
  if (!existing) return { ok: false, error: "Saque não encontrado.", status: 404 }
  if (existing.status !== "requested") {
    return { ok: false, error: "Este saque já foi decidido.", status: 400 }
  }

  const { error } = await db
    .from("affiliate_payout_requests")
    .update({
      status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      admin_note: reason ?? null,
    })
    .eq("id", payoutId)

  if (error) {
    console.error("[affiliates-repository] rejectPayoutRequest:", error)
    return { ok: false, error: "Não foi possível rejeitar o saque.", status: 500 }
  }
  return { ok: true }
}

export async function listAllCommissionEvents(filters?: {
  affiliateId?: string
  type?: CommissionEventType
  page?: number
  pageSize?: number
}): Promise<{ events: CommissionEventRow[]; total: number }> {
  const db = createSupabaseAdminClient()
  const currentPage = clampPage(filters?.page)
  const size = clampPageSize(filters?.pageSize, 100, 20)

  let query = db
    .from("affiliate_commission_events")
    .select(COMMISSION_EVENT_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(...rangeFor(currentPage, size))

  if (filters?.affiliateId) query = query.eq("affiliate_id", filters.affiliateId)
  if (filters?.type) query = query.eq("type", filters.type)

  const { data, count, error } = await query
  if (error) {
    console.error("[affiliates-repository] listAllCommissionEvents:", error)
    return { events: [], total: 0 }
  }
  return { events: (data ?? []) as CommissionEventRow[], total: count ?? 0 }
}
