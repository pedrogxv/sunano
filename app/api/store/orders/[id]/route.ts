import { timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { dbErrorResponse } from "@/lib/db-errors"

/**
 * Usada pela página de checkout PIX para fazer polling do status do
 * pagamento enquanto aguarda o webhook do gateway (MisticPay ou Asaas)
 * confirmar.
 *
 * Posse do pedido é provada por sessão (pedidos logados) OU pelo
 * `access_token` opaco gerado na criação (guest checkout) — comparado com
 * timingSafeEqual para não vazar o token por diferença de tempo de resposta.
 */
function safeTokenMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createSupabaseAdminClient()

  const { data: order, error } = await db
    .from("store_orders")
    .select(
      "id, status, total_cents, pix_copy_paste, pix_qr_code_base64, access_token, metadata, items, created_at, payment_method, misticpay_e2e, asaas_payment_id, asaas_receipt_url"
    )
    .eq("id", id)
    .single()

  if (error || !order) {
    const { body, status } = dbErrorResponse(error, "Pedido não encontrado.")
    return NextResponse.json(body, { status })
  }

  const user = await getRequestUser(request)
  const providedToken = request.nextUrl.searchParams.get("token")

  const ownsAsUser = user && order.metadata?.user_id === user.id
  const ownsAsGuest =
    !ownsAsUser && order.access_token && providedToken && safeTokenMatch(providedToken, order.access_token)

  if (!ownsAsUser && !ownsAsGuest) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })
  }

  return NextResponse.json({
    id: order.id,
    status: order.status,
    totalCents: order.total_cents,
    copyPaste: order.pix_copy_paste,
    qrCodeBase64: order.pix_qr_code_base64,
    items: order.items,
    createdAt: order.created_at,
    paymentMethod: order.payment_method,
    // Comprovantes: só existem depois de pago. E2E é o identificador oficial
    // do Banco Central pro PIX (MisticPay); o Asaas devolve um link de
    // comprovante (transactionReceiptUrl/invoiceUrl) cacheado pelo webhook.
    receipt:
      order.status === "paid"
        ? {
            misticpayE2e: order.misticpay_e2e,
            asaasPaymentId: order.asaas_payment_id,
            asaasReceiptUrl: order.asaas_receipt_url,
          }
        : null,
  })
}
