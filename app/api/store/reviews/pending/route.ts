import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { storeApiMaintenanceResponse } from "@/lib/server/auth/store-maintenance-gate"
import { listPendingReviewsForUser } from "@/lib/server/repositories/store-reviews-repository"

export const dynamic = "force-dynamic"

/**
 * Produtos que a pessoa logada pode avaliar e ainda não avaliou: de pedido
 * concluído e os liberados pelo admin. Alimenta o convite em Meus Pedidos.
 */
export async function GET(request: NextRequest) {
  const blocked = await storeApiMaintenanceResponse()
  if (blocked) return blocked

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const pending = await listPendingReviewsForUser(user.id)
  return NextResponse.json({ pending })
}
