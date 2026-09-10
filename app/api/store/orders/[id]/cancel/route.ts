import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { cancelOrder } from "@/lib/server/repositories/orders-repository"
import { dbErrorResponse } from "@/lib/db-errors"

/**
 * Permite o próprio cliente cancelar um pedido enquanto ele ainda está
 * `pending`. Guest checkout não tem histórico de pedidos (só o polling por
 * id/token na página de pagamento), então essa ação exige sessão — mesma
 * restrição de `GET /api/store/orders`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  // Segunda trava do modo somente-leitura da impersonation (ver proxy.ts):
  // cancelar devolve estoque e mata a cobrança — escrita, nunca suporte.
  if (isImpersonating(request)) {
    return NextResponse.json(
      {
        error: "impersonation_read_only",
        message: "Sessão de acesso é somente leitura; não é possível cancelar um pedido.",
      },
      { status: 403 }
    )
  }

  const db = createSupabaseAdminClient()
  const { data: order, error } = await db
    .from("store_orders")
    .select("id, metadata")
    .eq("id", id)
    .single()

  if (error || !order) {
    const { body, status } = dbErrorResponse(error, "Pedido não encontrado.")
    return NextResponse.json(body, { status })
  }

  if (order.metadata?.user_id !== user.id) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })
  }

  const result = await cancelOrder(id, {})
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
