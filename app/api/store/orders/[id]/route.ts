import { timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { dbErrorResponse } from "@/lib/db-errors"

/**
 * Usada pela página de checkout PIX para fazer polling do status do
 * pagamento enquanto aguarda o webhook do Asaas confirmar.
 *
 * Posse do pedido é provada por sessão (pedidos logados) OU pelo
 * `access_token` opaco — comparado com timingSafeEqual para não vazar o token
 * por diferença de tempo de resposta.
 *
 * O caminho do token é LEGADO: o guest checkout foi removido e nenhum fluxo
 * gera `access_token` novo hoje (o checkout exige login). Ele continua aqui
 * porque pedidos antigos de convidado ainda têm o token gravado, e o link
 * que essas pessoas receberam precisa continuar abrindo. Não remover sem
 * antes confirmar que não há mais pedidos com `access_token` não nulo.
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
      "id, status, total_cents, pix_copy_paste, pix_qr_code_base64, access_token, metadata, items, created_at, payment_method, asaas_payment_id, asaas_receipt_url, installment_count, pix_price_cents, card_surcharge_percent, pix_expires_at"
    )
    .eq("id", id)
    // Pedido de sandbox não existe para o cliente — nem por link direto
    // guardado de antes (a tela do PIX ficaria fazendo polling de uma
    // cobrança de teste).
    .eq("is_sandbox", false)
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

  // O polling da tela do PIX consulta esta rota a cada poucos segundos até o
  // pagamento. O QR em base64 tem ~8 KB e NUNCA muda depois de gerado, então
  // repeti-lo em toda resposta era o grosso do tráfego da tela à toa. Com
  // `?slim=1` a tela pede só o que pode mudar — ela já tem o QR da primeira
  // resposta. Sem o parâmetro a resposta segue completa (primeira carga,
  // recarregar a página, qualquer outro consumidor).
  const slim = request.nextUrl.searchParams.get("slim") === "1"

  return NextResponse.json({
    id: order.id,
    status: order.status,
    totalCents: order.total_cents,
    copyPaste: slim ? null : order.pix_copy_paste,
    qrCodeBase64: slim ? null : order.pix_qr_code_base64,
    items: slim ? null : order.items,
    createdAt: order.created_at,
    // Prazo do PIX: a tela de pagamento mostra a contagem regressiva a partir
    // daqui. O cron de expiração usa a mesma coluna, então o que o usuário vê
    // é o mesmo prazo que o servidor vai aplicar.
    pixExpiresAt: order.pix_expires_at,
    paymentMethod: order.payment_method,
    installmentCount: order.installment_count,
    pixPriceCents: order.pix_price_cents,
    cardSurchargePercent: order.card_surcharge_percent,
    // Comprovantes: só existem depois de pago. O Asaas devolve um link de
    // comprovante (transactionReceiptUrl/invoiceUrl) cacheado pelo webhook.
    receipt:
      order.status === "paid"
        ? {
            asaasPaymentId: order.asaas_payment_id,
            asaasReceiptUrl: order.asaas_receipt_url,
          }
        : null,
  })
}
