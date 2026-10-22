import { NextRequest, NextResponse } from "next/server"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { countMissingShippingByUser, listOrdersByUser, type OrderStatus } from "@/lib/server/repositories/orders-repository"
import { getPaymentComplementProduct } from "@/lib/server/repositories/order-complement-repository"
import { getOpenOrderTickets } from "@/lib/server/repositories/support-repository"

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
  // Filtro "falta endereço" de "Meus Pedidos" — resolvido no banco, não
  // filtrando a página já paginada (senão a contagem e a paginação mentem).
  const missingShipping = url.searchParams.get("missingShipping") === "1"
  // Contagem do aviso "falta endereço" sobre o histórico inteiro. Opt-in: só
  // "Meus Pedidos" mostra o aviso; o popover do miniperfil chama esta rota em
  // toda página e não precisa da consulta a mais.
  const withMissingCount = url.searchParams.get("withMissingCount") === "1"

  const [{ orders, total, hasMore }, complementProduct, missingShippingCount] = await Promise.all([
    listOrdersByUser(user.id, page, pageSize, {
      status,
      dateFrom,
      dateTo,
      missingShipping,
    }),
    // O passo a passo do complemento (Meus Pedidos) aponta para o anúncio.
    getPaymentComplementProduct(),
    withMissingCount ? countMissingShippingByUser(user.id) : Promise.resolve(0),
  ])
  // Conversa aberta de cada pedido: o "Chat com a loja" do card reabre a
  // mesma em vez de criar outra, e a que espera o usuário acende o aviso de
  // resposta da equipe. Em lote, uma consulta para a página.
  const orderTickets = await getOpenOrderTickets(
    user.id,
    orders.map((order) => order.id)
  )
  return NextResponse.json({
    orders: orders.map((order) => {
      const ticket = orderTickets.get(order.id)
      return {
        ...order,
        chat_ticket_id: ticket?.ticketId ?? null,
        awaiting_reply_ticket_id: ticket?.waitingOnUser ? ticket.ticketId : null,
      }
    }),
    total,
    hasMore,
    missingShippingCount,
    complementProductSlug: complementProduct?.slug ?? null,
  })
}
