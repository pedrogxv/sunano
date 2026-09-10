import { NextRequest, NextResponse } from "next/server"

import { isVipActive } from "@/lib/account-tier"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getLatestSubscriptionForUser } from "@/lib/server/repositories/vip-subscription-repository"
import { syncSubscriptionWithAsaas } from "@/lib/server/vip-subscription-sync"
import { VIP_SUBSCRIPTION_PRICE_CENTS } from "@/lib/vip-plan"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/vip/subscription — estado da assinatura recorrente do usuário,
 * para a aba "Assinatura" das configurações da conta.
 *
 * Junta duas fontes:
 *  - `vip_subscriptions` (a assinatura paga via cartão, se houver): status,
 *    data da próxima renovação, se dá para cancelar.
 *  - `user_profiles.account_tier`/`vip_expires_at`: o VIP "efetivo agora",
 *    que também cobre VIP por Aura ou por cargo (sem assinatura).
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  // Reconcilia com a Asaas ANTES de responder: esta aba é onde o usuário vai
  // quando algo parece errado, então é o lugar certo para o estado local se
  // consertar sozinho (linha `active` órfã de webhook perdido, assinatura
  // cancelada no painel da Asaas, VIP que sumiu apesar da cobrança seguir).
  // Falha aqui nunca derruba a leitura — no pior caso mostra o estado local.
  try {
    await syncSubscriptionWithAsaas(user.id)
  } catch (err) {
    console.error("[vip/subscription] reconciliação falhou, seguindo com estado local:", err)
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("account_tier, vip_expires_at")
    .eq("id", user.id)
    .single()

  const vipActive = isVipActive(profile?.account_tier, profile?.vip_expires_at)
  const subscription = await getLatestSubscriptionForUser(user.id)

  // Só é "assinante" quem tem uma linha viva (pending/active/past_due). Uma
  // linha canceled/expired é histórico — o acesso, se ainda houver, veio de
  // outra via (Aura/cargo) ou é o resto do período já pago.
  const isSubscriber =
    subscription != null &&
    (subscription.status === "pending" ||
      subscription.status === "active" ||
      subscription.status === "past_due")

  // Cancelável = tem assinatura viva JÁ confirmada na Asaas (asaas_subscription_id
  // só existe após o 1º pagamento). `pending` sem id ainda é um checkout em
  // aberto — não há o que cancelar do nosso lado, ele expira sozinho.
  const canCancel = isSubscriber && subscription!.asaasSubscriptionId != null

  return NextResponse.json({
    subscriptionEnabled: isVipSubscriptionEnabled(),
    vipActive,
    vipExpiresAt: profile?.vip_expires_at ?? null,
    priceCents: VIP_SUBSCRIPTION_PRICE_CENTS,
    subscription: subscription
      ? {
          status: subscription.status,
          isSubscriber,
          canCancel,
          currentPeriodEnd: subscription.currentPeriodEnd,
          canceledAt: subscription.canceledAt,
        }
      : null,
  })
}
