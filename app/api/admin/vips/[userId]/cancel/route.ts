import { NextRequest, NextResponse } from "next/server"

import { authorizeVipWrite } from "@/lib/server/auth/vip-admin-guard"
import { getVipAdminDetail, logVipAdminAction } from "@/lib/server/repositories/vip-admin-repository"
import { AsaasError, cancelSubscription } from "@/lib/server/integrations/asaas"
import { cancelSubscriptionForUser } from "@/lib/server/repositories/vip-subscription-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

/**
 * POST /api/admin/vips/[userId]/cancel — encerra a assinatura recorrente na
 * Asaas. Permissão: `vip_write`.
 *
 * NÃO retira o VIP já pago, de propósito: o usuário pagou o ciclo corrente e
 * o acesso vale até `vip_expires_at` — mesmo comportamento do cancelamento
 * que o próprio usuário faz em `POST /api/vip/cancel`. Para tirar o acesso
 * na hora existe a revogação (`/grant` com `revoke: true`), que é uma decisão
 * diferente e está separada por isso.
 *
 * Um 404 da Asaas é tratado como SUCESSO: significa que a assinatura já não
 * existe lá, que é exatamente o estado desejado. Insistir em erro nesse caso
 * deixaria a linha local presa em `active` para sempre.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  const auth = await authorizeVipWrite(userId)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const detail = await getVipAdminDetail(userId)
  if (!detail) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
  }

  const asaasSubscriptionId = detail.subscription?.asaasSubscriptionId
  if (!asaasSubscriptionId) {
    return NextResponse.json(
      {
        error:
          "Este usuário não tem assinatura na Asaas para cancelar. Se o VIP veio de Aura ou de concessão manual, use Revogar.",
      },
      { status: 400 }
    )
  }

  try {
    await cancelSubscription(asaasSubscriptionId)
  } catch (err) {
    // Já não existe na origem: o objetivo do cancelamento já está cumprido,
    // só falta alinhar o espelho local (feito logo abaixo).
    if (!(err instanceof AsaasError && err.status === 404)) {
      console.error("[admin/vips] cancelamento na Asaas falhou:", err)
      return NextResponse.json(
        { error: "Não foi possível cancelar a assinatura na Asaas. Tente de novo em instantes." },
        { status: 502 }
      )
    }
  }

  await cancelSubscriptionForUser(userId)
  await logVipAdminAction({
    actorId: auth.actor.id,
    targetUserId: userId,
    action: "admin_vip_subscription_canceled",
    metadata: {
      asaasSubscriptionId,
      paymentMethod: detail.subscription?.paymentMethod ?? null,
      // O acesso segue valendo até aqui — é o que a UI promete ao admin.
      accessKeptUntil: detail.vipExpiresAt,
    },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ ok: true, accessKeptUntil: detail.vipExpiresAt })
}
