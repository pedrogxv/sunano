"use client"

import { useEffect, useState } from "react"
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

export type UseUserOrdersResult = {
  orders: UserOrder[]
  pendingOrder: UserOrder | null
  loading: boolean
}

/**
 * Pedidos do usuário logado. Usado tanto pelo aviso de pendência no popover
 * do miniperfil quanto pela página /conta/pedidos — uma única fonte evita
 * duas chamadas divergentes pra mesma lista.
 */
export function useUserOrders(): UseUserOrdersResult {
  const { user } = useAuthUser()
  const [orders, setOrders] = useState<UserOrder[]>([])
  const [loading, setLoading] = useState(Boolean(user))

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetch("/api/store/orders")
      .then((res) => (res.ok ? res.json() : { orders: [] }))
      .then((data: { orders?: UserOrder[] }) => {
        if (!cancelled) setOrders(data.orders ?? [])
      })
      .catch(() => {
        if (!cancelled) setOrders([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const pendingOrder = orders.find((o) => o.status === "pending") ?? null

  return { orders, pendingOrder, loading }
}
