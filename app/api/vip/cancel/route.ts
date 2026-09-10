import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { AsaasError, cancelSubscription } from "@/lib/server/integrations/asaas"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import {
  getLatestSubscriptionForUser,
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
  const clientId = getClientIdentifier(request)
  const rateLimit = await checkRateLimit({
    action: "vip_subscribe_cancel",
    identifier: clientId,
    maxAttempts: 5,
    windowSeconds: 600,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
  }

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
  }

  // Usa a assinatura MAIS RECENTE, não só a "em andamento". Uma linha já
  // marcada `canceled` localmente cuja assinatura continua viva na Asaas
  // (cancel que gravou local mas falhou lá, ou webhook que cancelou a linha
  // sem que a Asaas encerrasse a cobrança) travava este endpoint em 404 —
  // o usuário seguia sendo cobrado todo mês SEM NENHUMA forma de parar.
  // Cancelar é sempre permitido enquanto houver algo a cancelar na Asaas.
  const subscription = await getLatestSubscriptionForUser(user.id)
  if (!subscription) {
    return NextResponse.json({ error: "Nenhuma assinatura encontrada." }, { status: 404 })
  }

  if (subscription.asaasSubscriptionId) {
    try {
      await cancelSubscription(subscription.asaasSubscriptionId)
    } catch (err) {
      // Clique duplo / retry: a 1ª chamada já apagou a assinatura e a Asaas
      // agora responde 404 (ou "não encontrada"). Do nosso lado o objetivo
      // — assinatura cancelada na Asaas — está cumprido, então seguimos
      // para marcar local em vez de devolver 502 com a UI travada.
      const goneAtAsaas =
        err instanceof AsaasError &&
        (err.status === 404 || err.code === "invalid_action" || err.status === 400)
      if (!goneAtAsaas) {
        console.error("[vip/cancel] cancelSubscription:", err)
        return NextResponse.json({ error: "Não foi possível cancelar a assinatura." }, { status: 502 })
      }
      console.warn(
        "[vip/cancel] assinatura já inexistente na Asaas, seguindo para marcar local:",
        subscription.asaasSubscriptionId
      )
    }
  } else if (subscription.status === "canceled" || subscription.status === "expired") {
    // Sem id na Asaas e já terminada localmente: não há cobrança para
    // interromper. Só um 404 honesto — nada aqui está travado.
    return NextResponse.json({ error: "Nenhuma assinatura ativa encontrada." }, { status: 404 })
  }

  await cancelSubscriptionForUser(user.id)

  // `vip_expires_at` não recua no cancelamento voluntário — o acesso segue
  // até o fim do período já pago. Devolvemos a data para a UI mostrar
  // "VIP ativo até DD/MM" sem um segundo fetch.
  return NextResponse.json({
    ok: true,
    accessUntil: subscription.currentPeriodEnd,
  })
}
