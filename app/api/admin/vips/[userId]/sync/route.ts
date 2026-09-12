import { NextRequest, NextResponse } from "next/server"

import { authorizeVipWrite } from "@/lib/server/auth/vip-admin-guard"
import { getVipAdminDetail, logVipAdminAction } from "@/lib/server/repositories/vip-admin-repository"
import { syncSubscriptionWithAsaas } from "@/lib/server/vip-subscription-sync"

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
 * POST /api/admin/vips/[userId]/sync — força a reconciliação da assinatura
 * com a Asaas. Permissão: `vip_write`.
 *
 * É a mesma rotina que roda sozinha quando o usuário abre a aba de assinatura
 * (`syncSubscriptionWithAsaas`): a Asaas é a fonte de verdade, o banco local
 * é espelho, e webhook perdido faz os dois divergirem. A diferença é quem
 * dispara — aqui o admin, atendendo alguém que reclamou, sem depender de a
 * pessoa abrir a própria tela.
 *
 * `unverified: true` significa que a Asaas não pôde ser consultada — nesse
 * caso NADA foi concluído nem alterado, e a UI precisa dizer isso em vez de
 * fingir que sincronizou.
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

  try {
    const result = await syncSubscriptionWithAsaas(userId)

    // Só registra quando algo de fato mudou: uma reconciliação que confirmou
    // o estado não é um evento de auditoria, é rotina.
    if (result.changed) {
      await logVipAdminAction({
        actorId: auth.actor.id,
        targetUserId: userId,
        action: "admin_vip_subscription_synced",
        metadata: {
          statusAfter: result.ongoing?.status ?? null,
          asaasSubscriptionId: result.ongoing?.asaasSubscriptionId ?? null,
        },
        ipAddress: getClientIp(request),
      })
    }

    const vip = await getVipAdminDetail(userId)
    return NextResponse.json({
      ok: true,
      changed: result.changed,
      unverified: result.unverified,
      vip,
    })
  } catch (err) {
    console.error("[admin/vips] sync falhou:", err)
    return NextResponse.json(
      { error: "Não foi possível sincronizar com a Asaas. Tente de novo em instantes." },
      { status: 502 }
    )
  }
}
