import { NextRequest, NextResponse } from "next/server"

import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { confirmOrderDelivered } from "@/lib/server/repositories/orders-repository"

export const runtime = "nodejs"

/**
 * "Já recebi meu produto": o dono do pedido marca como entregue um pedido que
 * já foi enviado. O admin continua podendo marcar pelo painel; quem chegar
 * primeiro fecha o pedido, e o segundo recebe `ok` (já está entregue).
 *
 * Posse e status de origem são conferidos no próprio UPDATE, no repositório.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  // Segunda trava do modo somente-leitura da impersonation (ver proxy.ts):
  // confirmar o recebimento em nome do cliente fecharia o pedido dele.
  if (isImpersonating(request)) {
    return NextResponse.json(
      {
        error: "impersonation_read_only",
        message: "Sessão de acesso é somente leitura; não é possível confirmar o recebimento.",
      },
      { status: 403 }
    )
  }

  const result = await confirmOrderDelivered(id, user.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
