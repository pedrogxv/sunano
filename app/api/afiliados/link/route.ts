import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getAffiliateByUserId } from "@/lib/server/repositories/affiliates-repository"
import {
  AFFILIATES_MAINTENANCE_MESSAGE,
  isAffiliatesBlockedByMaintenance,
} from "@/lib/server/auth/affiliate-access"

export const dynamic = "force-dynamic"

/**
 * GET /api/afiliados/link
 *
 * Só o código de indicação de quem está logado — nada mais. Existe separado
 * de `/api/afiliados/me` porque quem chama é o botão "copiar link de
 * afiliado", que aparece em páginas públicas (produto da loja): puxar de lá
 * traria saldo, total sacado e o extrato inteiro para uma tela que não usa
 * nada disso, além de somar as queries do `getAffiliateSummary` a cada
 * pageview.
 *
 * Retorna `{ code: null }` — nunca 401/403 — para quem não é afiliado: a
 * ausência do botão é o comportamento normal da página, não um erro.
 */
export async function GET(request: NextRequest) {
  if (await isAffiliatesBlockedByMaintenance()) {
    return NextResponse.json({ error: AFFILIATES_MAINTENANCE_MESSAGE }, { status: 503 })
  }

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ code: null })

  const affiliate = await getAffiliateByUserId(user.id)

  // Só afiliado aprovado tem link que gera comissão. Pendente/recusado/
  // suspenso vê a tela igual a quem não é afiliado.
  if (!affiliate || affiliate.status !== "approved" || !affiliate.code) {
    return NextResponse.json({ code: null })
  }

  return NextResponse.json({ code: affiliate.code })
}
