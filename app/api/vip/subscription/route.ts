import { NextRequest, NextResponse } from "next/server"

import { isVipActive } from "@/lib/account-tier"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getLatestSubscriptionForUser } from "@/lib/server/repositories/vip-subscription-repository"
import { getPixQrCode } from "@/lib/server/integrations/asaas"
import { syncSubscriptionWithAsaas } from "@/lib/server/vip-subscription-sync"
import { getVipPlan, VIP_PLANS } from "@/lib/vip-plan"
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

  // Checkout de cartão em aberto: a única forma de "assinatura pendente" que
  // NÃO tem assinatura na Asaas por trás (o id só nasce no 1º pagamento).
  // Enquanto a UI não recebia estes dados, este era um estado sem saída —
  // mostrava "aguarde expirar" e nada mais. Com o link e o prazo, a aba
  // oferece retomar o pagamento ou desistir (POST /api/vip/checkout/cancel).
  const pendingCheckout =
    subscription &&
    subscription.status === "pending" &&
    subscription.asaasCheckoutId != null &&
    subscription.asaasSubscriptionId == null
      ? {
          // A URL é a mesma para a qual o usuário já foi redirecionado ao
          // assinar, e a página hospedada exige os dados do cartão de
          // qualquer forma — devolvê-la não expõe nada que ele já não tenha.
          link: subscription.checkoutLink,
          expiresAt: subscription.checkoutExpiresAt,
        }
      : null

  // Cancelável = tem assinatura viva JÁ confirmada na Asaas
  // (`asaas_subscription_id`). No CARTÃO esse id só existe após o 1º
  // pagamento, então uma linha `pending` é um checkout em aberto: não há
  // ASSINATURA para cancelar, e desistir dele é outra operação — o
  // `pendingCheckout` acima, via POST /api/vip/checkout/cancel. No PIX a assinatura nasce na Asaas
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
        // Valor do plano CONTRATADO, não de um preço global: a aba mostra o
        // QR de uma cobrança real, e num plano anual ela é de R$ 89,90.
        amountCents: getVipPlan(subscription.billingPeriod).priceCents,
      }
    } catch (err) {
      console.error("[vip/subscription] getPixQrCode falhou:", err)
    }
  }

  return NextResponse.json({
    subscriptionEnabled: isVipSubscriptionEnabled(),
    vipActive,
    vipExpiresAt: profile?.vip_expires_at ?? null,
    // Catálogo completo: a aba oferece assinar/reativar em qualquer plano, e
    // precisa dos dois preços sem repeti-los no cliente.
    plans: Object.values(VIP_PLANS).map((plan) => ({
      period: plan.period,
      priceCents: plan.priceCents,
      months: plan.months,
      label: plan.label,
      unitLabel: plan.unitLabel,
    })),
    subscription: subscription
      ? {
          status: subscription.status,
          isSubscriber,
          canCancel,
          paymentMethod: subscription.paymentMethod,
          // Plano em vigor — governa o que a aba diz sobre a próxima cobrança
          // ("renova todo mês" vs "renova todo ano") e quanto ela custa.
          billingPeriod: subscription.billingPeriod,
          priceCents: getVipPlan(subscription.billingPeriod).priceCents,
          currentPeriodEnd: subscription.currentPeriodEnd,
          canceledAt: subscription.canceledAt,
          pendingPixPayment,
          pendingCheckout,
        }
      : null,
  })
}
