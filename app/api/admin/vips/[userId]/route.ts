import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { authorizeVipRead } from "@/lib/server/auth/vip-admin-guard"
import { getVipAdminDetail } from "@/lib/server/repositories/vip-admin-repository"
import { getSubscription, getSubscriptionPayments } from "@/lib/server/integrations/asaas"
import { syncSubscriptionWithAsaas } from "@/lib/server/vip-subscription-sync"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/vips/[userId] — detalhe de um VIP, incluindo o que a ASAAS
 * diz sobre a assinatura e o histórico de cobranças dela.
 *
 * Reconcilia ANTES de responder (mesma escolha de `GET /api/vip/subscription`):
 * esta é a tela onde o admin vai quando algo parece errado, então é o lugar
 * certo para o estado local se consertar sozinho. Falha na reconciliação
 * nunca derruba a leitura — no pior caso mostra o estado local e sinaliza.
 *
 * Permissão: `vip_read`.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  const auth = await authorizeVipRead(userId)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let syncFailed = false
  try {
    await syncSubscriptionWithAsaas(userId)
  } catch (err) {
    syncFailed = true
    console.error("[admin/vips] reconciliação falhou, seguindo com estado local:", err)
  }

  const detail = await getVipAdminDetail(userId)
  if (!detail) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
  }

  // Estado na origem + cobranças do ciclo. Só faz sentido quando existe
  // assinatura na Asaas: um checkout de cartão em aberto ainda não tem id
  // (ele nasce no 1º pagamento), e VIP de Aura/manual nunca teve.
  let asaas: {
    status: string
    deleted: boolean
    nextDueDate: string | null
    valueCents: number | null
  } | null = null
  let payments: Array<{
    id: string
    status: string
    valueCents: number | null
    dueDate: string | null
    paymentDate: string | null
    billingType: string | null
    invoiceUrl: string | null
    receiptUrl: string | null
  }> = []
  let asaasUnavailable = false

  const subscriptionId = detail.subscription?.asaasSubscriptionId
  if (subscriptionId) {
    try {
      const [subscription, subscriptionPayments] = await Promise.all([
        getSubscription(subscriptionId),
        getSubscriptionPayments(subscriptionId),
      ])
      asaas = {
        status: subscription.status,
        deleted: Boolean(subscription.deleted),
        nextDueDate: subscription.nextDueDate ?? null,
        // A Asaas trabalha em reais; o resto do sistema, em centavos.
        valueCents: subscription.value != null ? Math.round(subscription.value * 100) : null,
      }
      payments = subscriptionPayments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        valueCents: payment.value != null ? Math.round(payment.value * 100) : null,
        dueDate: payment.dueDate ?? null,
        paymentDate: payment.paymentDate ?? payment.clientPaymentDate ?? null,
        billingType: payment.billingType ?? null,
        invoiceUrl: payment.invoiceUrl ?? null,
        receiptUrl: payment.transactionReceiptUrl ?? null,
      }))
    } catch (err) {
      // Asaas fora do ar não pode derrubar a tela: o estado local ainda é
      // útil, e a UI mostra que os dados da origem não puderam ser lidos.
      asaasUnavailable = true
      console.error("[admin/vips] consulta à Asaas falhou:", err)
    }
  }

  return NextResponse.json({
    ok: true,
    vip: detail,
    asaas,
    payments,
    asaasUnavailable,
    syncFailed,
    // Cosmético: esconde as ações de quem só tem `vip_read`. A autorização de
    // verdade está em `authorizeVipWrite`, nas rotas de escrita.
    canWrite: hasAdminPermission(auth.actor, "vip_write"),
  })
}
