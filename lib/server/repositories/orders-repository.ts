import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import type { Database } from "@/lib/database.types"
import { getUserProfiles } from "@/lib/server/repositories/users-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"
import { notifyDiscordOrderEvent } from "@/lib/server/repositories/discord-orders-repository"
import { syncCommissionForRefund } from "@/lib/server/repositories/affiliates-repository"
import { logAdminAction } from "@/lib/server/repositories/store-admin-audit-repository"
import { clampPage, clampPageSize, escapeOrFilterValue, rangeFor } from "@/lib/server/repositories/_shared"
import { computeEffectivePrice } from "@/lib/store-pricing"

/** Extrai o dono do pedido a partir de `metadata->>user_id` (null em pedidos de convidado). */
export function orderOwnerId(metadata: Record<string, unknown> | null | undefined): string | null {
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
 * Recorte por ambiente do gateway (`store_orders.is_sandbox`).
 *
 * "production" é o padrão em toda leitura: pedido de sandbox é pagamento de
 * mentira e não pode aparecer para o cliente nem somar em receita. "sandbox"
 * e "all" existem só para a fila do admin, que precisa conseguir olhar o que
 * foi testado.
 */
export type OrderEnvironment = "production" | "sandbox" | "all"

export const ORDER_ENVIRONMENTS: OrderEnvironment[] = ["production", "sandbox", "all"]

/** Normaliza um valor vindo de query string no recorte de ambiente. */
export function parseOrderEnvironment(value: string | null | undefined): OrderEnvironment {
  return ORDER_ENVIRONMENTS.includes(value as OrderEnvironment)
    ? (value as OrderEnvironment)
    : "production"
}

/**
 * Aplica o recorte de ambiente numa query de `store_orders`. "all" não
 * adiciona filtro nenhum — de propósito: é o único caso em que ver os dois
 * ambientes misturados é o pedido explícito de quem consultou.
 */
function withEnvironment<T>(query: T, environment: OrderEnvironment): T {
  if (environment === "all") return query
  return (query as { eq: (col: string, val: boolean) => T }).eq(
    "is_sandbox",
    environment === "sandbox"
  )
}

/**
 * Janela de expiração do PIX. A Asaas devolve um `expirationDate` de longa
 * validade no QR code, então este valor é o prazo real que a loja impõe:
 * usado no checkout de cartão (`minutesToExpire`) e aqui como fallback ao
 * decidir o que expirar. Ver `getPixQrCode` em `integrations/asaas.ts`.
 */
export const PIX_EXPIRATION_MINUTES = Number(process.env.PIX_EXPIRATION_MINUTES) || 60

/**
 * Prazo do PIX de um pedido que contém pré-venda.
 *
 * Reserva de lançamento é justamente a compra que a pessoa quer pensar antes
 * de confirmar — e a que a loja mais quer segurar. Com o prazo padrão de 60
 * min, um pedido de pré-venda expirava como se fosse pronta-entrega, com o
 * agravante de que não há estoque preso enquanto ele aguarda: o custo de
 * esperar mais é bem menor aqui.
 */
export const PREORDER_PIX_EXPIRATION_MINUTES =
  Number(process.env.PREORDER_PIX_EXPIRATION_MINUTES) || 24 * 60

/** Sequência válida do fluxo pós-venda — só avança, nunca pula etapa. */
export const ORDER_FULFILLMENT_FLOW: OrderStatus[] = [
  "paid",
  "awaiting_shipping_info",
  "shipped",
  "delivered",
]

/**
 * Fluxo de um pedido SEM entrega (serviço/digital, `requires_shipping` false).
 *
 * Não passa por `shipped`: não há pacote, etiqueta nem endereço — e a trava
 * de endereço em `advanceOrderStatus` tornaria esse degrau intransponível.
 * O admin marca como concluído direto quando o serviço foi prestado.
 */
export const ORDER_DIGITAL_FULFILLMENT_FLOW: OrderStatus[] = ["paid", "delivered"]

/**
 * Linha de `store_orders.items` no que importa para mexer em estoque.
 *
 * `sale_type` é o snapshot gravado pelo checkout (ver
 * `app/api/store/checkout/route.ts`): depois da compra o admin troca o
 * produto para "normal" quando o lote chega, então perguntar ao produto
 * HOJE se aquela linha foi pré-venda dá a resposta errada.
 */
export type OrderStockLine = {
  id: string
  quantity: number
  variant_id?: string | null
  sale_type?: string | null
}

/**
 * Pré-venda não movimenta estoque físico — nem na reserva, nem na devolução.
 *
 * O checkout desvia a pré-venda para `reserve_preorder`, que só confere o
 * teto (`preorder_limit`) e NÃO decrementa `stock` (ver a migration
 * 20261009000200_preorder_stock_semantics.sql). Devolver essa linha ao
 * inventário em um cancelamento/expiração criaria unidades que nunca foram
 * descontadas; re-reservá-la em um pagamento atrasado descontaria unidades
 * que nunca foram reservadas — e ainda marcaria o pedido como oversold sem
 * motivo.
 *
 * Vale para os dois sentidos, por isso o nome genérico: todo caminho que
 * chama `increment_*_stock` ou `decrement_*_stock` a partir dos itens de um
 * pedido precisa filtrar por aqui primeiro.
 */
export function lineMovesPhysicalStock(line: { sale_type?: string | null }): boolean {
  return line.sale_type !== "pre_order"
}

/**
 * Endereço de ENTREGA gravado no pedido. Snapshot: o que vale é para onde
 * ESTE pedido foi/vai, mesmo que o cliente mude o endereço do perfil depois.
 * Não confundir com o endereço de COBRANÇA em `user_profiles`, que só existe
 * porque a Asaas exige no customer do checkout de cartão.
 */
export type OrderShippingAddress = {
  recipient: string
  phone: string
  postal_code: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  filled_at: string
}

/** Colunas cruas de entrega, como vêm do banco (todas nulas até ser preenchido). */
type RawShippingColumns = {
  shipping_recipient: string | null
  shipping_phone: string | null
  shipping_postal_code: string | null
  shipping_street: string | null
  shipping_number: string | null
  shipping_complement: string | null
  shipping_neighborhood: string | null
  shipping_city: string | null
  shipping_state: string | null
  shipping_address_filled_at: string | null
  /**
   * Snapshot de `store_products.requires_shipping` no momento da compra:
   * false = pedido de serviço/digital, nunca vai precisar de endereço e não
   * deve aparecer em nenhum aviso de "falta endereço".
   */
  requires_shipping_address: boolean | null
}

const SHIPPING_COLUMNS =
  "shipping_recipient, shipping_phone, shipping_postal_code, shipping_street, shipping_number, shipping_complement, shipping_neighborhood, shipping_city, shipping_state, shipping_address_filled_at, requires_shipping_address"

/**
 * Colapsa as colunas cruas num objeto único — ou `null` se o endereço ainda
 * não foi informado. `filled_at` é o marcador oficial de "tem endereço":
 * checar campo a campo espalharia a mesma regra por várias telas.
 */
export function mapShippingAddress(row: Partial<RawShippingColumns> | null | undefined): OrderShippingAddress | null {
  if (!row?.shipping_address_filled_at) return null
  if (
    !row.shipping_recipient ||
    !row.shipping_postal_code ||
    !row.shipping_street ||
    !row.shipping_number ||
    !row.shipping_neighborhood ||
    !row.shipping_city ||
    !row.shipping_state
  ) {
    return null
  }
  return {
    recipient: row.shipping_recipient,
    phone: row.shipping_phone ?? "",
    postal_code: row.shipping_postal_code,
    street: row.shipping_street,
    number: row.shipping_number,
    complement: row.shipping_complement ?? null,
    neighborhood: row.shipping_neighborhood,
    city: row.shipping_city,
    state: row.shipping_state,
    filled_at: row.shipping_address_filled_at,
  }
}

export type UserOrderSummary = {
  id: string
  status: OrderStatus
  total_cents: number
  items: Record<string, unknown>[]
  created_at: string
  payment_method: string | null
  asaas_payment_id: string | null
  asaas_receipt_url: string | null
  pix_copy_paste: string | null
  pix_qr_code_base64: string | null
  tracking_code: string | null
  carrier: string | null
  shipping_address: OrderShippingAddress | null
  /** false = pedido de serviço/digital: não pede endereço em lugar nenhum. */
  requires_shipping_address: boolean
}

const ORDER_COLUMNS =
  "id, status, total_cents, items, created_at, payment_method, asaas_payment_id, asaas_receipt_url, pix_copy_paste, pix_qr_code_base64, tracking_code, carrier, " +
  SHIPPING_COLUMNS

/**
 * Lista os pedidos de um usuário logado, mais recentes primeiro.
 *
 * Paginado (mesmo padrão de `_shared.ts`) — sem limite, um cliente antigo
 * com muitos pedidos trazia o histórico inteiro toda vez que abria "Meus
 * Pedidos" ou o popover de pedido pendente do miniperfil. Filtros por
 * status/período são opcionais e resolvidos no banco (não em memória) para
 * manter o mesmo custo de query independente do histórico do cliente.
 */
export async function listOrdersByUser(
  userId: string,
  page = 1,
  pageSize = 20,
  filters?: {
    status?: OrderStatus
    dateFrom?: string
    dateTo?: string
    /** Só os pedidos pagos de item físico que ainda estão sem endereço. */
    missingShipping?: boolean
  }
): Promise<{ orders: UserOrderSummary[]; total: number; hasMore: boolean }> {
  const db = createSupabaseAdminClient()
  const currentPage = clampPage(page)
  const size = clampPageSize(pageSize, 50, 20)
  let query = db
    .from("store_orders")
    .select(ORDER_COLUMNS, { count: "exact" })
    .eq("metadata->>user_id", userId)
    // O cliente nunca vê pedido de sandbox — para ele aquilo nunca existiu.
    .eq("is_sandbox", false)

  if (filters?.status) query = query.eq("status", filters.status)
  if (filters?.dateFrom) query = query.gte("created_at", filters.dateFrom)
  if (filters?.dateTo) query = query.lte("created_at", filters.dateTo)
  // Casa com o índice parcial `store_orders_missing_shipping_idx` — mesmas
  // três condições, na mesma ordem.
  if (filters?.missingShipping) {
    query = query
      .is("shipping_address_filled_at", null)
      .eq("requires_shipping_address", true)
      .in("status", ["paid", "awaiting_shipping_info"])
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(...rangeFor(currentPage, size))

  if (error) {
    console.error("[orders-repository] listOrdersByUser:", error)
    return { orders: [], total: 0, hasMore: false }
  }
  const total = count ?? 0
  return {
    orders: (data ?? []).map(toUserOrderSummary),
    total,
    hasMore: currentPage * size < total,
  }
}

/**
 * Converte a linha crua (colunas `shipping_*` achatadas) no formato que as
 * telas consomem, com o endereço já colapsado em um objeto só.
 */
function toUserOrderSummary(row: unknown): UserOrderSummary {
  const raw = row as UserOrderSummary & RawShippingColumns
  return {
    ...raw,
    shipping_address: mapShippingAddress(raw),
    // Pedidos anteriores à coluna são físicos por definição (a loja só
    // vendia produto físico até então) — daí o `!== false`, não `=== true`.
    requires_shipping_address: raw.requires_shipping_address !== false,
  }
}

/** Pedido pendente mais recente do usuário — usado no popover do miniperfil. */
export async function getLatestPendingOrderByUser(userId: string): Promise<UserOrderSummary | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_orders")
    .select(ORDER_COLUMNS)
    .eq("metadata->>user_id", userId)
    .eq("is_sandbox", false)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[orders-repository] getLatestPendingOrderByUser:", error)
    return null
  }
  return data ? toUserOrderSummary(data) : null
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/**
 * Pedido pago depois de expirar cujo estoque não pôde ser re-reservado (o
 * item esgotou no intervalo). Gravado por `reReserveStockForLatePayment`;
 * exige ação manual: repor o estoque ou estornar o pagamento.
 */
export type OrderOversoldFlag = {
  reason: string
  items: string[]
  detected_at: string
}

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
  asaas_payment_id: string | null
  /** Presente quando o pedido foi feito por um usuário logado (metadata.user_id). */
  user_id: string | null
  user_display_name: string | null
  /** Não-nulo = vendido sem estoque, precisa de intervenção manual. */
  oversold: OrderOversoldFlag | null
  /** Para onde despachar. Null = o cliente ainda não informou (fluxo awaiting_shipping_info). */
  shipping_address: OrderShippingAddress | null
  /** false = pedido de serviço/digital: não entra na fila de "falta endereço". */
  requires_shipping_address: boolean
  /** true = pagamento de teste (ASAAS_ENV=sandbox). Marcado na linha da fila. */
  is_sandbox: boolean
}

const ADMIN_ORDER_COLUMNS =
  "id, status, total_cents, items, created_at, updated_at, payment_method, customer_name, customer_email, metadata, tracking_code, carrier, shipped_at, delivered_at, refunded_cents, refund_reason, refunded_at, asaas_payment_id, is_sandbox, " +
  SHIPPING_COLUMNS

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
  is_sandbox: boolean
} & RawShippingColumns

export type AdminOrderListResult = {
  orders: AdminOrderRow[]
  total: number
}

/**
 * Fila de pedidos para o admin, com filtros opcionais por status, produto
 * (id presente em `items`), usuário (busca livre em nome/e-mail — cobre
 * tanto convidado quanto logado, já que `customer_name`/`customer_email`
 * são gravados no checkout independente de login), usuário logado específico
 * (`metadata->>user_id`), período (`created_at`) e ambiente do gateway
 * (`is_sandbox`). Pagina no banco.
 */
export async function listOrdersForAdmin(filters?: {
  status?: OrderStatus
  productId?: string
  userQuery?: string
  userId?: string
  dateFrom?: string
  dateTo?: string
  /** Fila operacional: pagos, de item físico, ainda sem endereço informado. */
  missingShipping?: boolean
  /** Recorte de ambiente do gateway. Sem valor = só produção. */
  environment?: OrderEnvironment
  page?: number
  pageSize?: number
}): Promise<AdminOrderListResult> {
  const db = createSupabaseAdminClient()
  let query = withEnvironment(
    db
      .from("store_orders")
      .select(ADMIN_ORDER_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false }),
    filters?.environment ?? "production"
  )

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
  // Casa com o índice parcial `store_orders_missing_shipping_idx` — mesmas
  // três condições, na mesma ordem.
  if (filters?.missingShipping) {
    query = query
      .is("shipping_address_filled_at", null)
      .eq("requires_shipping_address", true)
      .in("status", ["paid", "awaiting_shipping_info"])
  }

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
      asaas_payment_id: row.asaas_payment_id,
      user_id: userId,
      user_display_name: userId ? profiles[userId]?.display_name ?? null : null,
      oversold: (row.metadata?.oversold as OrderOversoldFlag | undefined) ?? null,
      shipping_address: mapShippingAddress(row),
      requires_shipping_address: row.requires_shipping_address !== false,
      is_sandbox: row.is_sandbox === true,
    }
  })

  return { orders, total: count ?? orders.length }
}

export type OrderStatusCounts = Record<OrderStatus | "all", number>

/**
 * Contagem de pedidos por status, para os blocos de filtro — sobre a base
 * inteira do ambiente escolhido, sem paginação. O recorte tem que ser o mesmo
 * da lista logo abaixo, senão os números dos blocos não batem com ela. Usa `count_orders_by_status` (group by no
 * Postgres) em vez de trazer uma linha por pedido pro Node: escala com o
 * número de status, não com o total de pedidos.
 */
export async function countOrdersByStatus(
  environment: OrderEnvironment = "production"
): Promise<OrderStatusCounts> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("count_orders_by_status", {
    // `null` = os dois ambientes; a RPC trata assim (ver
    // 20261013000000_store_orders_sandbox_flag.sql).
    p_is_sandbox: environment === "all" ? null : environment === "sandbox",
  })
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
export async function searchOrderCustomers(
  query: string,
  limit = 20,
  environment: OrderEnvironment = "production"
): Promise<OrderCustomer[]> {
  const db = createSupabaseAdminClient()
  // Segue o mesmo recorte da lista: senão o combobox oferece cliente que só
  // comprou em sandbox e filtrar por ele devolve zero pedidos.
  let dbQuery = withEnvironment(
    db
      .from("store_orders")
      .select("customer_name, customer_email, metadata")
      .order("created_at", { ascending: false })
      .limit(500),
    environment
  )

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
    .select(`id, status, metadata, ${SHIPPING_COLUMNS}`)
    .eq("id", id)
    .maybeSingle()

  if (!existing) {
    return { ok: false, error: "Pedido não encontrado.", status: 404 }
  }

  // Pedido de serviço/digital não tem para onde despachar: o checkout
  // descarta qualquer endereço enviado e a rota de endereço o recusa, então
  // ele NUNCA terá `shipping_*` preenchido. Como `shipped` exige endereço
  // (trava logo abaixo) e o fluxo físico obriga a passar por lá para chegar a
  // `delivered`, esse pedido ficaria preso para sempre em
  // `awaiting_shipping_info` — um estado que, ainda por cima, diz aguardar
  // dados de entrega que ele não deve pedir. Por isso ele tem fluxo próprio:
  // do pagamento direto para concluído.
  const requiresShipping = existing.requires_shipping_address !== false
  const flow = requiresShipping ? ORDER_FULFILLMENT_FLOW : ORDER_DIGITAL_FULFILLMENT_FLOW

  // Marcar como enviado sem saber para onde é um erro operacional que só
  // aparece depois, quando o pacote não chega. O admin já não vê o botão
  // nesse caso; aqui é a trava que vale (a UI pode mudar, esta não).
  if (nextStatus === "shipped" && !mapShippingAddress(existing as Partial<RawShippingColumns>)) {
    return {
      ok: false,
      error: "Este pedido não tem endereço de entrega informado — não é possível marcá-lo como enviado.",
      status: 400,
    }
  }

  const currentStatus = existing.status as OrderStatus
  const currentIndex = flow.indexOf(currentStatus)
  const nextIndex = flow.indexOf(nextStatus)

  if (currentIndex === -1) {
    return { ok: false, error: "Este pedido não está no fluxo de pós-venda.", status: 400 }
  }
  if (nextIndex !== currentIndex + 1) {
    return {
      ok: false,
      error: requiresShipping
        ? "Só é possível avançar uma etapa por vez, na ordem do fluxo."
        : "Este pedido não tem entrega — só é possível marcá-lo como concluído.",
      status: 400,
    }
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

  // Discord fica FORA do `if (ownerId)`: um pedido de convidado não tem quem
  // notificar no site, mas a equipe precisa vê-lo no canal igual aos outros.
  await notifyDiscordOrderEvent({ orderId: id, status: nextStatus, actor: "admin" })

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
 * Exige `asaas_payment_id`; pedidos legados sem ele (pagos por gateways
 * anteriores) precisam ser extornados manualmente e só têm o status
 * marcado aqui.
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
      error: "Este pedido não tem cobrança Asaas associada — extorne manualmente e atualize o status.",
      status: 400,
    }
  }

  const remainingCents = existing.total_cents - existing.refunded_cents
  const refundCents = params.valueCents ?? remainingCents
  if (refundCents <= 0 || refundCents > remainingCents) {
    return { ok: false, error: "Valor de extorno inválido para o saldo restante do pedido.", status: 400 }
  }

  const { refundPayment, AsaasError } = await import("@/lib/server/integrations/asaas")
  try {
    await refundPayment(existing.asaas_payment_id, { valueCents: refundCents, description: params.reason })
  } catch (err) {
    console.error("[orders-repository] refundOrder — Asaas:", err)
    // 4xx da Asaas é regra de negócio (saldo insuficiente na conta, cobrança
    // já estornada) — repetir não resolve, então mostramos o motivo dela.
    if (err instanceof AsaasError && err.description) {
      return { ok: false, error: `Asaas recusou o extorno: ${err.description}`, status: 502 }
    }
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

  // Estorno parcial também vai pro Discord — é justamente o caso que some
  // hoje (o pedido continua "pago" e nada avisa que saiu dinheiro). O valor
  // entra em `eventKey` porque dois estornos parciais no mesmo pedido são
  // dois eventos distintos, e a dedup por status sozinha esconderia o segundo.
  await notifyDiscordOrderEvent({
    orderId: id,
    status: isFullRefund ? "refunded" : "partial_refund",
    actor: "admin",
    eventKey: isFullRefund ? undefined : String(newRefundedCents),
    note: params.reason ?? null,
  })

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

/**
 * Cancela um pedido ainda não pago (`pending`), devolvendo o estoque
 * reservado no checkout e, se houver cobrança Asaas associada, removendo-a
 * lá também (`DELETE /payments/{id}` — só vale para cobrança ainda não
 * paga; pedido já pago é extorno, não cancelamento, ver `refundOrder`).
 *
 * Pedidos legados sem `asaas_payment_id` são cancelados só localmente — o
 * PIX gerado simplesmente nunca será pago e expira sozinho no gateway.
 *
 * O UPDATE condicional (`WHERE status = 'pending'`) roda antes da chamada à
 * Asaas e da devolução de estoque, mesmo padrão de `expireStalePendingOrders`:
 * evita cancelar um pedido que acabou de ser pago por um webhook concorrente.
 */
export async function cancelOrder(
  id: string,
  params: { reason?: string },
  adminId?: string | null
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("store_orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id, items, metadata, asaas_payment_id")
    .maybeSingle()

  if (!existing) {
    return { ok: false, error: "Só é possível cancelar um pedido aguardando pagamento.", status: 400 }
  }

  if (existing.asaas_payment_id) {
    const { cancelPayment } = await import("@/lib/server/integrations/asaas")
    try {
      await cancelPayment(existing.asaas_payment_id)
    } catch (err) {
      console.error("[orders-repository] cancelOrder — Asaas:", err)
      // Já marcamos cancelado localmente; a cobrança Asaas fica pendente até
      // expirar sozinha (ou precisa ser removida manualmente no painel) —
      // não deixamos o pedido preso por causa de uma falha no gateway.
    }
  }

  // Pré-venda fica de fora: não teve estoque descontado para devolver.
  const cart = ((existing.items as OrderStockLine[]) ?? []).filter(lineMovesPhysicalStock)
  await Promise.all(
    cart.map((item) =>
      item.variant_id
        ? db.rpc("increment_variant_stock", { p_variant_id: item.variant_id, p_quantity: item.quantity })
        : db.rpc("increment_store_stock", { p_product_id: item.id, p_quantity: item.quantity })
    )
  )

  const ownerId = orderOwnerId(existing.metadata as Record<string, unknown> | null)
  if (ownerId) {
    await notifyOrderStatusChange({ userId: ownerId, orderId: id, status: "cancelled" })
  }

  await notifyDiscordOrderEvent({
    orderId: id,
    status: "cancelled",
    actor: adminId ? "admin" : "cliente",
    note: params.reason ?? null,
  })

  if (adminId) {
    await logAdminAction({
      adminId,
      action: "order.cancel",
      entityType: "store_order",
      entityId: id,
      before: { status: "pending" },
      after: { status: "cancelled", reason: params.reason ?? null },
    })
  }

  return { ok: true }
}

export type ExpireStalePendingOrdersResult = {
  expired_count: number
  stock_restored_count: number
  /** Reservas de estoque sem pedido correspondente devolvidas ao inventário. */
  orphaned_reservations_released: number
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
    .select("id, items, metadata")

  if (error) {
    console.error("[orders-repository] expireStalePendingOrders — update:", error)
    return {
      expired_count: 0,
      stock_restored_count: 0,
      orphaned_reservations_released: 0,
      errors: [error.message],
    }
  }

  const orders = (expiredOrders ?? []) as {
    id: string
    items: Record<string, unknown>[]
    metadata: Record<string, unknown> | null
  }[]

  for (const order of orders) {
    const ownerId = orderOwnerId(order.metadata)
    if (!ownerId) continue
    await notifyOrderStatusChange({ userId: ownerId, orderId: order.id, status: "expired" })
  }

  // Em série, não em paralelo: um lote grande de expirações dispararia
  // dezenas de requisições simultâneas e bateria no rate limit do Discord.
  for (const order of orders) {
    await notifyDiscordOrderEvent({ orderId: order.id, status: "expired", actor: "cron" })
  }

  // Achata (pedido, item) numa lista única e restaura o estoque em paralelo —
  // cada RPC é independente (produto/variante diferentes), então não há
  // motivo pra serializar pedido por pedido, item por item.
  const restoreTasks = orders.flatMap((order) => {
    // Pré-venda não teve estoque descontado — devolver aqui inventaria unidades.
    const cart = (order.items as unknown as OrderStockLine[]).filter(lineMovesPhysicalStock)
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

  // Reservas órfãs: estoque decrementado pelo checkout cuja Function morreu
  // antes de criar o pedido. Não há pedido para o loop acima achar, então
  // sem esta chamada essas unidades ficariam descontadas para sempre. A
  // janela (15 min) é folgada em relação ao `maxDuration = 20s` da rota de
  // checkout — nunca devolve estoque de um request ainda em andamento.
  let orphanedReleased = 0
  const { data: released, error: releaseError } = await db.rpc(
    "release_orphaned_stock_reservations",
    { p_older_than_minutes: 15 }
  )
  if (releaseError) {
    console.error("[orders-repository] release_orphaned_stock_reservations:", releaseError)
    errors.push(releaseError.message)
  } else {
    orphanedReleased = Number(released ?? 0)
    if (orphanedReleased > 0) {
      console.warn(
        `[orders-repository] ${orphanedReleased} reserva(s) órfã(s) de estoque devolvida(s) — checkout interrompido antes de criar o pedido.`
      )
    }
  }

  return {
    expired_count: orders.length,
    stock_restored_count: stockRestoredCount,
    orphaned_reservations_released: orphanedReleased,
    errors,
  }
}

export type ExpireOrderByPaymentResult = {
  /** `false` quando nenhum pedido `pending` casou — já pago, já expirado, ou não é da loja. */
  expired: boolean
  orderId: string | null
  errors: string[]
}

/**
 * Expira UM pedido a partir do id da cobrança no gateway, devolvendo o
 * estoque — versão pontual do que `expireStalePendingOrders` faz em lote.
 *
 * Existe para os webhooks de vencimento/remoção da Asaas
 * (`PAYMENT_OVERDUE`, `PAYMENT_DELETED`): esperar o cron significaria até 15
 * min com o estoque preso e o cliente vendo um QR code morto na tela. Aqui a
 * própria origem já avisou que a cobrança não é mais pagável.
 *
 * Mesma proteção de corrida do cron, e ela é o ponto central desta função: o
 * `.eq("status", "pending")` faz parte do UPDATE, então quem decide se o
 * estoque volta é o banco, não uma leitura anterior. Se um webhook de
 * pagamento marcou o pedido como `paid` no mesmo instante, o UPDATE não
 * afeta nenhuma linha e nada é devolvido ao inventário.
 */
export async function expireOrderByPaymentId(
  paymentId: string
): Promise<ExpireOrderByPaymentResult> {
  const db = createSupabaseAdminClient()

  const { data: expiredOrders, error } = await db
    .from("store_orders")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("asaas_payment_id", paymentId)
    .eq("status", "pending")
    .select("id, items, metadata")

  if (error) {
    console.error("[orders-repository] expireOrderByPaymentId — update:", error)
    return { expired: false, orderId: null, errors: [error.message] }
  }

  const order = (expiredOrders ?? [])[0] as
    | { id: string; items: Record<string, unknown>[]; metadata: Record<string, unknown> | null }
    | undefined

  if (!order) return { expired: false, orderId: null, errors: [] }

  const ownerId = orderOwnerId(order.metadata)
  if (ownerId) {
    await notifyOrderStatusChange({ userId: ownerId, orderId: order.id, status: "expired" })
  }

  await notifyDiscordOrderEvent({ orderId: order.id, status: "expired", actor: "webhook-asaas" })

  // Pré-venda não teve estoque descontado — devolver aqui inventaria unidades.
  const cart = ((order.items ?? []) as unknown as OrderStockLine[]).filter(lineMovesPhysicalStock)

  const results = await Promise.all(
    cart.map(async (item) => {
      const { data: restored } = item.variant_id
        ? await db.rpc("increment_variant_stock", {
            p_variant_id: item.variant_id,
            p_quantity: item.quantity,
          })
        : await db.rpc("increment_store_stock", {
            p_product_id: item.id,
            p_quantity: item.quantity,
          })
      return { item, restored: Boolean(restored) }
    })
  )

  const errors: string[] = []
  for (const { item, restored } of results) {
    if (restored) continue
    const message = `Falha ao devolver estoque do pedido expirado ${order.id} (item ${item.variant_id ?? item.id})`
    console.error("[orders-repository] expireOrderByPaymentId —", message)
    errors.push(message)
  }

  return { expired: true, orderId: order.id, errors }
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
/**
 * Re-reserva o estoque de um pedido que foi pago DEPOIS de já ter expirado.
 *
 * Janela real: o cron de expiração devolve o estoque ao inventário, mas o
 * gateway ainda pode confirmar um PIX pago pouco antes do vencimento (ou
 * reentregar o webhook atrasado). Sem isso o pedido vira `paid` com as
 * unidades de volta na prateleira — a loja vende o mesmo item duas vezes.
 *
 * Quando o item já esgotou nesse meio tempo o decremento falha (a RPC é
 * atômica e recusa estoque insuficiente): aí o pedido é sinalizado para
 * revisão manual em vez de mentir sobre o estoque — o dinheiro entrou e
 * alguém precisa decidir entre repor ou estornar.
 */
export async function reReserveStockForLatePayment(orderId: string): Promise<{
  restocked: boolean
  oversoldItems: string[]
}> {
  const db = createSupabaseAdminClient()

  const { data: order } = await db
    .from("store_orders")
    .select("items, metadata")
    .eq("id", orderId)
    .single()

  // Pré-venda nunca reservou estoque físico: re-reservar aqui descontaria
  // unidades que a compra não segurava, e uma falha marcaria o pedido como
  // oversold sem que nada tenha sido vendido duas vezes.
  const cart = ((order?.items ?? []) as unknown as OrderStockLine[]).filter(lineMovesPhysicalStock)

  const results = await Promise.all(
    cart.map(async (item) => {
      const { data: ok } = item.variant_id
        ? await db.rpc("decrement_variant_stock", {
            p_variant_id: item.variant_id,
            p_quantity: item.quantity,
          })
        : await db.rpc("decrement_store_stock", {
            p_product_id: item.id,
            p_quantity: item.quantity,
          })
      return { item, ok: Boolean(ok) }
    })
  )

  const oversoldItems = results.filter((r) => !r.ok).map((r) => r.item.variant_id ?? r.item.id)

  if (oversoldItems.length > 0) {
    console.error(
      `[orders-repository] reReserveStockForLatePayment — pedido ${orderId} pago após expirar, sem estoque para: ${oversoldItems.join(", ")}`
    )

    // Sinaliza no próprio pedido para o admin agir (repor ou estornar) sem
    // depender de alguém ler o log do servidor. Vai em `metadata` porque o
    // admin já carrega essa coluna — nenhuma migration nem coluna nova.
    const metadata = (order?.metadata ?? {}) as Record<string, unknown>
    const { error: flagError } = await db
      .from("store_orders")
      .update({
        metadata: {
          ...metadata,
          oversold: {
            reason: "late_payment_after_expiry",
            items: oversoldItems,
            detected_at: new Date().toISOString(),
          },
        },
      })
      .eq("id", orderId)
    if (flagError) {
      console.error("[orders-repository] reReserveStockForLatePayment — flag:", flagError)
    }
  }

  return { restocked: oversoldItems.length === 0, oversoldItems }
}

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
    await notifyDiscordOrderEvent({
      orderId: existing.id,
      status: update.status,
      actor: "webhook-asaas",
      eventKey: String(refundedCents),
    })
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

/**
 * Estados em que o dono do pedido ainda pode informar/corrigir o endereço de
 * entrega. Depois de `shipped` a etiqueta já foi gerada — mudar o destino
 * aqui só criaria divergência entre o que o cliente vê e para onde o pacote
 * foi; nesse ponto o caminho é o suporte, não a auto-edição.
 */
const SHIPPING_EDITABLE_STATUSES: OrderStatus[] = ["pending", "paid", "awaiting_shipping_info"]

/**
 * Grava o endereço de entrega de um pedido — chamada tanto pelo checkout
 * (via insert direto, não por aqui) quanto pela tela "Meus Pedidos" quando o
 * cliente pulou o preenchimento e o pedido já foi pago.
 *
 * Autorização: exige o `userId` do dono e filtra por `metadata->>user_id` no
 * próprio UPDATE. Não basta checar antes e gravar depois — o filtro no
 * comando é o que impede que um id de pedido adivinhado/vazado seja
 * sobrescrito por outra conta.
 *
 * Efeito colateral deliberado: um pedido `paid` que ganha endereço avança
 * para `awaiting_shipping_info` — é exatamente o significado desse status na
 * fila do admin ("tem endereço, falta despachar"). Pedido ainda `pending`
 * não muda de status: o pagamento é que manda.
 */
export async function setOrderShippingAddress(
  orderId: string,
  userId: string,
  address: {
    recipient: string
    phone: string
    postalCode: string
    street: string
    number: string
    complement?: string | null
    neighborhood: string
    city: string
    state: string
  }
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("store_orders")
    .select("id, status, metadata, requires_shipping_address")
    .eq("id", orderId)
    .eq("metadata->>user_id", userId)
    .maybeSingle()

  // Mesma resposta para "não existe" e "não é seu": responder 403 aqui
  // confirmaria a existência de um pedido de outra pessoa.
  if (!existing) {
    return { ok: false, error: "Pedido não encontrado.", status: 404 }
  }

  // Pedido só de serviço/digital não tem para onde despachar — aceitar um
  // endereço aqui só guardaria PII que nada consome (LGPD Art. 6, III).
  if (existing.requires_shipping_address === false) {
    return {
      ok: false,
      error: "Este pedido não precisa de endereço de entrega.",
      status: 400,
    }
  }

  const currentStatus = existing.status as OrderStatus
  if (!SHIPPING_EDITABLE_STATUSES.includes(currentStatus)) {
    return {
      ok: false,
      error:
        currentStatus === "shipped" || currentStatus === "delivered"
          ? "Este pedido já foi despachado — fale com o suporte para alterar o endereço."
          : "Não é possível informar endereço para este pedido.",
      status: 400,
    }
  }

  const update: Database["public"]["Tables"]["store_orders"]["Update"] = {
    shipping_recipient: address.recipient,
    shipping_phone: address.phone,
    shipping_postal_code: address.postalCode,
    shipping_street: address.street,
    shipping_number: address.number,
    shipping_complement: address.complement ?? null,
    shipping_neighborhood: address.neighborhood,
    shipping_city: address.city,
    shipping_state: address.state,
    shipping_address_filled_at: new Date().toISOString(),
  }
  if (currentStatus === "paid") update.status = "awaiting_shipping_info"

  const { error } = await db
    .from("store_orders")
    .update(update)
    .eq("id", orderId)
    .eq("metadata->>user_id", userId)

  if (error) {
    console.error("[orders-repository] setOrderShippingAddress:", error)
    return { ok: false, error: "Não foi possível salvar o endereço de entrega.", status: 500 }
  }

  if (update.status) {
    await notifyOrderStatusChange({
      userId,
      orderId,
      status: "awaiting_shipping_info",
    })
    // O card do Discord recarrega o pedido do banco, então já sai com o
    // endereço que acabou de ser gravado — é exatamente o que o admin
    // precisa ver para postar o pacote.
    await notifyDiscordOrderEvent({
      orderId,
      status: "awaiting_shipping_info",
      actor: "cliente",
    })
  }

  return { ok: true }
}

/** Linha de carrinho reconstruída a partir de um pedido anterior. */
export type ReorderItem = {
  productId: string
  variantId: string | null
  variantOptionIds: string[]
  quantity: number
  /** Nome/slug/preço ATUAIS — o snapshot do pedido pode estar velho. */
  slug: string
  name: string
  priceCents: number
  image: string | null
  stock: number | null
  available: boolean
}

/**
 * Reconstrói o carrinho de um pedido para recompra.
 *
 * O snapshot em `store_orders.items` guarda o que foi comprado, mas não serve
 * como carrinho sozinho: falta o `slug` (a rota do produto) e o preço pode ter
 * mudado. Por isso cada linha é re-resolvida contra o catálogo — o que
 * desapareceu volta marcado como indisponível, em vez de sumir em silêncio.
 */
export async function getOrderItemsForReorder(
  orderId: string,
  userId: string
): Promise<
  | { ok: true; items: ReorderItem[] }
  | { ok: false; error: string; status: number }
> {
  const db = createSupabaseAdminClient()

  const { data: order } = await db
    .from("store_orders")
    .select("id, items, metadata")
    .eq("id", orderId)
    .maybeSingle()

  if (!order || orderOwnerId(order.metadata as Record<string, unknown> | null) !== userId) {
    // Mesma resposta para "não existe" e "não é seu": não confirma a
    // existência de um pedido de outra pessoa.
    return { ok: false, error: "Pedido não encontrado.", status: 404 }
  }

  const items = (order.items ?? []) as Array<{
    id?: string
    quantity?: number
    variant_id?: string | null
    variant_options?: { group: string; label: string }[] | null
  }>

  const productIds = [
    ...new Set(items.map((i) => i.id).filter((id): id is string => typeof id === "string")),
  ]
  if (productIds.length === 0) return { ok: true, items: [] }

  const { data: products } = await db
    .from("store_products")
    .select("id, slug, name, price_cents, promo_price_cents, stock, images, is_active, is_sold_out")
    .in("id", productIds)

  const reorderItems: ReorderItem[] = []
  for (const item of items) {
    if (!item.id) continue
    const product = (products ?? []).find((p) => p.id === item.id)
    if (!product) continue

    const { effectiveCents } = computeEffectivePrice(product, null)
    reorderItems.push({
      productId: product.id,
      variantId: item.variant_id ?? null,
      // As opções de variante são gravadas por rótulo no snapshot (é o que a
      // tela do pedido mostra), não por id — então a recompra reabre a linha
      // sem elas e a pessoa escolhe de novo na página do produto, que é onde
      // a combinação válida é conhecida.
      variantOptionIds: [],
      quantity: item.quantity ?? 1,
      slug: product.slug,
      name: product.name,
      priceCents: effectiveCents,
      image: product.images?.[0] ?? null,
      stock: product.stock,
      available: product.is_active && !product.is_sold_out,
    })
  }

  return { ok: true, items: reorderItems }
}
