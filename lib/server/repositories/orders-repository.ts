import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getUserProfiles } from "@/lib/server/repositories/users-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"
import { syncCommissionForRefund } from "@/lib/server/repositories/affiliates-repository"
import { logAdminAction } from "@/lib/server/repositories/store-admin-audit-repository"
import { clampPage, clampPageSize, escapeOrFilterValue, rangeFor } from "@/lib/server/repositories/_shared"

/** Extrai o dono do pedido a partir de `metadata->>user_id` (null em pedidos de convidado). */
function orderOwnerId(metadata: Record<string, unknown> | null | undefined): string | null {
  const userId = metadata?.user_id
  return typeof userId === "string" ? userId : null
}

/**
 * Repositório de pedidos (`store_orders`). Leitura do lado do usuário
 * (histórico/status) e, a partir daqui, também leitura/gestão do lado admin
 * (fila de pedidos, avanço de status pós-venda). Criação do pedido e
 * transição pending -> paid seguem em `app/api/store/checkout` e nos
 * webhooks — este arquivo não mexe nisso.
 */

export type OrderStatus =
  | "pending"
  | "paid"
  | "awaiting_shipping_info"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "expired"

/**
 * Janela de expiração do PIX quando `pix_expires_at` não vem do gateway
 * (hoje sempre o caso da MisticPay — a API dela não retorna prazo). Usada
 * tanto no checkout, para preencher `pix_expires_at` no branch MisticPay,
 * quanto aqui, como fallback ao decidir o que expirar.
 */
export const PIX_EXPIRATION_MINUTES = Number(process.env.PIX_EXPIRATION_MINUTES) || 60

/** Sequência válida do fluxo pós-venda — só avança, nunca pula etapa. */
export const ORDER_FULFILLMENT_FLOW: OrderStatus[] = [
  "paid",
  "awaiting_shipping_info",
  "shipped",
  "delivered",
]

export type UserOrderSummary = {
  id: string
  status: OrderStatus
  total_cents: number
  items: Record<string, unknown>[]
  created_at: string
  payment_method: string | null
  misticpay_e2e: string | null
  asaas_payment_id: string | null
  asaas_receipt_url: string | null
  pix_copy_paste: string | null
  pix_qr_code_base64: string | null
  tracking_code: string | null
  carrier: string | null
}

const ORDER_COLUMNS =
  "id, status, total_cents, items, created_at, payment_method, misticpay_e2e, asaas_payment_id, asaas_receipt_url, pix_copy_paste, pix_qr_code_base64, tracking_code, carrier"

/**
 * Lista os pedidos de um usuário logado, mais recentes primeiro.
 *
 * Paginado (mesmo padrão de `_shared.ts`) — sem limite, um cliente antigo
 * com muitos pedidos trazia o histórico inteiro toda vez que abria "Meus
 * Pedidos" ou o popover de pedido pendente do miniperfil.
 */
export async function listOrdersByUser(
  userId: string,
  page = 1,
  pageSize = 20
): Promise<{ orders: UserOrderSummary[]; total: number; hasMore: boolean }> {
  const db = createSupabaseAdminClient()
  const currentPage = clampPage(page)
  const size = clampPageSize(pageSize, 50, 20)
  const { data, count, error } = await db
    .from("store_orders")
    .select(ORDER_COLUMNS, { count: "exact" })
    .eq("metadata->>user_id", userId)
    .order("created_at", { ascending: false })
    .range(...rangeFor(currentPage, size))

  if (error) {
    console.error("[orders-repository] listOrdersByUser:", error)
    return { orders: [], total: 0, hasMore: false }
  }
  const total = count ?? 0
  return {
    orders: (data ?? []) as unknown as UserOrderSummary[],
    total,
    hasMore: currentPage * size < total,
  }
}

/** Pedido pendente mais recente do usuário — usado no popover do miniperfil. */
export async function getLatestPendingOrderByUser(userId: string): Promise<UserOrderSummary | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_orders")
    .select(ORDER_COLUMNS)
    .eq("metadata->>user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[orders-repository] getLatestPendingOrderByUser:", error)
    return null
  }
  return data as unknown as UserOrderSummary | null
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type AdminOrderRow = {
  id: string
  status: OrderStatus
  total_cents: number
  items: Record<string, unknown>[]
  created_at: string
  updated_at: string
  payment_method: string | null
  customer_name: string | null
  customer_email: string | null
  tracking_code: string | null
  carrier: string | null
  shipped_at: string | null
  delivered_at: string | null
  refunded_cents: number
  refund_reason: string | null
  refunded_at: string | null
  /** Qual gateway processou o pagamento — determina se o extorno pode ser feito por aqui. */
  gateway: "asaas" | "misticpay" | null
  asaas_payment_id: string | null
  misticpay_transaction_id: string | null
  misticpay_e2e: string | null
  /** Presente quando o pedido foi feito por um usuário logado (metadata.user_id). */
  user_id: string | null
  user_display_name: string | null
}

const ADMIN_ORDER_COLUMNS =
  "id, status, total_cents, items, created_at, updated_at, payment_method, customer_name, customer_email, metadata, tracking_code, carrier, shipped_at, delivered_at, refunded_cents, refund_reason, refunded_at, asaas_payment_id, misticpay_transaction_id, misticpay_e2e"

type AdminOrderRawRow = {
  id: string
  status: OrderStatus
  total_cents: number
  items: Record<string, unknown>[]
  created_at: string
  updated_at: string
  payment_method: string | null
  customer_name: string | null
  customer_email: string | null
  metadata: Record<string, unknown> | null
  tracking_code: string | null
  carrier: string | null
  shipped_at: string | null
  delivered_at: string | null
  refunded_cents: number
  refund_reason: string | null
  refunded_at: string | null
  asaas_payment_id: string | null
  misticpay_transaction_id: string | null
  misticpay_e2e: string | null
}

export type AdminOrderListResult = {
  orders: AdminOrderRow[]
  total: number
}

/**
 * Fila de pedidos para o admin, com filtros opcionais por status, produto
 * (id presente em `items`), usuário (busca livre em nome/e-mail — cobre
 * tanto convidado quanto logado, já que `customer_name`/`customer_email`
 * são gravados no checkout independente de login), usuário logado específico
 * (`metadata->>user_id`) e período (`created_at`). Pagina no banco.
 */
export async function listOrdersForAdmin(filters?: {
  status?: OrderStatus
  productId?: string
  userQuery?: string
  userId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}): Promise<AdminOrderListResult> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("store_orders")
    .select(ADMIN_ORDER_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })

  if (filters?.status) query = query.eq("status", filters.status)
  if (filters?.userQuery?.trim()) {
    const term = escapeOrFilterValue(filters.userQuery.trim())
    query = query.or(`customer_name.ilike."%${term}%",customer_email.ilike."%${term}%"`)
  }
  if (filters?.userId) query = query.eq("metadata->>user_id", filters.userId)
  // `items` é jsonb — o postgrest-js só monta o operador `cs` corretamente
  // a partir de uma string JSON já serializada, não de um array/objeto JS.
  if (filters?.productId) query = query.contains("items", JSON.stringify([{ id: filters.productId }]))
  if (filters?.dateFrom) query = query.gte("created_at", filters.dateFrom)
  if (filters?.dateTo) query = query.lte("created_at", filters.dateTo)

  const page = Math.max(1, filters?.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 20))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) {
    console.error("[orders-repository] listOrdersForAdmin:", error)
    return { orders: [], total: 0 }
  }

  const rows = (data ?? []) as unknown as AdminOrderRawRow[]

  const userIds = [...new Set(
    rows
      .map((row) => (row.metadata?.user_id as string | undefined) ?? null)
      .filter((id): id is string => Boolean(id))
  )]
  const profiles = await getUserProfiles(userIds)

  const orders: AdminOrderRow[] = rows.map((row) => {
    const userId = (row.metadata?.user_id as string | undefined) ?? null
    return {
      id: row.id,
      status: row.status,
      total_cents: row.total_cents,
      items: row.items,
      created_at: row.created_at,
      updated_at: row.updated_at,
      payment_method: row.payment_method,
      customer_name: row.customer_name,
      customer_email: row.customer_email,
      tracking_code: row.tracking_code,
      carrier: row.carrier,
      shipped_at: row.shipped_at,
      delivered_at: row.delivered_at,
      refunded_cents: row.refunded_cents,
      refund_reason: row.refund_reason,
      refunded_at: row.refunded_at,
      gateway: row.asaas_payment_id ? "asaas" : row.misticpay_transaction_id ? "misticpay" : null,
      asaas_payment_id: row.asaas_payment_id,
      misticpay_transaction_id: row.misticpay_transaction_id,
      misticpay_e2e: row.misticpay_e2e,
      user_id: userId,
      user_display_name: userId ? profiles[userId]?.display_name ?? null : null,
    }
  })

  return { orders, total: count ?? orders.length }
}

export type OrderStatusCounts = Record<OrderStatus | "all", number>

/**
 * Contagem de pedidos por status, para os blocos de filtro — sempre sobre a
 * base inteira, sem paginação. Usa `count_orders_by_status` (group by no
 * Postgres) em vez de trazer uma linha por pedido pro Node: escala com o
 * número de status, não com o total de pedidos.
 */
export async function countOrdersByStatus(): Promise<OrderStatusCounts> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("count_orders_by_status")
  const counts: OrderStatusCounts = {
    all: 0,
    pending: 0,
    paid: 0,
    awaiting_shipping_info: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    refunded: 0,
    expired: 0,
  }
  if (error) {
    console.error("[orders-repository] countOrdersByStatus:", error)
    return counts
  }
  for (const row of (data ?? []) as { status: OrderStatus; count: number }[]) {
    counts[row.status] = (counts[row.status] ?? 0) + Number(row.count)
    counts.all += Number(row.count)
  }
  return counts
}

export type OrderCustomer = {
  userId: string | null
  name: string | null
  email: string | null
}

/**
 * Lista de clientes distintos com pelo menos um pedido, para o select com
 * busca da fila de pedidos. Usuários logados usam `user_id` como chave
 * (cobre trocas de nome/e-mail); convidados usam o par nome+e-mail do
 * checkout, já que não têm id estável.
 */
export async function searchOrderCustomers(query: string, limit = 20): Promise<OrderCustomer[]> {
  const db = createSupabaseAdminClient()
  let dbQuery = db
    .from("store_orders")
    .select("customer_name, customer_email, metadata")
    .order("created_at", { ascending: false })
    .limit(500)

  const term = query.trim()
  if (term) {
    const escaped = escapeOrFilterValue(term)
    dbQuery = dbQuery.or(`customer_name.ilike."%${escaped}%",customer_email.ilike."%${escaped}%"`)
  }

  const { data, error } = await dbQuery
  if (error) {
    console.error("[orders-repository] searchOrderCustomers:", error)
    return []
  }

  const rows = (data ?? []) as { customer_name: string | null; customer_email: string | null; metadata: Record<string, unknown> | null }[]
  const byKey = new Map<string, OrderCustomer>()
  for (const row of rows) {
    const userId = (row.metadata?.user_id as string | undefined) ?? null
    const key = userId ?? `${row.customer_name ?? ""}|${row.customer_email ?? ""}`
    if (!byKey.has(key)) {
      byKey.set(key, { userId, name: row.customer_name, email: row.customer_email })
    }
  }

  const customers = [...byKey.values()]
  if (customers.length <= limit) return customers

  const userIds = customers.map((c) => c.userId).filter((id): id is string => Boolean(id))
  const profiles = await getUserProfiles(userIds)
  return customers
    .map((c) => ({ ...c, name: (c.userId && profiles[c.userId]?.display_name) || c.name }))
    .slice(0, limit)
}

export type OrderProductOption = { id: string; name: string }

/**
 * Busca produtos por nome direto em `store_products` (não deriva de pedidos
 * já carregados) — usado pelo combobox de produto da fila de pedidos, pra
 * funcionar igual haja 10 ou 10 mil produtos cadastrados.
 */
export async function searchOrderProducts(query: string, limit = 20): Promise<OrderProductOption[]> {
  const db = createSupabaseAdminClient()
  let dbQuery = db
    .from("store_products")
    .select("id, name")
    .order("name", { ascending: true })
    .limit(limit)

  const term = query.trim()
  if (term) {
    dbQuery = dbQuery.ilike("name", `%${escapeOrFilterValue(term)}%`)
  }

  const { data, error } = await dbQuery
  if (error) {
    console.error("[orders-repository] searchOrderProducts:", error)
    return []
  }
  return (data ?? []) as OrderProductOption[]
}

export type RepositoryResult = { ok: true } | { ok: false; error: string; status: number }

/**
 * Avança o status de um pedido para a próxima etapa válida do fluxo
 * pós-venda (`ORDER_FULFILLMENT_FLOW`). Só aceita avançar exatamente uma
 * etapa a partir do status atual — nunca pular, nunca regredir — mesmo
 * padrão de validação de `market-repository.ts` (`markOwnMarketListingSold`).
 */
export async function advanceOrderStatus(
  id: string,
  nextStatus: OrderStatus,
  extra?: { trackingCode?: string; carrier?: string },
  adminId?: string | null
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("store_orders")
    .select("id, status, metadata")
    .eq("id", id)
    .maybeSingle()

  if (!existing) {
    return { ok: false, error: "Pedido não encontrado.", status: 404 }
  }

  const currentStatus = existing.status as OrderStatus
  const currentIndex = ORDER_FULFILLMENT_FLOW.indexOf(currentStatus)
  const nextIndex = ORDER_FULFILLMENT_FLOW.indexOf(nextStatus)

  if (currentIndex === -1) {
    return { ok: false, error: "Este pedido não está no fluxo de pós-venda.", status: 400 }
  }
  if (nextIndex !== currentIndex + 1) {
    return { ok: false, error: "Só é possível avançar uma etapa por vez, na ordem do fluxo.", status: 400 }
  }

  const update: Partial<{
    status: OrderStatus
    shipped_at: string
    delivered_at: string
    tracking_code: string
    carrier: string
  }> = { status: nextStatus }
  if (nextStatus === "shipped") {
    update.shipped_at = new Date().toISOString()
    if (extra?.trackingCode) update.tracking_code = extra.trackingCode
    if (extra?.carrier) update.carrier = extra.carrier
  }
  if (nextStatus === "delivered") {
    update.delivered_at = new Date().toISOString()
  }

  const { error } = await db.from("store_orders").update(update).eq("id", id)
  if (error) {
    return { ok: false, error: "Não foi possível atualizar o pedido.", status: 400 }
  }

  const ownerId = orderOwnerId(existing.metadata as Record<string, unknown> | null)
  if (ownerId) {
    await notifyOrderStatusChange({ userId: ownerId, orderId: id, status: nextStatus })
  }

  if (adminId) {
    await logAdminAction({
      adminId,
      action: "order.advance",
      entityType: "store_order",
      entityId: id,
      before: { status: currentStatus },
      after: { status: nextStatus, trackingCode: extra?.trackingCode ?? null, carrier: extra?.carrier ?? null },
    })
  }

  return { ok: true }
}

/**
 * Extorna um pedido pago via Asaas — integral (sem `valueCents`) ou parcial.
 * Só pedidos com `asaas_payment_id` são suportados: a MisticPay não expõe
 * estorno na API pública hoje, então esses pedidos precisam ser extornados
 * manualmente no painel da MisticPay e só têm o status marcado aqui.
 *
 * A cobrança na Asaas é a fonte da verdade — chamamos `refundPayment` antes
 * de tocar no banco, e só gravamos o acumulado se o gateway confirmar.
 */
export async function refundOrder(
  id: string,
  params: { valueCents?: number; reason?: string },
  adminId?: string | null
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("store_orders")
    .select("id, status, total_cents, refunded_cents, asaas_payment_id, metadata, affiliate_id")
    .eq("id", id)
    .maybeSingle()

  if (!existing) {
    return { ok: false, error: "Pedido não encontrado.", status: 404 }
  }
  if (!["paid", "awaiting_shipping_info", "shipped", "delivered"].includes(existing.status)) {
    return { ok: false, error: "Só é possível extornar um pedido pago.", status: 400 }
  }
  if (!existing.asaas_payment_id) {
    return {
      ok: false,
      error: "Este pedido não foi pago via Asaas — extorne manualmente no gateway usado e atualize o status.",
      status: 400,
    }
  }

  const remainingCents = existing.total_cents - existing.refunded_cents
  const refundCents = params.valueCents ?? remainingCents
  if (refundCents <= 0 || refundCents > remainingCents) {
    return { ok: false, error: "Valor de extorno inválido para o saldo restante do pedido.", status: 400 }
  }

  const { refundPayment } = await import("@/lib/server/integrations/asaas")
  try {
    await refundPayment(existing.asaas_payment_id, { valueCents: refundCents, description: params.reason })
  } catch (err) {
    console.error("[orders-repository] refundOrder — Asaas:", err)
    return { ok: false, error: "Não foi possível extornar no Asaas. Tente novamente.", status: 502 }
  }

  const newRefundedCents = existing.refunded_cents + refundCents
  const isFullRefund = newRefundedCents >= existing.total_cents

  const update: Partial<{
    status: OrderStatus
    refunded_cents: number
    refund_reason: string
    refunded_at: string
  }> = {
    refunded_cents: newRefundedCents,
    refunded_at: new Date().toISOString(),
  }
  if (params.reason) update.refund_reason = params.reason
  if (isFullRefund) update.status = "refunded"

  const { error } = await db.from("store_orders").update(update).eq("id", id)
  if (error) {
    // O estorno já aconteceu de verdade no Asaas — não propaga como falha
    // total, mas também não finge que o banco está em dia.
    console.error("[orders-repository] refundOrder — grava status:", error)
    return { ok: false, error: "Extorno feito no Asaas, mas falhou ao atualizar o pedido. Verifique manualmente.", status: 500 }
  }

  if (isFullRefund) {
    const ownerId = orderOwnerId(existing.metadata as Record<string, unknown> | null)
    if (ownerId) {
      await notifyOrderStatusChange({ userId: ownerId, orderId: id, status: "refunded" })
    }
  }

  try {
    await syncCommissionForRefund(
      { id: existing.id, affiliate_id: existing.affiliate_id, total_cents: existing.total_cents },
      newRefundedCents,
      existing.refunded_cents
    )
  } catch (err) {
    console.error("[orders-repository] refundOrder — syncCommissionForRefund:", err)
  }

  if (adminId) {
    await logAdminAction({
      adminId,
      action: "order.refund",
      entityType: "store_order",
      entityId: id,
      before: { status: existing.status, refunded_cents: existing.refunded_cents },
      after: { status: update.status ?? existing.status, refunded_cents: newRefundedCents, reason: params.reason ?? null },
    })
  }

  return { ok: true }
}

export type ExpireStalePendingOrdersResult = {
  expired_count: number
  stock_restored_count: number
  errors: string[]
}

/**
 * Expira pedidos `pending` cujo PIX venceu sem pagamento, devolvendo o
 * estoque reservado no checkout (ver `app/api/store/checkout/route.ts`).
 * Chamada pelo cron `/api/cron/expire-pending-orders`.
 *
 * O UPDATE condicional (`WHERE status = 'pending'`) roda ANTES do
 * incremento de estoque, de propósito: ele já resolve a corrida contra um
 * webhook de pagamento processando o mesmo pedido no mesmo instante — só as
 * linhas que o UPDATE realmente afetou (ainda `pending` no momento exato da
 * escrita) têm o estoque devolvido. Isso evita devolver estoque de um
 * pedido que acabou de ser pago.
 */
export async function expireStalePendingOrders(): Promise<ExpireStalePendingOrdersResult> {
  const db = createSupabaseAdminClient()
  const now = new Date().toISOString()
  const fallbackCutoff = new Date(Date.now() - PIX_EXPIRATION_MINUTES * 60_000).toISOString()

  const { data: expiredOrders, error } = await db
    .from("store_orders")
    .update({ status: "expired", updated_at: now })
    .eq("status", "pending")
    .or(`pix_expires_at.lt.${now},and(pix_expires_at.is.null,created_at.lt.${fallbackCutoff})`)
    .select("id, items")

  if (error) {
    console.error("[orders-repository] expireStalePendingOrders — update:", error)
    return { expired_count: 0, stock_restored_count: 0, errors: [error.message] }
  }

  const orders = (expiredOrders ?? []) as { id: string; items: Record<string, unknown>[] }[]

  // Achata (pedido, item) numa lista única e restaura o estoque em paralelo —
  // cada RPC é independente (produto/variante diferentes), então não há
  // motivo pra serializar pedido por pedido, item por item.
  const restoreTasks = orders.flatMap((order) => {
    const cart = order.items as Array<{ id: string; quantity: number; variant_id?: string | null }>
    return cart.map((item) => ({ orderId: order.id, item }))
  })

  const results = await Promise.all(
    restoreTasks.map(async ({ orderId, item }) => {
      const { data: restored } = item.variant_id
        ? await db.rpc("increment_variant_stock", { p_variant_id: item.variant_id, p_quantity: item.quantity })
        : await db.rpc("increment_store_stock", { p_product_id: item.id, p_quantity: item.quantity })
      return { orderId, item, restored: Boolean(restored) }
    })
  )

  const errors: string[] = []
  let stockRestoredCount = 0
  for (const { orderId, item, restored } of results) {
    if (restored) {
      stockRestoredCount += 1
    } else {
      const message = `Falha ao devolver estoque do pedido expirado ${orderId} (item ${item.variant_id ?? item.id})`
      console.error("[orders-repository] expireStalePendingOrders —", message)
      errors.push(message)
    }
  }

  return { expired_count: orders.length, stock_restored_count: stockRestoredCount, errors }
}

/**
 * Reconcilia `refunded_cents`/`status` de um pedido a partir do estado real
 * do pagamento na Asaas. Existe porque `refundOrder` só cobre estornos
 * iniciados pelo nosso admin (grava no mesmo request que chama a Asaas) —
 * qualquer estorno feito ou cancelado direto no painel Asaas nunca passa por
 * ali, e o webhook não tem outro jeito de saber o valor certo além de
 * reconsultar a cobrança. Somamos só os itens `refunds[].status === "DONE"`
 * porque um estorno pode ficar `PENDING` ou virar `CANCELLED` sem que
 * dinheiro tenha voltado de fato.
 */
export async function syncOrderRefundState(paymentId: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("store_orders")
    .select("id, status, total_cents, refunded_cents, metadata, affiliate_id")
    .eq("asaas_payment_id", paymentId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, error: "Pedido não encontrado para este pagamento.", status: 404 }
  }
  if (!["paid", "awaiting_shipping_info", "shipped", "delivered", "refunded"].includes(existing.status)) {
    return { ok: false, error: "Pedido fora do fluxo pós-pagamento — nada a reconciliar.", status: 400 }
  }

  const { getPayment } = await import("@/lib/server/integrations/asaas")
  const verified = await getPayment(paymentId)

  const refundedCents = (verified.refunds ?? [])
    .filter((refund) => refund.status === "DONE")
    .reduce((sum, refund) => sum + Math.round(refund.value * 100), 0)

  if (refundedCents === existing.refunded_cents) {
    return { ok: true }
  }

  const isFullRefund = refundedCents >= existing.total_cents
  const update: Partial<{ status: OrderStatus; refunded_cents: number; refunded_at: string }> = {
    refunded_cents: refundedCents,
  }
  // Só mexe no status pós-venda quando o valor estornado cruza (ou deixa de
  // cruzar, no caso de estorno cancelado) o total do pedido — nunca regride
  // um pedido "refunded" que na verdade já foi entregue por engano.
  if (isFullRefund && existing.status !== "refunded") {
    update.status = "refunded"
    update.refunded_at = new Date().toISOString()
  } else if (!isFullRefund && existing.status === "refunded") {
    update.status = "paid"
  }

  const { error } = await db.from("store_orders").update(update).eq("id", existing.id)
  if (error) {
    console.error("[orders-repository] syncOrderRefundState — grava status:", error)
    return { ok: false, error: "Falha ao reconciliar estorno do pedido.", status: 500 }
  }

  if (update.status) {
    const ownerId = orderOwnerId(existing.metadata as Record<string, unknown> | null)
    if (ownerId) {
      await notifyOrderStatusChange({ userId: ownerId, orderId: existing.id, status: update.status })
    }
  }

  try {
    await syncCommissionForRefund(
      { id: existing.id, affiliate_id: existing.affiliate_id, total_cents: existing.total_cents },
      refundedCents,
      existing.refunded_cents
    )
  } catch (err) {
    console.error("[orders-repository] syncOrderRefundState — syncCommissionForRefund:", err)
  }

  return { ok: true }
}
