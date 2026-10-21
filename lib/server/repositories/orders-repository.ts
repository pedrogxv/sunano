import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import type { Database } from "@/lib/database.types"
import { getUserProfiles } from "@/lib/server/repositories/users-repository"
import { notifyOrderStatusChange, notifyOrderTrackingUpdated } from "@/lib/server/repositories/notifications-repository"
import { notifyDiscordOrderEvent } from "@/lib/server/repositories/discord-orders-repository"
import { sendOrderEmail } from "@/lib/server/repositories/order-emails-repository"
import { syncCommissionForRefund } from "@/lib/server/repositories/affiliates-repository"
import { logAdminAction } from "@/lib/server/repositories/store-admin-audit-repository"
import {
  clampPage,
  clampPageSize,
  escapeLikePattern,
  escapeOrFilterValue,
  isMissingDbFunction,
  rangeFor,
} from "@/lib/server/repositories/_shared"
import { acquireLease } from "@/lib/server/lease"
import { computeEffectivePrice } from "@/lib/store-pricing"
import { getSelectionRulesForCheckout } from "@/lib/server/repositories/store-repository"
import { patchOrderMetadata } from "@/lib/server/repositories/order-metadata-repository"
import { stripeReceiptUrlOf } from "@/lib/stripe-receipt"
import { TRACKING_EDITABLE_STATUSES } from "@/lib/order-status"
import { readServiceFormAnswers, type OrderServiceFormAnswers } from "@/lib/store-service-form"
import { signServiceFormAnswerImages } from "@/lib/server/service-form-media"
import { getComplementSummaries } from "@/lib/server/repositories/order-complement-repository"
import { orderNumber } from "@/lib/order-number"
import type { OrderComplementSummary } from "@/lib/store-payment-complement"
import { deployChargesInSandbox } from "@/lib/server/payments/gateway"
import type { OrderPaymentSourceFilter, PaymentGateway } from "@/lib/payment-gateways"
import {
  shippingAddressColumns,
  type ShippingAddressInput,
} from "@/lib/server/validation/shipping-address"

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
 * Recorte por tipo de pedido na fila do admin. Espelha o snapshot
 * `requires_shipping_address`: "product" = tem algo para despachar,
 * "service" = serviço/digital, sem entrega. Pedido misto (um item físico e um
 * serviço) é "product", porque ainda tem pacote a enviar.
 */
export type OrderKind = "all" | "product" | "service"

export const ORDER_KINDS: OrderKind[] = ["all", "product", "service"]

/** Normaliza um valor vindo de query string no recorte de tipo. */
export function parseOrderKind(value: string | null | undefined): OrderKind {
  return ORDER_KINDS.includes(value as OrderKind) ? (value as OrderKind) : "all"
}

/** `requires_shipping_address` que corresponde ao tipo, ou null para "todos". */
function requiresShippingFor(kind: OrderKind): boolean | null {
  if (kind === "all") return null
  return kind === "product"
}

/**
 * Como cada gateway se reconhece numa linha de `store_orders`. Mesma regra de
 * `orderPaymentGateway` (lib/payment-gateways.ts), escrita como filtro do
 * PostgREST para recortar no banco. É `Record<PaymentGateway, …>` de
 * propósito: gateway novo não compila até ganhar o seu ramo aqui.
 *
 * Asaas é o "resto": sem referência de Stripe e não pago com Aura (inclui os
 * legados de gateways que já saíram, como o `orderPaymentGateway`).
 */
type OrderFilterQuery<T> = {
  eq: (col: string, val: unknown) => T
  is: (col: string, val: null) => T
  or: (filters: string) => T
}

const GATEWAY_ORDER_FILTER: Record<PaymentGateway, <T extends OrderFilterQuery<T>>(query: T) => T> = {
  stripe: (query) => query.or("stripe_payment_intent_id.not.is.null,stripe_session_id.not.is.null"),
  mercadopago: (query) => query.eq("payment_gateway", "mercadopago"),
  infinitepay: (query) => query.eq("payment_gateway", "infinitepay"),
  asaas: (query) =>
    query
      .is("stripe_payment_intent_id", null)
      .is("stripe_session_id", null)
      // `payment_method` e `payment_gateway` aceitam null; `neq` sozinho
      // descartaria essas linhas. Um `.or()` só: dois no mesmo request não
      // se combinam como se espera.
      .or(
        "payment_method.is.null,and(payment_method.neq.aura,or(payment_gateway.is.null,payment_gateway.not.in.(mercadopago,infinitepay)))"
      ),
}

/** Recorte por gateway (ou Aura) numa query de `store_orders`. */
function withPaymentSource<T>(query: T, source: OrderPaymentSourceFilter): T {
  if (source === "all") return query
  const q = query as unknown as OrderFilterQuery<T>
  if (source === "aura") return q.eq("payment_method", "aura")
  return GATEWAY_ORDER_FILTER[source](q as never) as T
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

/**
 * Sequência do fluxo pós-venda de produto físico: só avança, nunca pula etapa.
 *
 * Os dois primeiros degraus não são do admin: o trigger
 * `trg_store_orders_shipping_stage` (20261206000002) põe o pedido pago em
 * `awaiting_shipping_info` enquanto falta endereço e em `paid` ("Pedido
 * feito") quando o endereço existe. O admin só dá `shipped` e `delivered`, e
 * o cliente também pode dar `delivered` ("Já recebi").
 */
export const ORDER_FULFILLMENT_FLOW: OrderStatus[] = [
  "awaiting_shipping_info",
  "paid",
  "shipped",
  "delivered",
]

/** Etapas que o admin marca na mão. As anteriores são decididas pelo endereço. */
export const ADMIN_ADVANCE_STATUSES = ["shipped", "delivered"] as const satisfies readonly OrderStatus[]

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
  /** Combinação (SKU) do item, quando havia uma. */
  sku_id?: string | null
  /** true = o estoque descontado foi o da combinação, não o da cor/produto. */
  sku_stock?: boolean | null
}

/** Uma movimentação de estoque: de onde a unidade saiu (ou para onde volta). */
export type StockMovement = {
  productId: string
  variantId: string | null
  /** Preenchido só quando o estoque que se mexe é o da combinação. */
  skuId: string | null
  quantity: number
}

/** De onde o item do pedido tirou estoque no checkout. */
export function orderLineStockMovement(item: OrderStockLine): StockMovement {
  return {
    productId: item.id,
    variantId: item.variant_id ?? null,
    skuId: item.sku_stock ? item.sku_id ?? null : null,
    quantity: item.quantity,
  }
}

type StockDb = ReturnType<typeof createSupabaseAdminClient>

/**
 * Devolve unidades ao estoque de onde saíram: a combinação, a cor ou o
 * produto. Todo caminho que desfaz uma venda (cancelamento, expiração,
 * reembolso, checkout que falhou) passa por aqui, para a combinação não
 * perder unidade para a cor quando o pedido volta.
 */
export async function restoreStock(db: StockDb, line: StockMovement): Promise<boolean> {
  const { data } = line.skuId
    ? await db.rpc("increment_sku_stock", { p_sku_id: line.skuId, p_quantity: line.quantity })
    : line.variantId
      ? await db.rpc("increment_variant_stock", { p_variant_id: line.variantId, p_quantity: line.quantity })
      : await db.rpc("increment_store_stock", { p_product_id: line.productId, p_quantity: line.quantity })
  return Boolean(data)
}

/** Desconta unidades (RPC atômica: falha, sem mexer, se não couber). Par de `restoreStock`. */
export async function takeStock(db: StockDb, line: StockMovement): Promise<boolean> {
  const { data } = line.skuId
    ? await db.rpc("decrement_sku_stock", { p_sku_id: line.skuId, p_quantity: line.quantity })
    : line.variantId
      ? await db.rpc("decrement_variant_stock", { p_variant_id: line.variantId, p_quantity: line.quantity })
      : await db.rpc("decrement_store_stock", { p_product_id: line.productId, p_quantity: line.quantity })
  return Boolean(data)
}

export type StockReservation =
  | { ok: true; /** Estoque que sobrou; `null` = sem controle de estoque. */ remaining: number | null }
  | { ok: false }

/**
 * Reserva do checkout: desconta o estoque E grava a linha no diário
 * (`store_stock_reservations`) na mesma transação (`reserve_store_stock`).
 *
 * Eram dois comandos (`takeStock` e depois o insert do diário): a Function
 * que morresse entre eles deixava a unidade descontada sem registro nenhum,
 * fora da prateleira para sempre. Desfazer é `releaseReservationGroup`.
 */
export async function reserveStock(
  db: StockDb,
  reservationGroup: string,
  line: StockMovement
): Promise<StockReservation> {
  const { data, error } = await db.rpc("reserve_store_stock", {
    p_reservation_group: reservationGroup,
    p_product_id: line.productId,
    p_variant_id: line.variantId,
    p_sku_id: line.skuId,
    p_quantity: line.quantity,
  })

  if (isMissingDbFunction(error)) return reserveStockLegacy(db, reservationGroup, line)
  if (error) throw new Error(`reserve_store_stock: ${error.message}`)
  return data?.ok ? { ok: true, remaining: data.remaining ?? null } : { ok: false }
}

/** Caminho anterior, só enquanto a migration 20270101000000 não estiver aplicada. Remover depois. */
async function reserveStockLegacy(db: StockDb, reservationGroup: string, line: StockMovement): Promise<StockReservation> {
  if (!(await takeStock(db, line))) return { ok: false }
  const { error } = await db.from("store_stock_reservations").insert({
    reservation_group: reservationGroup,
    product_id: line.productId,
    variant_id: line.variantId,
    ...(line.skuId ? { sku_id: line.skuId } : {}),
    quantity: line.quantity,
  })
  if (error) console.error("[orders-repository] reserva sem diário (fallback):", error)
  return { ok: true, remaining: null }
}

/**
 * Desfaz uma reserva inteira do checkout — diário E estoque, na mesma
 * transação (`release_stock_reservation_group`). Vale também para as linhas
 * de pré-venda (`reserve_preorder`), que só saem do diário.
 *
 * Só serve ENQUANTO o diário ainda tem a reserva (antes do pedido existir).
 * Depois de `confirmReservations` o pedido é que segura o estoque, e
 * devolver é `restoreStock` por linha.
 *
 * `legacyLines` é o caminho de antes da migration 20270101000000: apaga o
 * diário e devolve linha a linha. Remover junto com o fallback.
 */
export async function releaseReservationGroup(
  db: StockDb,
  reservationGroup: string,
  legacyLines: StockMovement[]
): Promise<void> {
  const { error } = await db.rpc("release_stock_reservation_group", { p_reservation_group: reservationGroup })
  if (!error) return
  if (!isMissingDbFunction(error)) {
    // As linhas seguem no diário: o cron as devolve em 15 min. Não há o que
    // repetir aqui sem arriscar devolver duas vezes.
    console.error("[orders-repository] release_stock_reservation_group:", reservationGroup, error)
    return
  }

  await db.from("store_stock_reservations").delete().eq("reservation_group", reservationGroup)
  await Promise.all(
    legacyLines.map(async (line) => {
      try {
        await restoreStock(db, line)
      } catch (err) {
        console.error("[orders-repository] falha ao reverter reserva de estoque:", line, err)
      }
    })
  )
}

type ReleasedOrder = {
  id: string
  metadata: Record<string, unknown> | null
  items: Record<string, unknown>[]
  asaas_payment_id: string | null
  asaas_checkout_id: string | null
  stripe_payment_intent_id: string | null
  payment_gateway: string | null
}

/**
 * Tira pedidos de `pending` (para `expired` ou `cancelled`) e devolve o
 * estoque dos itens na MESMA transação (`release_pending_store_orders`).
 *
 * Antes eram dois passos: o UPDATE de status e depois um RPC de estoque por
 * item. A Function que morresse no meio (o cron tem 30 s, e um lote grande de
 * expirações cabia mal nisso) deixava pedidos expirados com as unidades fora
 * da prateleira para sempre — nada mais olhava para eles.
 *
 * Só volta o que AINDA estava pendente no momento da escrita: um pedido pago
 * por um webhook concorrente fica de fora e nada dele é devolvido.
 */
async function releasePendingOrders(
  db: StockDb,
  orderIds: string[],
  toStatus: "expired" | "cancelled"
): Promise<{ orders: ReleasedOrder[]; error: string | null }> {
  if (orderIds.length === 0) return { orders: [], error: null }

  const { data, error } = await db.rpc("release_pending_store_orders", {
    p_order_ids: orderIds,
    p_to_status: toStatus,
  })

  if (isMissingDbFunction(error)) return releasePendingOrdersLegacy(db, orderIds, toStatus)
  if (error) return { orders: [], error: error.message }

  return {
    orders: (data ?? []).map((row) => ({
      id: row.order_id,
      metadata: row.order_metadata,
      items: Array.isArray(row.order_items) ? row.order_items : [],
      asaas_payment_id: row.order_asaas_payment_id,
      asaas_checkout_id: row.order_asaas_checkout_id,
      stripe_payment_intent_id: row.order_stripe_payment_intent_id,
      payment_gateway: row.order_payment_gateway,
    })),
    error: null,
  }
}

/** Caminho anterior (status e estoque em passos separados). Remover junto com o fallback. */
async function releasePendingOrdersLegacy(
  db: StockDb,
  orderIds: string[],
  toStatus: "expired" | "cancelled"
): Promise<{ orders: ReleasedOrder[]; error: string | null }> {
  const { data, error } = await db
    .from("store_orders")
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .in("id", orderIds)
    .eq("status", "pending")
    .select("id, items, metadata, asaas_payment_id, asaas_checkout_id, stripe_payment_intent_id, payment_gateway")
  if (error) return { orders: [], error: error.message }

  const orders = (data ?? []) as unknown as ReleasedOrder[]
  await Promise.all(
    orders.flatMap((order) =>
      ((order.items ?? []) as unknown as OrderStockLine[])
        .filter(lineMovesPhysicalStock)
        .map((item) => restoreStock(db, orderLineStockMovement(item)))
    )
  )
  return { orders, error: null }
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
  /**
   * CPF, nascimento ("AAAA-MM-DD") e tipo de residência de quem recebe,
   * exigidos na importação. Nulos em pedido gravado antes de cada campo
   * existir: o endereço continua valendo para despachar, só falta esse dado
   * para o que vem de fora.
   */
  cpf: string | null
  birth_date: string | null
  residence_type: "house" | "apartment" | null
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
  shipping_cpf: string | null
  shipping_birth_date: string | null
  shipping_residence_type: string | null
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
  "shipping_recipient, shipping_cpf, shipping_birth_date, shipping_residence_type, shipping_phone, shipping_postal_code, shipping_street, shipping_number, shipping_complement, shipping_neighborhood, shipping_city, shipping_state, shipping_address_filled_at, requires_shipping_address"

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
    cpf: row.shipping_cpf ?? null,
    birth_date: row.shipping_birth_date ?? null,
    residence_type:
      row.shipping_residence_type === "house" || row.shipping_residence_type === "apartment"
        ? row.shipping_residence_type
        : null,
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

/** Comprovante de um pedido pago pelo Stripe (o webhook guarda no metadata). */
export function orderStripeReceiptUrl(metadata: Record<string, unknown> | null | undefined): string | null {
  return stripeReceiptUrlOf(metadata)
}

export type UserOrderSummary = {
  id: string
  status: OrderStatus
  total_cents: number
  items: Record<string, unknown>[]
  created_at: string
  payment_method: string | null
  /** Não-nulo = pedido pago com Aura (resgate de produto físico da Central). */
  aura_cost_paid: number | null
  asaas_payment_id: string | null
  asaas_receipt_url: string | null
  pix_copy_paste: string | null
  pix_qr_code_base64: string | null
  tracking_code: string | null
  carrier: string | null
  shipping_address: OrderShippingAddress | null
  /** false = pedido de serviço/digital: não pede endereço em lugar nenhum. */
  requires_shipping_address: boolean
  /** Formulário pós-compra de serviço já preenchido. Null = ainda não (ou o pedido não tem). */
  service_form_answers: OrderServiceFormAnswers | null
  /** Complemento de Pagamento cobrado neste pedido. `dueCents` null = nada cobrado. */
  complement: OrderComplementSummary
  /** Este pedido É o pagamento de complemento do pedido indicado. */
  complement_for: OrderComplementTarget | null
  /** Prazo da loja para pagar um pedido `pending` (coluna `pix_expires_at`, que vale para todo método). */
  payment_expires_at: string | null
}

/** O pedido original de um pagamento de complemento. */
export type OrderComplementTarget = { order_id: string; order_number: string }

const ORDER_COLUMNS =
  "id, status, total_cents, items, created_at, payment_method, aura_cost_paid, asaas_payment_id, asaas_receipt_url, stripe_payment_intent_id, metadata, pix_expires_at, pix_copy_paste, pix_qr_code_base64, tracking_code, carrier, service_form_answers, complement_due_cents, complement_note, complement_for_order_id, " +
  SHIPPING_COLUMNS

type ComplementColumns = {
  id: string
  complement_due_cents: number | null
  complement_note: string | null
  complement_for_order_id: string | null
}

function complementTargetOf(row: Pick<ComplementColumns, "complement_for_order_id">): OrderComplementTarget | null {
  const targetId = row.complement_for_order_id
  return targetId ? { order_id: targetId, order_number: orderNumber(targetId) } : null
}

/**
 * Leitura que acompanha toda listagem de pedido: o complemento de cada um (em
 * lote, uma consulta para a página) e as fotos do formulário de serviço,
 * re-assinadas (o bucket é privado). Obrigatório nos dois lados, cliente e
 * admin, para nenhuma tela mostrar um pedido "quitado" que ainda deve.
 */
async function withComplementAndMedia<T extends { id: string; service_form_answers: OrderServiceFormAnswers | null }>(
  orders: T[],
  rows: ComplementColumns[]
): Promise<(T & { complement: OrderComplementSummary; complement_for: OrderComplementTarget | null })[]> {
  const summaries = await getComplementSummaries(rows)
  const rowById = new Map(rows.map((row) => [row.id, row]))
  return Promise.all(
    orders.map(async (order) => ({
      ...order,
      service_form_answers: await signServiceFormAnswerImages(order.service_form_answers),
      complement: summaries.get(order.id)!,
      complement_for: complementTargetOf(rowById.get(order.id) ?? { complement_for_order_id: null }),
    }))
  )
}

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
    // Pedido de sandbox não existe para o cliente — exceto no deploy que
    // cobra em sandbox (localhost/preview), onde todo pedido é de teste.
    .eq("is_sandbox", deployChargesInSandbox())

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
  const rows = (data ?? []) as unknown as ComplementColumns[]
  return {
    orders: await withComplementAndMedia(rows.map(toUserOrderSummaryBase), rows),
    total,
    hasMore: currentPage * size < total,
  }
}

/**
 * Converte a linha crua (colunas `shipping_*` achatadas) no formato que as
 * telas consomem, com o endereço já colapsado em um objeto só.
 */
function toUserOrderSummaryBase(row: unknown): Omit<UserOrderSummary, "complement" | "complement_for"> {
  const {
    stripe_payment_intent_id: stripePaymentIntentId,
    metadata,
    pix_expires_at: paymentExpiresAt,
    ...raw
  } = row as Omit<UserOrderSummary, "complement" | "complement_for" | "payment_expires_at"> &
    RawShippingColumns & {
      stripe_payment_intent_id: string | null
      metadata: Record<string, unknown> | null
      pix_expires_at: string | null
    }
  return {
    ...raw,
    payment_expires_at: paymentExpiresAt,
    // Pedido do Stripe: a cobrança e o comprovante entram nos mesmos campos
    // que a tela já mostra. `metadata` não vai para o cliente.
    asaas_payment_id: raw.asaas_payment_id ?? stripePaymentIntentId,
    asaas_receipt_url: raw.asaas_receipt_url ?? orderStripeReceiptUrl(metadata),
    shipping_address: mapShippingAddress(raw),
    // Pedidos anteriores à coluna são físicos por definição (a loja só
    // vendia produto físico até então) — daí o `!== false`, não `=== true`.
    requires_shipping_address: raw.requires_shipping_address !== false,
    service_form_answers: readServiceFormAnswers(raw.service_form_answers),
  }
}

/** Pedido pendente mais recente do usuário — usado no popover do miniperfil. */
export async function getLatestPendingOrderByUser(userId: string): Promise<UserOrderSummary | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_orders")
    .select(ORDER_COLUMNS)
    .eq("metadata->>user_id", userId)
    .eq("is_sandbox", deployChargesInSandbox())
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[orders-repository] getLatestPendingOrderByUser:", error)
    return null
  }
  if (!data) return null
  const row = data as unknown as ComplementColumns
  const [order] = await withComplementAndMedia([toUserOrderSummaryBase(data)], [row])
  return order
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

/**
 * Pagamento recebido por fora do checkout do site (link avulso da Asaas, PIX
 * direto) e registrado à mão no painel. Mora em `metadata.manual_payment`:
 * é o único registro de que o dinheiro entrou, já que nenhuma cobrança do
 * site foi paga (ver `registerManualPayment`).
 */
export const MANUAL_PAYMENT_METHODS = ["pix", "credit_card"] as const
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number]

export type OrderManualPayment = {
  method: ManualPaymentMethod
  amount_cents: number
  /** Id da cobrança na Asaas, E2E do PIX ou o que identificar o pagamento. */
  reference: string | null
  registered_by: string
  registered_at: string
}

export type OrderCardReviewFlag = {
  reason: string
  risk_level: string | null
  three_d_secure: string | null
  held_at: string
  approved_at?: string
}

/** `metadata.infinitepay_unapplied`, gravado por `applyInfinitePayPayment`. */
export type OrderInfinitePayUnapplied = {
  transaction_nsu: string
  slug: string
  receipt_url: string | null
  amount_cents: number
  paid_amount_cents: number
  capture_method: string | null
  reason: string
  detected_at: string
}

export type OrderChargebackFlag = {
  event: string
  dispute_status: string
  reason?: string
  amount_cents?: number
  evidence_due_by?: string | null
  lost?: boolean
  detected_at: string
}

export type AdminOrderRow = {
  id: string
  status: OrderStatus
  total_cents: number
  /** Preço à vista no PIX; o checkout de cartão grava os dois. Null em pedido criado no PIX. */
  pix_price_cents: number | null
  items: Record<string, unknown>[]
  created_at: string
  updated_at: string
  payment_method: string | null
  /** Não-nulo = pedido pago com Aura (resgate de produto físico da Central). */
  aura_cost_paid: number | null
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
  /** Pedido cobrado pelo Stripe (gateway alternativo): PIX e cartão, desde a criação. */
  stripe_payment_intent_id: string | null
  /** Sessão do Stripe Checkout hospedado — legado, o cartão hoje é no nosso site. */
  stripe_session_id: string | null
  /** `mercadopago` = cartão cobrado pelo Mercado Pago. Null = deduz pelas referências (`orderPaymentGateway`). */
  payment_gateway: string | null
  /** Pagamento APROVADO do Mercado Pago. Null enquanto o cartão não passou. */
  mercadopago_payment_id: string | null
  /** Transação da InfinitePay que quitou o pedido (estorno é manual, no app dela). */
  infinitepay_transaction_nsu: string | null
  /** Comprovante da InfinitePay. */
  infinitepay_receipt_url: string | null
  /** Pagamento na InfinitePay que NÃO quitou o pedido (valor, expirado, duplicado): estornar no app. */
  infinitepay_unapplied: OrderInfinitePayUnapplied | null
  /** Cartão do Stripe autorizado e SEGURADO para revisão (nada cobrado ainda). */
  card_review: OrderCardReviewFlag | null
  /** Aviso precoce de fraude do emissor (Stripe Radar). */
  fraud_warning: { actionable: boolean; detected_at: string } | null
  /** Disputa (chargeback) no cartão. */
  chargeback: OrderChargebackFlag | null
  /** Presente quando o pedido foi feito por um usuário logado (metadata.user_id). */
  user_id: string | null
  user_display_name: string | null
  /** CPF do pagador (perfil do comprador), só dígitos. Null em convidado ou perfil sem CPF. */
  customer_cpf: string | null
  /** Não-nulo = vendido sem estoque, precisa de intervenção manual. */
  oversold: OrderOversoldFlag | null
  /** Para onde despachar. Null = o cliente ainda não informou (fluxo awaiting_shipping_info). */
  shipping_address: OrderShippingAddress | null
  /** false = pedido de serviço/digital: não entra na fila de "falta endereço". */
  requires_shipping_address: boolean
  /** true = pagamento de teste (ASAAS_ENV=sandbox). Marcado na linha da fila. */
  is_sandbox: boolean
  /**
   * Chamado de suporte aberto sozinho quando o pedido de serviço foi pago
   * (`metadata.service_ticket_id`, ver `openServiceOrderTicket`). Null em
   * pedido físico e em serviço pago antes de a abertura automática existir.
   */
  service_ticket_id: string | null
  /** O que o cliente preencheu no formulário pós-compra de serviço. Null = ainda não. */
  service_form_answers: OrderServiceFormAnswers | null
  /** Não-nulo = pago por fora do site e registrado no painel. */
  manual_payment: OrderManualPayment | null
  /** Complemento de Pagamento cobrado neste pedido. `dueCents` null = nada cobrado. */
  complement: OrderComplementSummary
  /** Este pedido É o pagamento de complemento do pedido indicado. */
  complement_for: OrderComplementTarget | null
}

const ADMIN_ORDER_COLUMNS =
  "id, status, total_cents, pix_price_cents, items, created_at, updated_at, payment_method, aura_cost_paid, customer_name, customer_email, metadata, tracking_code, carrier, shipped_at, delivered_at, refunded_cents, refund_reason, refunded_at, asaas_payment_id, stripe_payment_intent_id, stripe_session_id, payment_gateway, mercadopago_payment_id, infinitepay_transaction_nsu, infinitepay_receipt_url, is_sandbox, service_form_answers, complement_due_cents, complement_note, complement_for_order_id, " +
  SHIPPING_COLUMNS

type AdminOrderRawRow = {
  id: string
  status: OrderStatus
  total_cents: number
  pix_price_cents: number | null
  items: Record<string, unknown>[]
  created_at: string
  updated_at: string
  payment_method: string | null
  aura_cost_paid: number | null
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
  stripe_payment_intent_id: string | null
  stripe_session_id: string | null
  payment_gateway: string | null
  mercadopago_payment_id: string | null
  infinitepay_transaction_nsu: string | null
  infinitepay_receipt_url: string | null
  is_sandbox: boolean
  service_form_answers: unknown
} & RawShippingColumns &
  ComplementColumns

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
  /** Aba da fila ("Ativos", "Concluídos"...). Combina com `status` quando os dois vêm. */
  statuses?: OrderStatus[]
  productId?: string
  userQuery?: string
  userId?: string
  dateFrom?: string
  dateTo?: string
  /** Fila operacional: pagos, de item físico, ainda sem endereço informado. */
  missingShipping?: boolean
  /** Recorte de ambiente do gateway. Sem valor = só produção. */
  environment?: OrderEnvironment
  /** Gateway que cobrou (ou Aura). Sem valor = todos. */
  paymentSource?: OrderPaymentSourceFilter
  /** Produtos (com entrega) ou serviços (sem entrega). Sem valor = os dois. */
  kind?: OrderKind
  page?: number
  pageSize?: number
}): Promise<AdminOrderListResult> {
  const db = createSupabaseAdminClient()
  let query = withPaymentSource(
    withEnvironment(
      db
        .from("store_orders")
        .select(ADMIN_ORDER_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false }),
      filters?.environment ?? "production"
    ),
    filters?.paymentSource ?? "all"
  )

  if (filters?.status) query = query.eq("status", filters.status)
  if (filters?.statuses?.length) query = query.in("status", filters.statuses)
  const requiresShipping = requiresShippingFor(filters?.kind ?? "all")
  if (requiresShipping !== null) query = query.eq("requires_shipping_address", requiresShipping)
  if (filters?.userQuery?.trim()) {
    const term = escapeOrFilterValue(escapeLikePattern(filters.userQuery.trim()))
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
  // CPF em lote (uma consulta para a página inteira): é o documento que a
  // Asaas exigiu do pagador, e quem despacha precisa dele na declaração.
  const cpfByUser: Record<string, string | null> = {}
  if (userIds.length > 0) {
    const { data: cpfRows } = await createSupabaseAdminClient()
      .from("user_profiles")
      .select("id, cpf")
      .in("id", userIds)
    for (const r of (cpfRows ?? []) as Array<{ id: string; cpf: string | null }>) {
      cpfByUser[r.id] = r.cpf
    }
  }

  const baseOrders = rows.map((row) => {
    const userId = (row.metadata?.user_id as string | undefined) ?? null
    return {
      id: row.id,
      status: row.status,
      total_cents: row.total_cents,
      pix_price_cents: row.pix_price_cents ?? null,
      items: row.items,
      created_at: row.created_at,
      updated_at: row.updated_at,
      payment_method: row.payment_method,
      aura_cost_paid: row.aura_cost_paid ?? null,
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
      stripe_payment_intent_id: row.stripe_payment_intent_id ?? null,
      stripe_session_id: row.stripe_session_id ?? null,
      payment_gateway: row.payment_gateway ?? null,
      mercadopago_payment_id: row.mercadopago_payment_id ?? null,
      infinitepay_transaction_nsu: row.infinitepay_transaction_nsu ?? null,
      infinitepay_receipt_url: row.infinitepay_receipt_url ?? null,
      infinitepay_unapplied: (row.metadata?.infinitepay_unapplied as OrderInfinitePayUnapplied | undefined) ?? null,
      user_id: userId,
      user_display_name: userId ? profiles[userId]?.display_name ?? null : null,
      customer_cpf: userId ? cpfByUser[userId] ?? null : null,
      oversold: (row.metadata?.oversold as OrderOversoldFlag | undefined) ?? null,
      shipping_address: mapShippingAddress(row),
      requires_shipping_address: row.requires_shipping_address !== false,
      is_sandbox: row.is_sandbox === true,
      service_ticket_id: (row.metadata?.service_ticket_id as string | undefined) ?? null,
      service_form_answers: readServiceFormAnswers(row.service_form_answers),
      manual_payment: (row.metadata?.manual_payment as OrderManualPayment | undefined) ?? null,
      card_review: (() => {
        const review = row.metadata?.card_review as OrderCardReviewFlag | undefined
        return review && !review.approved_at ? review : null
      })(),
      fraud_warning: (row.metadata?.fraud_warning as AdminOrderRow["fraud_warning"] | undefined) ?? null,
      chargeback: (row.metadata?.chargeback as OrderChargebackFlag | undefined) ?? null,
    }
  })
  const orders: AdminOrderRow[] = await withComplementAndMedia(baseOrders, rows)

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
  environment: OrderEnvironment = "production",
  kind: OrderKind = "all",
  paymentSource: OrderPaymentSourceFilter = "all"
): Promise<OrderStatusCounts> {
  if (paymentSource !== "all") return countOrdersByStatusForSource(environment, kind, paymentSource)
  const db = createSupabaseAdminClient()
  const requiresShipping = requiresShippingFor(kind)
  const { data, error } = await db.rpc("count_orders_by_status", {
    // `null` = os dois ambientes; a RPC trata assim (ver
    // 20261013000000_store_orders_sandbox_flag.sql).
    p_is_sandbox: environment === "all" ? null : environment === "sandbox",
    // Só vai quando há recorte: sem o argumento, a chamada casa com a
    // assinatura antiga e continua funcionando antes de 20261206000000 subir.
    ...(requiresShipping === null ? {} : { p_requires_shipping: requiresShipping }),
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

/**
 * Mesmas contagens com recorte de gateway. A RPC `count_orders_by_status` não
 * conhece gateway (ele é deduzido das colunas de referência, não gravado), então
 * aqui é um `count` por status, em paralelo e sem trazer linha nenhuma
 * (`head: true`). Só roda quando o admin escolhe um gateway; o caso comum
 * continua no group by da RPC.
 */
async function countOrdersByStatusForSource(
  environment: OrderEnvironment,
  kind: OrderKind,
  paymentSource: Exclude<OrderPaymentSourceFilter, "all">
): Promise<OrderStatusCounts> {
  const db = createSupabaseAdminClient()
  const requiresShipping = requiresShippingFor(kind)
  const statuses: OrderStatus[] = [
    "pending",
    "paid",
    "awaiting_shipping_info",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
    "expired",
  ]
  const results = await Promise.all(
    statuses.map(async (status) => {
      let query = withPaymentSource(
        withEnvironment(
          db.from("store_orders").select("id", { count: "exact", head: true }).eq("status", status),
          environment
        ),
        paymentSource
      )
      if (requiresShipping !== null) query = query.eq("requires_shipping_address", requiresShipping)
      const { count, error } = await query
      if (error) console.error("[orders-repository] countOrdersByStatusForSource:", error)
      return [status, count ?? 0] as const
    })
  )
  const counts = { all: 0 } as OrderStatusCounts
  for (const [status, count] of results) {
    counts[status] = count
    counts.all += count
  }
  return counts
}

/**
 * Pedidos pagos que ainda esperam o admin: separar/despachar o produto ou
 * entrar em contato para o serviço. É o badge de "Pedidos" na sidebar do
 * admin, e é o que faltava para ninguém descobrir uma venda pelo suporte.
 *
 * Conta só `paid` de produção: é o "Pedido feito" (produto com endereço) e o
 * serviço pago. `awaiting_shipping_info` espera o CLIENTE, não a equipe;
 * `shipped` em diante já foi tocado pelo admin; e pedido de sandbox não é
 * trabalho a fazer.
 */
export async function countPaidOrdersAwaitingAction(): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "paid")
    .eq("is_sandbox", false)
  if (error) {
    console.error("[orders-repository] countPaidOrdersAwaitingAction:", error)
    return 0
  }
  return count ?? 0
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
    const escaped = escapeOrFilterValue(escapeLikePattern(term))
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
    dbQuery = dbQuery.ilike("name", `%${escapeLikePattern(term)}%`)
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
 * etapa a partir do status atual (nunca pular, nunca regredir), e só para
 * as etapas do admin (`ADMIN_ADVANCE_STATUSES`).
 */
export async function advanceOrderStatus(
  id: string,
  nextStatus: OrderStatus,
  extra?: { trackingCode?: string; carrier?: string },
  adminId?: string | null
): Promise<RepositoryResult> {
  // "Aguardando dados de entrega" e "Pedido feito" saem do endereço (trigger
  // no banco). Marcá-los na mão criaria um status que contradiz o dado.
  if (!(ADMIN_ADVANCE_STATUSES as readonly OrderStatus[]).includes(nextStatus)) {
    return { ok: false, error: "Esta etapa é definida automaticamente pelo endereço de entrega.", status: 400 }
  }

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
  // `delivered`, esse pedido ficaria preso para sempre em `paid`. Por isso
  // ele tem fluxo próprio: do pagamento direto para concluído.
  const requiresShipping = existing.requires_shipping_address !== false
  const flow = requiresShipping ? ORDER_FULFILLMENT_FLOW : ORDER_DIGITAL_FULFILLMENT_FLOW

  // Marcar como enviado sem saber para onde é um erro operacional que só
  // aparece depois, quando o pacote não chega. O admin já não vê o botão
  // nesse caso; aqui é a trava que vale (a UI pode mudar, esta não).
  if (nextStatus === "shipped" && !mapShippingAddress(existing as Partial<RawShippingColumns>)) {
    return {
      ok: false,
      error: "Este pedido não tem endereço de entrega informado; não é possível marcá-lo como enviado.",
      status: 400,
    }
  }

  const currentStatus = existing.status as OrderStatus
  const currentIndex = flow.indexOf(currentStatus)
  const nextIndex = flow.indexOf(nextStatus)

  if (currentIndex === -1) {
    return { ok: false, error: "Este pedido não está no fluxo de pós-venda.", status: 400 }
  }
  if (currentStatus === "awaiting_shipping_info") {
    return {
      ok: false,
      error: "O cliente ainda não informou o endereço de entrega; o pedido avança sozinho quando ele preencher.",
      status: 400,
    }
  }
  if (nextIndex !== currentIndex + 1) {
    return {
      ok: false,
      error: requiresShipping
        ? "Só é possível avançar uma etapa por vez, na ordem do fluxo."
        : "Este pedido não tem entrega; só é possível marcá-lo como concluído.",
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
    await notifyOrderStatusChange({ userId: ownerId, orderId: id, status: nextStatus, requiresShipping })
  }

  // Por e-mail só o envio (com o rastreio): "entregue" o cliente costuma
  // confirmar ele mesmo, e o Resend está no plano gratuito.
  if (nextStatus === "shipped") await sendOrderEmail(id, "shipped")

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
 * Troca o código de rastreio de um pedido já enviado. O produto sai da China
 * e, em alguns casos, o código muda quando a encomenda entra no Brasil: o
 * cliente precisa do código NOVO, senão fica olhando um rastreio parado.
 *
 * Só em `TRACKING_EDITABLE_STATUSES` (enviado). Antes do envio o código entra
 * pelo `advanceOrderStatus`; depois de entregue não há mais o que rastrear.
 * O status entra no filtro do UPDATE para um "Já recebi" do cliente no meio
 * não ser sobrescrito.
 */
export async function updateOrderTracking(
  id: string,
  params: { trackingCode: string; carrier?: string },
  adminId?: string | null
): Promise<RepositoryResult> {
  const trackingCode = params.trackingCode.trim()
  if (!trackingCode) {
    return { ok: false, error: "Informe o código de rastreio.", status: 400 }
  }

  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("store_orders")
    .select("id, status, tracking_code, carrier, metadata, requires_shipping_address")
    .eq("id", id)
    .maybeSingle()

  if (!existing) {
    return { ok: false, error: "Pedido não encontrado.", status: 404 }
  }

  const currentStatus = existing.status as OrderStatus
  if (!(TRACKING_EDITABLE_STATUSES as OrderStatus[]).includes(currentStatus)) {
    return { ok: false, error: "Só é possível alterar o rastreio de um pedido enviado.", status: 400 }
  }

  // `carrier` ausente mantém a transportadora; string vazia a apaga.
  const carrier = params.carrier === undefined ? existing.carrier : params.carrier.trim() || null
  if (trackingCode === existing.tracking_code && carrier === existing.carrier) {
    return { ok: true }
  }

  const { data: updated, error } = await db
    .from("store_orders")
    .update({ tracking_code: trackingCode, carrier })
    .eq("id", id)
    .eq("status", currentStatus)
    .select("id")
    .maybeSingle()

  if (error) {
    return { ok: false, error: "Não foi possível atualizar o rastreio.", status: 400 }
  }
  if (!updated) {
    return { ok: false, error: "O pedido mudou de status enquanto você editava. Recarregue a página.", status: 409 }
  }

  // Só a transportadora mudou: não é um código novo para o cliente acompanhar.
  const codeChanged = trackingCode !== existing.tracking_code

  if (codeChanged) {
    const ownerId = orderOwnerId(existing.metadata as Record<string, unknown> | null)
    if (ownerId) {
      await notifyOrderTrackingUpdated({ userId: ownerId, orderId: id, trackingCode })
    }
    await sendOrderEmail(id, "tracking_updated")
  }

  await notifyDiscordOrderEvent({
    orderId: id,
    status: currentStatus,
    actor: "admin",
    eventKey: `tracking:${trackingCode}:${carrier ?? ""}`,
    note: `Rastreio alterado: ${existing.tracking_code ?? "(vazio)"} → ${trackingCode}${carrier ? ` · ${carrier}` : ""}`,
  })

  if (adminId) {
    await logAdminAction({
      adminId,
      action: "order.tracking_update",
      entityType: "store_order",
      entityId: id,
      before: { trackingCode: existing.tracking_code ?? null, carrier: existing.carrier ?? null },
      after: { trackingCode, carrier },
    })
  }

  return { ok: true }
}

/**
 * Estorna um pedido pago via Asaas — integral (sem `valueCents`) ou parcial.
 * Exige `asaas_payment_id`; pedidos legados sem ele (pagos por gateways
 * anteriores) precisam ser estornados manualmente e só têm o status
 * marcado aqui.
 *
 * A cobrança na Asaas é a fonte da verdade — chamamos `refundPayment` antes
 * de tocar no banco, e só gravamos o acumulado se o gateway confirmar.
 */
export async function refundOrder(
  id: string,
  params: {
    valueCents?: number
    reason?: string
    /** Estorno por suspeita de fraude (aviso do emissor). Só o Stripe usa o sinal (alimenta o Radar). */
    fraudulent?: boolean
    /**
     * InfinitePay não tem estorno por API: o admin devolve no app dela e
     * confirma aqui que já devolveu. Sem isto, o pedido não muda.
     */
    manualConfirmed?: boolean
  },
  adminId?: string | null
): Promise<RepositoryResult> {
  // Um estorno por pedido por vez. A Asaas não tem chave de idempotência: dois
  // cliques (ou dois admins) num estorno parcial liam o mesmo `refunded_cents`,
  // os dois chamavam o gateway e o dinheiro saía duas vezes, enquanto o banco
  // gravava só um. O prazo cobre a chamada ao gateway com folga.
  const lease = await acquireLease(`store_refund:${id}`, 120)
  if (!lease.acquired) {
    return lease.reason === "error"
      ? { ok: false, error: "Não foi possível iniciar o estorno agora. Tente novamente.", status: 503 }
      : { ok: false, error: "Já existe um estorno deste pedido em andamento. Aguarde e confira o pedido.", status: 409 }
  }
  try {
    return await refundOrderLocked(id, params, adminId)
  } finally {
    await lease.release()
  }
}

async function refundOrderLocked(
  id: string,
  params: Parameters<typeof refundOrder>[1],
  adminId?: string | null
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("store_orders")
    .select("id, status, total_cents, pix_price_cents, refunded_cents, asaas_payment_id, stripe_payment_intent_id, mercadopago_payment_id, infinitepay_transaction_nsu, metadata, affiliate_id")
    .eq("id", id)
    .maybeSingle()

  if (!existing) {
    return { ok: false, error: "Pedido não encontrado.", status: 404 }
  }
  if (!["paid", "awaiting_shipping_info", "shipped", "delivered"].includes(existing.status)) {
    return { ok: false, error: "Só é possível estornar um pedido pago.", status: 400 }
  }
  if (
    !existing.asaas_payment_id &&
    !existing.stripe_payment_intent_id &&
    !existing.mercadopago_payment_id &&
    !existing.infinitepay_transaction_nsu
  ) {
    return {
      ok: false,
      error: "Este pedido não tem cobrança de gateway associada; estorne manualmente e atualize o status.",
      status: 400,
    }
  }

  const remainingCents = existing.total_cents - existing.refunded_cents
  const refundCents = params.valueCents ?? remainingCents
  if (refundCents <= 0 || refundCents > remainingCents) {
    return { ok: false, error: "Valor de estorno inválido para o saldo restante do pedido.", status: 400 }
  }

  // Pedido da InfinitePay: o estorno é feito no app dela (não há API). O
  // banco só grava quando o admin confirma que JÁ devolveu, para o pedido
  // nunca dizer "reembolsado" com o dinheiro ainda na conta.
  if (existing.infinitepay_transaction_nsu) {
    if (!params.manualConfirmed) {
      return {
        ok: false,
        error: `A InfinitePay não estorna pelo site. Estorne no app da InfinitePay (transação ${existing.infinitepay_transaction_nsu}) e confirme aqui.`,
        status: 400,
      }
    }
  } else if (existing.mercadopago_payment_id) {
    // Pedido do Mercado Pago (cartão): mesma regra — o gateway estorna
    // primeiro, o banco só grava se ele aceitar. A chave de idempotência segue
    // a do Stripe: clique duplo colapsa, nova tentativa depois de falha não.
    const { refundMercadoPagoOrder, MercadoPagoError } = await import("@/lib/server/integrations/mercadopago")
    const failedAttempts = refundAttemptsOf(existing.metadata)
    try {
      await refundMercadoPagoOrder(existing.mercadopago_payment_id, {
        // Estorno total vai sem valor: o Mercado Pago devolve também os juros
        // de parcelamento que o comprador pagou, o que um valor fixo não faria.
        amountCents: refundCents === remainingCents && existing.refunded_cents === 0 ? undefined : refundCents,
        idempotencyKey: `store-refund-${existing.id}-${existing.refunded_cents + refundCents}-${failedAttempts}`,
      })
    } catch (err) {
      console.error("[orders-repository] refundOrder — Mercado Pago:", err)
      try {
        await patchOrderMetadata(existing.id, { refund_attempt: failedAttempts + 1 })
      } catch (patchErr) {
        console.error("[orders-repository] refundOrder — contador de tentativas:", patchErr)
      }
      const message = err instanceof MercadoPagoError ? err.apiMessage : null
      return {
        ok: false,
        error: message ? `Mercado Pago recusou o estorno: ${message}` : "Não foi possível estornar no Mercado Pago. Tente novamente.",
        status: 502,
      }
    }
  } else if (!existing.asaas_payment_id && existing.stripe_payment_intent_id) {
    // Pedido do Stripe: mesma regra — o gateway estorna primeiro, o banco só
    // grava se ele aceitar.
    const { refundStripePayment, stripeErrorMessage } = await import("@/lib/server/integrations/stripe")
    // O Stripe guarda a FALHA junto com a chave de idempotência e a repete por
    // 24 h (saldo insuficiente que o admin acabou de resolver, por exemplo).
    // O contador de falhas entra na chave: clique duplo continua colapsando
    // (os dois leem o mesmo número) e a nova tentativa depois de uma falha usa
    // chave nova.
    const failedAttempts = refundAttemptsOf(existing.metadata)
    try {
      await refundStripePayment(existing.stripe_payment_intent_id, {
        amountCents: refundCents,
        reason: params.reason,
        stripeReason: params.fraudulent ? "fraudulent" : "requested_by_customer",
        idempotencyKey: `store-refund-${existing.id}-${existing.refunded_cents + refundCents}-${failedAttempts}`,
      })
    } catch (err) {
      console.error("[orders-repository] refundOrder — Stripe:", err)
      try {
        await patchOrderMetadata(existing.id, { refund_attempt: failedAttempts + 1 })
      } catch (patchErr) {
        console.error("[orders-repository] refundOrder — contador de tentativas:", patchErr)
      }
      const message = stripeErrorMessage(err)
      return {
        ok: false,
        error: message ? `Stripe recusou o estorno: ${message}` : "Não foi possível estornar no Stripe. Tente novamente.",
        status: 502,
      }
    }
  } else {
  const { refundPayment, AsaasError } = await import("@/lib/server/integrations/asaas")
  try {
    await refundPayment(existing.asaas_payment_id!, { valueCents: refundCents, description: params.reason })
  } catch (err) {
    console.error("[orders-repository] refundOrder — Asaas:", err)
    // 4xx da Asaas é regra de negócio (saldo insuficiente na conta, cobrança
    // já estornada) — repetir não resolve, então mostramos o motivo dela.
    if (err instanceof AsaasError && err.description) {
      return { ok: false, error: `Asaas recusou o estorno: ${err.description}`, status: 502 }
    }
    return { ok: false, error: "Não foi possível estornar no Asaas. Tente novamente.", status: 502 }
  }
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

  // Condicional ao acumulado LIDO: se outro caminho (webhook de estorno feito
  // no painel do gateway) gravou no meio, este UPDATE não sobrescreve o valor
  // dele com uma soma calculada sobre um número velho.
  const { data: written, error } = await db
    .from("store_orders")
    .update(update)
    .eq("id", id)
    .eq("refunded_cents", existing.refunded_cents)
    .select("id")
  if (error || !written?.length) {
    // O estorno já aconteceu de verdade no gateway — não propaga como falha
    // total, mas também não finge que o banco está em dia.
    console.error("[orders-repository] refundOrder — grava status:", id, error ?? "acumulado mudou no meio")
    return { ok: false, error: "Estorno feito no gateway, mas falhou ao atualizar o pedido. Verifique manualmente.", status: 500 }
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
    actor: adminId ? "admin" : "webhook-stripe",
    eventKey: isFullRefund ? undefined : String(newRefundedCents),
    note: params.reason ?? null,
  })

  try {
    await syncCommissionForRefund(
      {
        id: existing.id,
        affiliate_id: existing.affiliate_id,
        total_cents: existing.total_cents,
        pix_price_cents: existing.pix_price_cents,
      },
      newRefundedCents,
      existing.refunded_cents
    )
  } catch (err) {
    console.error("[orders-repository] refundOrder — syncCommissionForRefund:", err)
  }

  // Estorno automático (aviso de fraude do emissor) não tem admin, mas move
  // dinheiro: também deixa trilha, com `admin_id` nulo e a marca `automatic`.
  await logAdminAction({
    adminId: adminId ?? null,
    action: adminId ? "order.refund" : "order.refund_automatic",
    entityType: "store_order",
    entityId: id,
    before: { status: existing.status, refunded_cents: existing.refunded_cents },
    after: {
      status: update.status ?? existing.status,
      refunded_cents: newRefundedCents,
      reason: params.reason ?? null,
      ...(adminId ? {} : { automatic: true, fraudulent: params.fraudulent === true }),
    },
  })

  return { ok: true }
}

/** Quantas tentativas de estorno já falharam no Stripe para este pedido (ver `refundOrder`). */
function refundAttemptsOf(metadata: unknown): number {
  const value = (metadata as Record<string, unknown> | null)?.refund_attempt
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0
}

/**
 * Cancela um pedido ainda não pago (`pending`), devolvendo o estoque
 * reservado no checkout e, se houver cobrança Asaas associada, removendo-a
 * lá também (`DELETE /payments/{id}` — só vale para cobrança ainda não
 * paga; pedido já pago é estorno, não cancelamento, ver `refundOrder`).
 *
 * Pedidos legados sem `asaas_payment_id` são cancelados só localmente — o
 * PIX gerado simplesmente nunca será pago e expira sozinho no gateway.
 *
 * A transição (`WHERE status = 'pending'`) e a devolução do estoque são uma
 * transação só (`releasePendingOrders`) e rodam antes da chamada ao gateway,
 * mesmo padrão de `expireStalePendingOrders`: evita cancelar um pedido que
 * acabou de ser pago por um webhook concorrente.
 */
export async function cancelOrder(
  id: string,
  params: { reason?: string },
  adminId?: string | null
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  // Status e estoque na mesma transação: o pedido só sai de `pending` com as
  // unidades já de volta na prateleira (ver `releasePendingOrders`).
  const { orders: released, error: releaseError } = await releasePendingOrders(db, [id], "cancelled")
  if (releaseError) {
    console.error("[orders-repository] cancelOrder:", releaseError)
    return { ok: false, error: "Não foi possível cancelar o pedido. Tente novamente.", status: 500 }
  }
  const existing = released[0]
  if (!existing) {
    return { ok: false, error: "Só é possível cancelar um pedido aguardando pagamento.", status: 400 }
  }

  // Cartão hospedado da Asaas: o checkout seguia pagável até vencer sozinho
  // depois do cancelamento. Falha (já pago, já expirado) cai no webhook.
  //
  // InfinitePay não tem como cancelar o link pela API: pagamento num pedido
  // cancelado vira `infinitepay_unapplied` (estorno manual, aviso no Discord).
  if (existing.asaas_checkout_id) {
    const { cancelCheckout } = await import("@/lib/server/integrations/asaas")
    try {
      await cancelCheckout(existing.asaas_checkout_id)
    } catch (err) {
      console.error("[orders-repository] cancelOrder — Asaas checkout:", err)
    }
  }

  // Pedido do Stripe: cancela o PaymentIntent para o QR deixar de ser pagável
  // e, no cartão, para SOLTAR a autorização (é assim que o admin recusa um
  // pagamento em revisão). Mesma tolerância a falha do ramo da Asaas — se o
  // Stripe recusar (já pago, já expirado), o webhook cuida do caso tardio.
  if (existing.stripe_payment_intent_id) {
    const { cancelStripePayment } = await import("@/lib/server/integrations/stripe")
    try {
      await cancelStripePayment(existing.stripe_payment_intent_id)
    } catch (err) {
      console.error("[orders-repository] cancelOrder — Stripe:", err)
    }
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

  const ownerId = orderOwnerId(existing.metadata)
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

/** Cancelamentos simultâneos no Stripe: o bastante para caber nos 30 s do cron sem rajada. */
const STRIPE_CANCEL_BATCH_SIZE = 8

/**
 * Cancela PaymentIntents do Stripe sem nunca lançar: em lotes paralelos e com
 * `allSettled`, para uma cobrança lenta ou recusada não segurar nem derrubar as
 * demais. "Já finalizado" (pago, já cancelado) é o resultado esperado de uma
 * corrida e não vira log de erro.
 */
async function cancelStripeIntentsBestEffort(intentIds: string[]): Promise<void> {
  if (intentIds.length === 0) return
  const { cancelStripePayment, isStripeAlreadyFinalError } = await import("@/lib/server/integrations/stripe")
  for (let start = 0; start < intentIds.length; start += STRIPE_CANCEL_BATCH_SIZE) {
    const batch = intentIds.slice(start, start + STRIPE_CANCEL_BATCH_SIZE)
    const results = await Promise.allSettled(batch.map((intentId) => cancelStripePayment(intentId)))
    results.forEach((result, index) => {
      if (result.status === "fulfilled" || isStripeAlreadyFinalError(result.reason)) return
      console.error(`[orders-repository] cancelar ${batch[index]} no Stripe:`, result.reason)
    })
  }
}

/** Pedidos expirados por execução do cron (ver `expireStalePendingOrders`). */
const EXPIRE_BATCH_SIZE = 300
/** Avisos no site disparados em paralelo. */
const NOTIFY_BATCH_SIZE = 20
/** Quanto do `maxDuration` (30 s) do cron os avisos do Discord podem usar. */
const DISCORD_TIME_BUDGET_MS = 18_000

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
  const startedAt = Date.now()
  const db = createSupabaseAdminClient()
  const now = new Date().toISOString()
  const fallbackCutoff = new Date(Date.now() - PIX_EXPIRATION_MINUTES * 60_000).toISOString()

  // Fila com teto por execução, mais antigos primeiro. Sem teto, um pico de
  // pedidos abandonados (lançamento) virava UM update gigante seguido de
  // centenas de avisos numa função de 30 s. O que sobrar sai na execução
  // seguinte — o cron roda a cada 5 min.
  const { data: candidates, error } = await db
    .from("store_orders")
    .select("id")
    .eq("status", "pending")
    .or(`pix_expires_at.lt.${now},and(pix_expires_at.is.null,created_at.lt.${fallbackCutoff})`)
    .order("created_at", { ascending: true })
    .limit(EXPIRE_BATCH_SIZE)

  if (error) {
    console.error("[orders-repository] expireStalePendingOrders — fila:", error)
    return {
      expired_count: 0,
      stock_restored_count: 0,
      orphaned_reservations_released: 0,
      errors: [error.message],
    }
  }

  // Status + estoque numa transação só (ver `releasePendingOrders`): o que
  // não pode se perder, o ESTOQUE, já está de volta quando esta linha
  // retorna, e o resto (Stripe, avisos) é rede externa que pode demorar.
  const { orders, error: releaseError } = await releasePendingOrders(
    db,
    (candidates ?? []).map((row) => row.id),
    "expired"
  )

  const errors: string[] = []
  if (releaseError) {
    console.error("[orders-repository] expireStalePendingOrders — release:", releaseError)
    errors.push(releaseError)
  }
  const stockRestoredCount = orders.reduce(
    (sum, order) => sum + (order.items as unknown as OrderStockLine[]).filter(lineMovesPhysicalStock).length,
    0
  )

  // Reservas órfãs: estoque decrementado pelo checkout cuja Function morreu
  // antes de criar o pedido. Não há pedido para a fila acima achar, então
  // sem esta chamada essas unidades ficariam descontadas para sempre. A
  // janela (15 min) é folgada em relação ao `maxDuration = 30s` da rota de
  // checkout — nunca devolve estoque de um request ainda em andamento. Vem
  // antes dos avisos: é estoque, não pode ficar para trás por causa deles.
  let orphanedReleased = 0
  const { data: orphans, error: orphanError } = await db.rpc("release_orphaned_stock_reservations", {
    p_older_than_minutes: 15,
  })
  if (orphanError) {
    console.error("[orders-repository] release_orphaned_stock_reservations:", orphanError)
    errors.push(orphanError.message)
  } else {
    orphanedReleased = Number(orphans ?? 0)
    if (orphanedReleased > 0) {
      console.warn(
        `[orders-repository] ${orphanedReleased} reserva(s) órfã(s) de estoque devolvida(s) — checkout interrompido antes de criar o pedido.`
      )
    }
  }

  // Pedido do Stripe: o banco expirou, mas a cobrança seguia viva lá, e a aba
  // aberta ainda conseguia pagar um pedido morto (o estoque já voltou para a
  // prateleira). Cancelar fecha o PIX e impede autorizar o cartão. Falha aqui
  // não trava o cron: autorização tardia é solta pelo webhook, e PIX tardio cai
  // em `reReserveStockForLatePayment`.
  await cancelStripeIntentsBestEffort(
    orders.map((order) => order.stripe_payment_intent_id).filter((id): id is string => Boolean(id))
  )

  // Aviso no site: um insert por pedido, em lotes paralelos.
  for (let start = 0; start < orders.length; start += NOTIFY_BATCH_SIZE) {
    await Promise.allSettled(
      orders.slice(start, start + NOTIFY_BATCH_SIZE).map((order) => {
        const ownerId = orderOwnerId(order.metadata)
        return ownerId
          ? notifyOrderStatusChange({ userId: ownerId, orderId: order.id, status: "expired" })
          : Promise.resolve()
      })
    )
  }

  // Discord em série (paralelo bate no rate limit deles) e com orçamento de
  // tempo: o painel do pedido é informativo, e esperar por ele não pode
  // estourar o `maxDuration` antes da limpeza de reservas órfãs abaixo.
  let discordSkipped = 0
  for (const order of orders) {
    if (Date.now() - startedAt > DISCORD_TIME_BUDGET_MS) {
      discordSkipped += 1
      continue
    }
    await notifyDiscordOrderEvent({ orderId: order.id, status: "expired", actor: "cron" })
  }
  if (discordSkipped > 0) {
    console.warn(`[orders-repository] expireStalePendingOrders — ${discordSkipped} aviso(s) do Discord pulado(s) por tempo.`)
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
  return expirePendingOrderByGatewayRef("asaas_payment_id", paymentId, "webhook-asaas")
}

/**
 * Mesma expiração pontual, pela referência de cobrança de qualquer gateway
 * (`asaas_payment_id`, ou `stripe_payment_intent_id` / `stripe_session_id`
 * para os pedidos do Stripe).
 */
export async function expirePendingOrderByGatewayRef(
  column: "asaas_payment_id" | "stripe_payment_intent_id" | "stripe_session_id",
  value: string,
  actor: "webhook-asaas" | "webhook-stripe"
): Promise<ExpireOrderByPaymentResult> {
  const db = createSupabaseAdminClient()

  const { data: matches, error } = await db
    .from("store_orders")
    .select("id")
    .eq(column, value)
    .eq("status", "pending")

  if (error) {
    console.error("[orders-repository] expirePendingOrderByGatewayRef — busca:", error)
    return { expired: false, orderId: null, errors: [error.message] }
  }

  // Status e estoque na mesma transação (ver `releasePendingOrders`).
  const { orders, error: releaseError } = await releasePendingOrders(
    db,
    (matches ?? []).map((row) => row.id),
    "expired"
  )
  if (releaseError) {
    console.error("[orders-repository] expirePendingOrderByGatewayRef — release:", releaseError)
    return { expired: false, orderId: null, errors: [releaseError] }
  }

  const order = orders[0]
  if (!order) return { expired: false, orderId: null, errors: [] }

  const ownerId = orderOwnerId(order.metadata)
  if (ownerId) {
    await notifyOrderStatusChange({ userId: ownerId, orderId: order.id, status: "expired" })
  }

  await notifyDiscordOrderEvent({ orderId: order.id, status: "expired", actor })

  return { expired: true, orderId: order.id, errors: [] }
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
      const ok = await takeStock(db, orderLineStockMovement(item))
      return { item, ok }
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
    .select("id, status, total_cents, pix_price_cents, refunded_cents, metadata, affiliate_id")
    .eq("asaas_payment_id", paymentId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, error: "Pedido não encontrado para este pagamento.", status: 404 }
  }
  if (!["paid", "awaiting_shipping_info", "shipped", "delivered", "refunded"].includes(existing.status)) {
    return { ok: false, error: "Pedido fora do fluxo pós-pagamento, nada a reconciliar.", status: 400 }
  }

  const { getPayment } = await import("@/lib/server/integrations/asaas")
  const verified = await getPayment(paymentId)

  const refundedCents = (verified.refunds ?? [])
    .filter((refund) => refund.status === "DONE")
    .reduce((sum, refund) => sum + Math.round(refund.value * 100), 0)

  return reconcileOrderRefundedCents(existing, refundedCents, "webhook-asaas")
}

/**
 * Versão Stripe de `syncOrderRefundState`: o valor estornado vem de
 * `charge.amount_refunded`, relido na origem (nunca do corpo do evento).
 */
export async function syncStripeOrderRefundState(paymentIntentId: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("store_orders")
    .select("id, status, total_cents, pix_price_cents, refunded_cents, metadata, affiliate_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, error: "Pedido não encontrado para este pagamento.", status: 404 }
  }
  if (!["paid", "awaiting_shipping_info", "shipped", "delivered", "refunded"].includes(existing.status)) {
    return { ok: false, error: "Pedido fora do fluxo pós-pagamento, nada a reconciliar.", status: 400 }
  }

  // Pedido pago por FORA (registro manual no admin) não é desta cobrança:
  // um estorno no Stripe é a devolução de um pagamento em duplicidade, não do
  // pedido — reconciliar aqui marcaria como estornado um pedido pago.
  const metadata = (existing.metadata ?? {}) as Record<string, unknown>
  if (metadata.manual_payment) return { ok: true }

  const { getStripePayment } = await import("@/lib/server/integrations/stripe")
  const verified = await getStripePayment(paymentIntentId)

  // Disputa PERDIDA também é dinheiro que voltou ao cliente (o Stripe debita
  // do saldo, sem gerar estorno). Contá-la aqui é o que faz a Aura, as
  // medalhas e a comissão da compra serem revertidas pelos mesmos triggers do
  // estorno — sem isso quem ganhava o chargeback ficava com produto, dinheiro
  // E a Aura. Lido do metadata (gravado pelo webhook da disputa) para que um
  // estorno posterior não "esqueça" a perda ao reconciliar.
  const chargeback = metadata.chargeback as { lost?: boolean; amount_cents?: number } | undefined
  const lostCents = chargeback?.lost ? Math.max(0, Math.trunc(chargeback.amount_cents ?? 0)) : 0

  return reconcileOrderRefundedCents(
    existing,
    Math.min(existing.total_cents, verified.refundedCents + lostCents),
    "webhook-stripe"
  )
}

/**
 * Grava o total estornado que o GATEWAY reporta e ajusta status, avisos e
 * comissão. Compartilhado pelos webhooks da Asaas e do Stripe.
 */
async function reconcileOrderRefundedCents(
  existing: {
    id: string
    status: string
    total_cents: number
    pix_price_cents: number | null
    refunded_cents: number
    metadata: unknown
    affiliate_id: string | null
  },
  refundedCents: number,
  actor: "webhook-asaas" | "webhook-stripe"
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

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
      actor,
      eventKey: String(refundedCents),
    })
  }

  try {
    await syncCommissionForRefund(
      {
        id: existing.id,
        affiliate_id: existing.affiliate_id,
        total_cents: existing.total_cents,
        pix_price_cents: existing.pix_price_cents,
      },
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
 * Efeito colateral deliberado: um pedido `awaiting_shipping_info` que ganha
 * endereço vira `paid` ("Pedido feito"). Quem garante é o trigger
 * `trg_store_orders_shipping_stage`, pelo `shipping_address_filled_at`; o
 * status explícito aqui só deixa a intenção visível. Pedido ainda `pending`
 * não muda de status: o pagamento é que manda.
 */
export async function setOrderShippingAddress(
  orderId: string,
  userId: string,
  address: ShippingAddressInput
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
          ? "Este pedido já foi despachado; fale com o suporte para alterar o endereço."
          : "Não é possível informar endereço para este pedido.",
      status: 400,
    }
  }

  const update: Database["public"]["Tables"]["store_orders"]["Update"] = {
    ...shippingAddressColumns(address),
    shipping_address_filled_at: new Date().toISOString(),
  }
  if (currentStatus === "awaiting_shipping_info") update.status = "paid"

  const { error } = await db
    .from("store_orders")
    .update(update)
    .eq("id", orderId)
    .eq("metadata->>user_id", userId)

  if (error) {
    console.error("[orders-repository] setOrderShippingAddress:", error)
    return { ok: false, error: "Não foi possível salvar o endereço de entrega.", status: 500 }
  }

  // Sem notificação para o cliente: foi ele mesmo que acabou de preencher, e
  // a tela já mostra o status novo.
  if (update.status) {
    // O card do Discord recarrega o pedido do banco, então já sai com o
    // endereço que acabou de ser gravado — é exatamente o que o admin
    // precisa ver para postar o pacote.
    await notifyDiscordOrderEvent({
      orderId,
      status: "paid",
      actor: "cliente",
      note: "Endereço de entrega informado pelo cliente.",
    })
  }

  return { ok: true }
}

/**
 * "Já recebi meu produto": o próprio cliente fecha o pedido enviado.
 *
 * Só a partir de `shipped`: confirmar recebimento de algo que nem saiu do
 * armazém não faz sentido e tiraria o pedido da fila do admin. A posse e o
 * status de origem vão no próprio UPDATE (mesmo motivo de
 * `setOrderShippingAddress`): dois cliques, ou o admin marcando ao mesmo
 * tempo, resultam em uma transição só.
 */
export async function confirmOrderDelivered(orderId: string, userId: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: updated, error } = await db
    .from("store_orders")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("metadata->>user_id", userId)
    .eq("status", "shipped")
    .eq("requires_shipping_address", true)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("[orders-repository] confirmOrderDelivered:", error)
    return { ok: false, error: "Não foi possível confirmar o recebimento.", status: 500 }
  }

  if (!updated) {
    // Diferencia só o que é do próprio usuário: "não existe" e "não é seu"
    // seguem com a mesma resposta.
    const { data: existing } = await db
      .from("store_orders")
      .select("status")
      .eq("id", orderId)
      .eq("metadata->>user_id", userId)
      .maybeSingle()
    if (!existing) return { ok: false, error: "Pedido não encontrado.", status: 404 }
    if (existing.status === "delivered") return { ok: true }
    return { ok: false, error: "Só dá para confirmar o recebimento de um pedido já enviado.", status: 400 }
  }

  await notifyDiscordOrderEvent({
    orderId,
    status: "delivered",
    actor: "cliente",
    note: "Recebimento confirmado pelo cliente.",
  })

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

  const [{ data: products }, selectionRules] = await Promise.all([
    db
      .from("store_products")
      .select("id, slug, name, price_cents, promo_price_cents, stock, images, is_active, is_sold_out")
      .in("id", productIds),
    getSelectionRulesForCheckout(productIds),
  ])

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
      // Produto que exige escolha que o snapshot não guarda (opção de grupo,
      // ou variante quando o pedido antigo não tinha) não volta pronto para o
      // carrinho: o checkout recusaria a linha incompleta (ver
      // `getSelectionRulesForCheckout`). A pessoa escolhe de novo na página.
      available:
        product.is_active &&
        !product.is_sold_out &&
        selectionRules !== null &&
        (selectionRules.get(product.id)?.groupIds.length ?? 0) === 0 &&
        (!selectionRules.get(product.id)?.requiresVariant || Boolean(item.variant_id)),
    })
  }

  return { ok: true, items: reorderItems }
}
