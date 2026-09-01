import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { clampPage, clampPageSize, rangeFor } from "@/lib/server/repositories/_shared"
import { normalizeAffiliateCode } from "@/lib/affiliate-code"
import { notifyAffiliatePayoutStatus } from "@/lib/server/repositories/notifications-repository"

/**
 * Repositório do sistema de afiliados — única porta de acesso a `affiliates`,
 * `affiliate_commission_events` (ledger, fonte de verdade do saldo) e
 * `affiliate_payout_requests`. `affiliates.balance_cents` é só um cache
 * somado pelas RPCs `apply_affiliate_commission_event`/`request_affiliate_payout`
 * — nunca é escrito diretamente por este arquivo.
 */

export type RepositoryResult = { ok: true } | { ok: false; error: string; status: number }

/** BRL só para as mensagens de erro deste módulo (o `lib/format` é do cliente). */
function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

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
 * Checa se um código está livre para uso. `exceptAffiliateId` permite que o
 * próprio dono da solicitação "reserve" o código que ele já tem (reenvio sem
 * mudar o código não deve se autobloquear).
 */
export async function isAffiliateCodeAvailable(code: string, exceptAffiliateId?: string): Promise<boolean> {
  const normalized = normalizeAffiliateCode(code)
  if (!normalized) return false

  const db = createSupabaseAdminClient()
  let query = db.from("affiliates").select("id").eq("code", normalized).limit(1)
  if (exceptAffiliateId) query = query.neq("id", exceptAffiliateId)

  const { data, error } = await query
  if (error) {
    console.error("[affiliates-repository] isAffiliateCodeAvailable:", error)
    return false // fail-closed
  }
  return (data ?? []).length === 0
}

/**
 * Cria (ou reenvia, se a solicitação anterior foi rejeitada) um pedido de
 * afiliação. O código escolhido pelo usuário é reservado já no `pending`
 * (grava direto em `code`, que é `unique`) — assim ninguém mais consegue
 * pegá-lo enquanto a solicitação está em análise. Se for rejeitada, o código
 * é liberado (`rejectAffiliate` zera a coluna).
 */
export async function requestAffiliation(
  userId: string,
  params: { pixKey: string; pixKeyType: PixKeyType; code: string }
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const code = normalizeAffiliateCode(params.code)

  const { data: existing } = await db
    .from("affiliates")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle()

  if (existing && existing.status !== "rejected") {
    return { ok: false, error: "Você já tem uma solicitação de afiliação em andamento ou ativa.", status: 409 }
  }

  const available = await isAffiliateCodeAvailable(code, existing?.id)
  if (!available) {
    return { ok: false, error: "Esse código já está em uso. Escolha outro.", status: 409 }
  }

  if (existing) {
    // Reaproveita a linha de uma solicitação rejeitada — permite reenvio sem duplicar o cadastro (user_id é unique).
    const { error } = await db
      .from("affiliates")
      .update({
        status: "pending",
        code,
        pix_key: params.pixKey,
        pix_key_type: params.pixKeyType,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq("id", existing.id)
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Esse código já está em uso. Escolha outro.", status: 409 }
      }
      console.error("[affiliates-repository] requestAffiliation — reenvio:", error)
      return { ok: false, error: "Não foi possível enviar sua solicitação.", status: 500 }
    }
    return { ok: true }
  }

  const { error } = await db.from("affiliates").insert({
    user_id: userId,
    status: "pending",
    code,
    pix_key: params.pixKey,
    pix_key_type: params.pixKeyType,
  })
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Esse código já está em uso. Escolha outro.", status: 409 }
    }
    console.error("[affiliates-repository] requestAffiliation — insert:", error)
    return { ok: false, error: "Não foi possível enviar sua solicitação.", status: 500 }
  }
  return { ok: true }
}

/**
 * Troca o código de um afiliado já aprovado. Links antigos com o código
 * anterior param de resolver assim que a troca é gravada — é o mesmo trade-off
 * de trocar um nome de usuário, e fica explícito na UI que chama isto.
 */
export async function updateAffiliateCode(userId: string, code: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const normalized = normalizeAffiliateCode(code)

  const { data: existing } = await db
    .from("affiliates")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle()

  if (!existing) return { ok: false, error: "Você ainda não é afiliado.", status: 404 }
  if (existing.status !== "approved") {
    return { ok: false, error: "Só é possível alterar o código com o cadastro aprovado.", status: 409 }
  }

  const available = await isAffiliateCodeAvailable(normalized, existing.id)
  if (!available) {
    return { ok: false, error: "Esse código já está em uso. Escolha outro.", status: 409 }
  }

  const { error } = await db.from("affiliates").update({ code: normalized }).eq("id", existing.id)
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Esse código já está em uso. Escolha outro.", status: 409 }
    }
    console.error("[affiliates-repository] updateAffiliateCode:", error)
    return { ok: false, error: "Não foi possível alterar o código.", status: 500 }
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

/**
 * Chama `request_affiliate_payout` — a guarda de saldo, o mínimo e o teto de
 * saques simultâneos são atômicos, resolvidos dentro da RPC.
 *
 * A RPC devolve um `code` por causa de recusa (antes eram cinco motivos
 * distintos virando um `null` mudo, que a API traduzia sempre como "saldo
 * insuficiente" — inclusive quando o problema era outro). Aqui cada código
 * vira a frase que diz o que fazer a seguir.
 */
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
  if (!data?.ok) {
    switch (data?.code) {
      case "below_minimum":
        return {
          ok: false,
          error: `O saque mínimo é de ${formatCentsBRL(data.min_cents ?? 0)}.`,
          status: 400,
        }
      case "insufficient_balance":
        return {
          ok: false,
          error: `Você tem ${formatCentsBRL(data.available_cents ?? 0)} disponíveis para saque agora.`,
          status: 400,
        }
      case "too_many_pending":
        return {
          ok: false,
          error: "Você já tem 3 saques em análise. Aguarde um deles ser processado.",
          status: 400,
        }
      default:
        return { ok: false, error: "Não foi possível solicitar o saque.", status: 400 }
    }
  }
  return { ok: true }
}

/**
 * Cancelamento pelo próprio afiliado. O `affiliateId` vai para a RPC junto
 * do id do saque: quem cancela só alcança os próprios saques, e só enquanto
 * estão em análise.
 */
export async function cancelPayoutRequest(
  affiliateId: string,
  payoutId: string
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("cancel_affiliate_payout", {
    p_affiliate_id: affiliateId,
    p_payout_id: payoutId,
  })

  if (error) {
    console.error("[affiliates-repository] cancelPayoutRequest:", error)
    return { ok: false, error: "Não foi possível cancelar o saque.", status: 500 }
  }
  if (!data?.ok) {
    return {
      ok: false,
      error: "Este saque não pode mais ser cancelado — ele já foi processado.",
      status: 409,
    }
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

/** O `code` já foi reservado na solicitação (`requestAffiliation`) — aprovar só muda o status. */
export async function approveAffiliate(affiliateId: string, reviewerId: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db.from("affiliates").select("id, status").eq("id", affiliateId).maybeSingle()
  if (!existing) return { ok: false, error: "Afiliado não encontrado.", status: 404 }
  if (existing.status === "approved") return { ok: true }

  const now = new Date().toISOString()
  const { error } = await db
    .from("affiliates")
    .update({
      status: "approved",
      reviewed_by: reviewerId,
      reviewed_at: now,
      approved_at: now,
      rejection_reason: null,
    })
    .eq("id", affiliateId)

  if (error) {
    console.error("[affiliates-repository] approveAffiliate:", error)
    return { ok: false, error: "Não foi possível aprovar o afiliado.", status: 500 }
  }
  return { ok: true }
}

/** Libera o `code` reservado (volta a ficar disponível para outra solicitação). */
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
      code: null,
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

/**
 * Descobre o dono de um saque para notificá-lo. `affiliate_payout_requests`
 * só guarda `affiliate_id`, e a notificação é endereçada por `user_id`.
 */
async function getPayoutOwnerUserId(affiliateId: string): Promise<string | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("affiliates").select("user_id").eq("id", affiliateId).maybeSingle()
  return data?.user_id ?? null
}

/** Marcação manual — o PIX de fato é feito fora do sistema pelo admin. */
export async function markPayoutPaid(payoutId: string, reviewerId: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("affiliate_payout_requests")
    .select("id, status, affiliate_id, amount_cents")
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

  // Depois do update: avisar sobre um pagamento que não aconteceu é pior que
  // não avisar. `notifyAffiliatePayoutStatus` é best-effort e nunca lança.
  const userId = await getPayoutOwnerUserId(existing.affiliate_id)
  if (userId) {
    await notifyAffiliatePayoutStatus({
      userId,
      payoutId,
      status: "paid",
      amountCents: existing.amount_cents,
    })
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
    .select("id, status, affiliate_id, amount_cents")
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

  const userId = await getPayoutOwnerUserId(existing.affiliate_id)
  if (userId) {
    await notifyAffiliatePayoutStatus({
      userId,
      payoutId,
      status: "rejected",
      amountCents: existing.amount_cents,
      reason,
    })
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
