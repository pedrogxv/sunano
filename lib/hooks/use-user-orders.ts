"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuthUser } from "@/components/providers/auth-context"
// `import type` é apagado no build: não puxa `server-only` para o bundle.
import type { OrderShippingAddress } from "@/lib/server/repositories/orders-repository"
import type { OrderServiceFormAnswers } from "@/lib/store-service-form"
import type { OrderComplementSummary } from "@/lib/store-payment-complement"

export type UserOrderItem = {
  id?: string
  name?: string
  quantity?: number
  price_cents?: number
  variant_label?: string | null
  variant_options?: { group: string; label: string }[] | null
  image?: string | null
  /** Snapshot de `sale_type` na hora da compra (pedidos antigos não têm). */
  sale_type?: "pre_order" | "ready_stock" | "normal" | null
  /** Campos do formulário pós-compra de serviço (snapshot; ler com `serviceFormLines`). */
  service_form?: unknown
}

export type UserOrder = {
  id: string
  status: "pending" | "paid" | "awaiting_shipping_info" | "shipped" | "delivered" | "cancelled" | "refunded" | "expired"
  total_cents: number
  items: UserOrderItem[]
  created_at: string
  /** `'aura'` = resgate de produto físico da Central pago com Aura (ver `aura_cost_paid`). */
  payment_method: string | null
  /** Não-nulo = pedido pago com Aura; é o custo que saiu da carteira. */
  aura_cost_paid: number | null
  asaas_payment_id: string | null
  asaas_receipt_url: string | null
  pix_copy_paste: string | null
  pix_qr_code_base64: string | null
  tracking_code: string | null
  carrier: string | null
  /**
   * Para onde o pedido vai. Null = ainda não informado — o cliente pulou o
   * endereço no checkout e precisa completar aqui antes do despacho.
   */
  shipping_address: OrderShippingAddress | null
  /**
   * false = pedido de serviço/item digital: não há o que despachar, e a
   * ausência de endereço não é pendência nenhuma.
   */
  requires_shipping_address: boolean
  /** Formulário pós-compra de serviço já preenchido. Null = ainda não (ou o pedido não tem). */
  service_form_answers: OrderServiceFormAnswers | null
  /** Complemento de Pagamento cobrado neste pedido (`dueCents` null = nada cobrado). */
  complement: OrderComplementSummary
  /** Este pedido é o pagamento de complemento do pedido indicado. */
  complement_for: { order_id: string; order_number: string } | null
  /** Prazo da loja para pagar um pedido `pending`. */
  payment_expires_at: string | null
}

/**
 * Pedido pago, de item físico, ainda sem endereço — está parado esperando o
 * cliente. É a única condição que gera aviso; um pedido `pending` sem
 * endereço ainda nem foi pago, e um serviço nunca precisa de um.
 */
export function isMissingShippingAddress(order: UserOrder): boolean {
  return (
    order.requires_shipping_address &&
    !order.shipping_address &&
    (order.status === "paid" || order.status === "awaiting_shipping_info")
  )
}

export type UserOrderFilters = {
  status?: UserOrder["status"]
  dateFrom?: string
  dateTo?: string
  /** Só pedidos pagos de item físico que ainda estão sem endereço. */
  missingShipping?: boolean
}

export type UseUserOrdersOptions = {
  page?: number
  pageSize?: number
  filters?: UserOrderFilters
  /** Traz `missingShippingCount` (histórico inteiro, ignora página e filtros). */
  withMissingCount?: boolean
}

export type UseUserOrdersResult = {
  orders: UserOrder[]
  pendingOrder: UserOrder | null
  total: number
  hasMore: boolean
  /** Pedidos pagos sem endereço no histórico inteiro; 0 sem `withMissingCount`. */
  missingShippingCount: number
  loading: boolean
  refetch: () => void
  /** Slug do anúncio "Complemento de Pagamento"; null se ele está desativado. */
  complementProductSlug: string | null
}

/** Rota de continuação do pagamento de acordo com o método escolhido no pedido. */
export function pendingPaymentHref(order: UserOrder): string {
  return order.payment_method === "credit_card"
    ? `/checkout/card?orderId=${order.id}`
    : `/checkout/pix?orderId=${order.id}`
}

/**
 * Pedidos do usuário logado. Usado tanto pelo aviso de pendência no popover
 * do miniperfil quanto pela página /conta/pedidos — uma única fonte evita
 * duas chamadas divergentes pra mesma lista. Paginado no banco (ver
 * `listOrdersByUser`); sem `options`, traz só a primeira página recente
 * (suficiente pro popover de pendência e pro seletor do formulário de
 * suporte, que não precisam do histórico inteiro).
 */
export function useUserOrders(options?: UseUserOrdersOptions): UseUserOrdersResult {
  const { user } = useAuthUser()
  const [orders, setOrders] = useState<UserOrder[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [missingShippingCount, setMissingShippingCount] = useState(0)
  const [loading, setLoading] = useState(Boolean(user))
  const [reloadToken, setReloadToken] = useState(0)
  const [complementProductSlug, setComplementProductSlug] = useState<string | null>(null)

  const page = options?.page ?? 1
  const pageSize = options?.pageSize ?? 20
  const status = options?.filters?.status
  const dateFrom = options?.filters?.dateFrom
  const dateTo = options?.filters?.dateTo
  const missingShipping = options?.filters?.missingShipping
  const withMissingCount = options?.withMissingCount

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("pageSize", String(pageSize))
    if (status) params.set("status", status)
    if (dateFrom) params.set("dateFrom", dateFrom)
    if (dateTo) params.set("dateTo", dateTo)
    if (missingShipping) params.set("missingShipping", "1")
    if (withMissingCount) params.set("withMissingCount", "1")
    return params.toString()
  }, [page, pageSize, status, dateFrom, dateTo, missingShipping, withMissingCount])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    // Disparado fora do corpo síncrono do efeito para não encadear duas
    // renderizações seguidas (setLoading + os setters do fetch abaixo).
    queueMicrotask(() => {
      if (!cancelled) setLoading(true)
    })
    fetch(`/api/store/orders?${queryString}`)
      .then((res) => (res.ok ? res.json() : { orders: [], total: 0, hasMore: false }))
      .then(
        (data: {
          orders?: UserOrder[]
          total?: number
          hasMore?: boolean
          missingShippingCount?: number
          complementProductSlug?: string | null
        }) => {
          if (cancelled) return
          setOrders(data.orders ?? [])
          setMissingShippingCount(data.missingShippingCount ?? 0)
          setComplementProductSlug(data.complementProductSlug ?? null)
          setTotal(data.total ?? 0)
          setHasMore(data.hasMore ?? false)
        }
      )
      .catch(() => {
        if (cancelled) return
        setOrders([])
        setMissingShippingCount(0)
        setTotal(0)
        setHasMore(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, queryString, reloadToken])

  const pendingOrder = orders.find((o) => o.status === "pending") ?? null
  const refetch = () => setReloadToken((n) => n + 1)

  return {
    orders,
    pendingOrder,
    total,
    hasMore,
    missingShippingCount,
    loading,
    refetch,
    complementProductSlug,
  }
}
