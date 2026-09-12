import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { authorizeVipWrite } from "@/lib/server/auth/vip-admin-guard"
import {
  getVipAdminDetail,
  grantVipManually,
  logVipAdminAction,
  revokeVipManually,
} from "@/lib/server/repositories/vip-admin-repository"
import { cancelSubscription } from "@/lib/server/integrations/asaas"
import { cancelSubscriptionForUser } from "@/lib/server/repositories/vip-subscription-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Mesmo padrão de `/api/admin/users/ban` — a trilha registra de onde veio a ação. */
function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

/**
 * POST /api/admin/vips/[userId]/grant — concede, estende ou revoga VIP
 * manualmente. Permissão: `vip_write`.
 *
 * `months`: quantos meses somar ao acesso atual (estende, nunca encurta —
 * ver `grantVipManually`). `lifetime: true` concede VIP sem expiração.
 * `revoke: true` rebaixa para membro comum.
 *
 * REVOGAR CANCELA A ASSINATURA JUNTO, e isso é deliberado: tirar o acesso
 * sem parar a cobrança deixaria a pessoa pagando por nada — o pior desfecho
 * possível desta tela. Se o cancelamento na Asaas falhar, a revogação é
 * ABORTADA e nada muda; melhor não fazer nada do que fazer metade.
 */
const bodySchema = z
  .object({
    months: z.number().int().min(1).max(120).optional(),
    lifetime: z.boolean().optional(),
    revoke: z.boolean().optional(),
  })
  .refine(
    (value) =>
      [value.months != null, value.lifetime === true, value.revoke === true].filter(Boolean).length === 1,
    { message: "Escolha exatamente uma ação: meses, vitalício ou revogar." }
  )

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  // Permissão + id válido + "não sobre si mesmo" + hierarquia de cargo.
  const auth = await authorizeVipWrite(userId)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Parâmetros inválidos." },
      { status: 400 }
    )
  }

  const before = await getVipAdminDetail(userId)
  if (!before) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
  }

  const ipAddress = getClientIp(request)

  // ── Revogar ────────────────────────────────────────────────────────────
  if (parsed.data.revoke) {
    const asaasSubscriptionId = before.subscription?.asaasSubscriptionId
    const stillCharging =
      before.subscription != null &&
      (before.subscription.status === "active" ||
        before.subscription.status === "past_due" ||
        before.subscription.status === "pending")

    if (asaasSubscriptionId && stillCharging) {
      try {
        await cancelSubscription(asaasSubscriptionId)
      } catch (err) {
        console.error("[admin/vips] cancelamento na Asaas falhou, revogação abortada:", err)
        return NextResponse.json(
          {
            error:
              "Não foi possível cancelar a assinatura na Asaas. O VIP NÃO foi revogado — revogar sem parar a cobrança deixaria o usuário pagando sem acesso. Tente de novo em instantes.",
          },
          { status: 502 }
        )
      }
      await cancelSubscriptionForUser(userId)
    }

    await revokeVipManually(userId)
    await logVipAdminAction({
      actorId: auth.actor.id,
      targetUserId: userId,
      action: "admin_vip_revoked",
      metadata: {
        previousExpiresAt: before.vipExpiresAt,
        previousOrigin: before.origin,
        canceledSubscription: Boolean(asaasSubscriptionId && stillCharging),
        asaasSubscriptionId: asaasSubscriptionId ?? null,
      },
      ipAddress,
    })

    return NextResponse.json({
      ok: true,
      action: "revoked",
      canceledSubscription: Boolean(asaasSubscriptionId && stillCharging),
    })
  }

  // ── Conceder / estender ────────────────────────────────────────────────
  const months = parsed.data.lifetime ? null : (parsed.data.months as number)
  const result = await grantVipManually({ userId, months })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  await logVipAdminAction({
    actorId: auth.actor.id,
    targetUserId: userId,
    action: "admin_vip_granted",
    metadata: {
      months,
      lifetime: months === null,
      previousExpiresAt: before.vipExpiresAt,
      newExpiresAt: result.expiresAt,
    },
    ipAddress,
  })

  return NextResponse.json({ ok: true, action: "granted", expiresAt: result.expiresAt })
}
