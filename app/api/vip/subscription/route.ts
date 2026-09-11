import { NextRequest, NextResponse } from "next/server"

import { isVipActive } from "@/lib/account-tier"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getLatestSubscriptionForUser } from "@/lib/server/repositories/vip-subscription-repository"
import { getPixQrCode } from "@/lib/server/integrations/asaas"
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

  // Cancelável = tem assinatura viva JÁ confirmada na Asaas
  // (`asaas_subscription_id`). No CARTÃO esse id só existe após o 1º
  // pagamento, então uma linha `pending` é um checkout em aberto que expira
  // sozinho — não há o que cancelar. No PIX a assinatura nasce na Asaas
  // junto com a linha, então mesmo `pending` (1º QR ainda não pago) já é
  // cancelável — e precisa ser: sem isso, quem gerou o QR e desistiu ficaria
  // com uma assinatura viva gerando cobrança todo mês sem nenhuma forma de
  // parar pela interface.
  const canCancel = isSubscriber && subscription!.asaasSubscriptionId != null

  // Cobrança PIX do ciclo em aberto — o QR que o usuário precisa pagar.
  // Buscado sob demanda (não guardamos a imagem: é grande e tem validade
  // própria). Falha aqui não derruba a aba: o resto do estado ainda é útil.
  let pendingPixPayment: {
    id: string
    qrCodeBase64: string
    copyPaste: string
    expiresAt: string
    amountCents: number
  } | null = null

  if (subscription?.paymentMethod === "pix" && subscription.pendingPaymentId && isSubscriber) {
    try {
      const qr = await getPixQrCode(subscription.pendingPaymentId, { clampToOrderWindow: false })
      pendingPixPayment = {
        id: subscription.pendingPaymentId,
        qrCodeBase64: qr.encodedImage,
        copyPaste: qr.payload,
        expiresAt: qr.expirationDate,
        amountCents: VIP_SUBSCRIPTION_PRICE_CENTS,
      }
    } catch (err) {
      console.error("[vip/subscription] getPixQrCode falhou:", err)
    }
  }

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
          paymentMethod: subscription.paymentMethod,
          currentPeriodEnd: subscription.currentPeriodEnd,
          canceledAt: subscription.canceledAt,
          pendingPixPayment,
        }
      : null,
  })
}
