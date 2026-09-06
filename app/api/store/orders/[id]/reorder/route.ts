import { NextRequest, NextResponse } from "next/server"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { getOrderItemsForReorder } from "@/lib/server/repositories/orders-repository"

export const runtime = "nodejs"

/**
 * Devolve os itens de um pedido em formato de carrinho, para a pessoa
 * recomprar em um clique.
 *
 * Existe por causa do pedido EXPIRADO: um PIX que venceu é a intenção de
 * compra mais qualificada que a loja tem — a pessoa escolheu, informou CPF,
 * gerou a cobrança e não pagou. Até aqui ele virava `expired`, devolvia o
 * estoque e acabava ali, sem nenhum caminho de volta.
 *
 * Não recria o pedido nem reserva estoque: devolve o carrinho e deixa a
 * pessoa passar pelo checkout normalmente. Isso é de propósito — preço e
 * disponibilidade podem ter mudado desde a compra original, e o checkout é
 * quem sabe disso (a rota de validação de carrinho avisa antes do submit).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const result = await getOrderItemsForReorder(id, user.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ items: result.items })
}
