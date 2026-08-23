import { NextRequest, NextResponse } from "next/server"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { listOrdersByUser, type OrderStatus } from "@/lib/server/repositories/orders-repository"

const VALID_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "awaiting_shipping_info",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "expired",
]

/**
 * Lista os pedidos do usuário logado — usada pela página "Meus Pedidos" e
 * pelo aviso de pedido pendente no popover do miniperfil. Guest checkout não
 * tem histórico (não há sessão para atrelar), só o polling por id/token.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const url = new URL(request.url)
  const page = Number(url.searchParams.get("page")) || 1
  const pageSize = Number(url.searchParams.get("pageSize")) || 20
  const statusParam = url.searchParams.get("status")
  const status = VALID_STATUSES.includes(statusParam as OrderStatus) ? (statusParam as OrderStatus) : undefined
  const dateFrom = url.searchParams.get("dateFrom") || undefined
  const dateTo = url.searchParams.get("dateTo") || undefined

  const { orders, total, hasMore } = await listOrdersByUser(user.id, page, pageSize, {
    status,
    dateFrom,
    dateTo,
  })
  return NextResponse.json({ orders, total, hasMore })
}
