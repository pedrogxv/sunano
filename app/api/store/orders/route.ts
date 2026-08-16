import { NextRequest, NextResponse } from "next/server"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { listOrdersByUser } from "@/lib/server/repositories/orders-repository"

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

  const { orders, total, hasMore } = await listOrdersByUser(user.id, page, pageSize)
  return NextResponse.json({ orders, total, hasMore })
}
