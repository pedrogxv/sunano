"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuthUser } from "@/components/providers/auth-context"

export type UserOrderItem = {
  id?: string
  name?: string
  quantity?: number
  price_cents?: number
  variant_label?: string | null
  variant_options?: { group: string; label: string }[] | null
  image?: string | null
}

export type UserOrder = {
  id: string
  status: "pending" | "paid" | "awaiting_shipping_info" | "shipped" | "delivered" | "cancelled" | "refunded" | "expired"
  total_cents: number
  items: UserOrderItem[]
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

export type UserOrderFilters = {
  status?: UserOrder["status"]
  dateFrom?: string
  dateTo?: string
}

export type UseUserOrdersOptions = {
  page?: number
  pageSize?: number
  filters?: UserOrderFilters
}

export type UseUserOrdersResult = {
  orders: UserOrder[]
  pendingOrder: UserOrder | null
  total: number
  hasMore: boolean
  loading: boolean
  refetch: () => void
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
  const [loading, setLoading] = useState(Boolean(user))
  const [reloadToken, setReloadToken] = useState(0)

  const page = options?.page ?? 1
  const pageSize = options?.pageSize ?? 20
  const status = options?.filters?.status
  const dateFrom = options?.filters?.dateFrom
  const dateTo = options?.filters?.dateTo

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("pageSize", String(pageSize))
    if (status) params.set("status", status)
    if (dateFrom) params.set("dateFrom", dateFrom)
    if (dateTo) params.set("dateTo", dateTo)
    return params.toString()
  }, [page, pageSize, status, dateFrom, dateTo])

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
      .then((data: { orders?: UserOrder[]; total?: number; hasMore?: boolean }) => {
        if (cancelled) return
        setOrders(data.orders ?? [])
        setTotal(data.total ?? 0)
        setHasMore(data.hasMore ?? false)
      })
      .catch(() => {
        if (cancelled) return
        setOrders([])
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

  return { orders, pendingOrder, total, hasMore, loading, refetch }
}
