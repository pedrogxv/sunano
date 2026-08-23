import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { cancelSubscription } from "@/lib/server/integrations/asaas"
import {
  getOngoingSubscriptionForUser,
  cancelSubscriptionForUser,
} from "@/lib/server/repositories/vip-subscription-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/vip/cancel — usuário pede cancelamento da assinatura. Ação
 * direta (não espera webhook): cancela na Asaas primeiro, depois marca
 * local. `vip_expires_at` não recua — mantém acesso até o fim do período já
 * pago, padrão de qualquer assinatura.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
  }

  const subscription = await getOngoingSubscriptionForUser(user.id)
  if (!subscription) {
    return NextResponse.json({ error: "Nenhuma assinatura ativa encontrada." }, { status: 404 })
  }

  if (subscription.asaasSubscriptionId) {
    try {
      await cancelSubscription(subscription.asaasSubscriptionId)
    } catch (err) {
      console.error("[vip/cancel] cancelSubscription:", err)
      return NextResponse.json({ error: "Não foi possível cancelar a assinatura." }, { status: 502 })
    }
  }

  await cancelSubscriptionForUser(user.id)

  return NextResponse.json({ ok: true })
}
