import { NextRequest, NextResponse } from "next/server"
import {
  isMercadoPagoOrderId,
  MercadoPagoConfigError,
  verifyMercadoPagoWebhookSignature,
} from "@/lib/server/integrations/mercadopago"
import { syncMercadoPagoOrder } from "@/lib/server/repositories/mercadopago-orders-repository"

export const runtime = "nodejs"

/**
 * Webhook do Mercado Pago — cartão da Loja (`STORE_CARD_GATEWAY=mercadopago`).
 *
 * Rede de segurança da resposta síncrona: a rota do cartão já aplica o
 * resultado da order na hora. Aqui chegam o que ela não vê — a decisão de uma
 * order que ficou em análise, contestação, estorno feito no painel — e a
 * aprovação se a rota caiu no meio.
 *
 * Cadastro no painel (Suas integrações → Webhooks): URL
 * `https://<site>/api/webhooks/mercadopago`, evento "Order (Mercado Pago)".
 * Na Orders API a URL não vai na requisição: sem o cadastro, nada chega. A
 * "assinatura secreta" gerada lá vai em `MERCADOPAGO_WEBHOOK_SECRET`.
 *
 * O corpo NÃO é fonte de verdade: só o id da order (`ORD…`) é usado, e a
 * order é relida na API (`syncMercadoPagoOrder`). A assinatura impede que
 * alguém force essas releituras em volume.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  // O Mercado Pago manda `type`/`data.id` na query (formato webhook) e no
  // corpo. A assinatura é sobre o `data.id` da QUERY.
  const queryDataId = url.searchParams.get("data.id") ?? url.searchParams.get("id")
  const body = (await request.json().catch(() => null)) as {
    type?: string
    topic?: string
    action?: string
    data?: { id?: string | number }
  } | null

  let valid: boolean
  try {
    valid = verifyMercadoPagoWebhookSignature({
      signatureHeader: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId: queryDataId,
    })
  } catch (err) {
    // Config nossa errada é 500: o Mercado Pago reentrega quando consertarmos.
    if (err instanceof MercadoPagoConfigError) {
      console.error("[webhooks/mercadopago]", err.message)
      return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 })
    }
    throw err
  }
  if (!valid) return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 })

  const type = body?.type ?? body?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic")
  if (type !== "order") return NextResponse.json({ received: true, ignored: type ?? "sem tipo" })

  // O id assinado é o da query; o do corpo só serve se for o MESMO.
  const bodyDataId = body?.data?.id != null ? String(body.data.id) : null
  if (!queryDataId || (bodyDataId && bodyDataId !== queryDataId) || !isMercadoPagoOrderId(queryDataId)) {
    return NextResponse.json({ received: true, ignored: "id inválido" })
  }

  try {
    await syncMercadoPagoOrder(queryDataId)
    return NextResponse.json({ received: true })
  } catch (err) {
    // 500 faz o Mercado Pago reentregar: falha de rede/banco é passageira.
    console.error(`[webhooks/mercadopago] order ${queryDataId}:`, err)
    return NextResponse.json({ error: "Falha ao processar" }, { status: 500 })
  }
}
