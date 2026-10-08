import "server-only"

import { formatBRL } from "@/lib/format"
import { orderStatusDescription, type OrderStatusValue } from "@/lib/order-status"
import { absoluteUrl } from "@/lib/site-url"
import { getResendConfig, ResendApiError, sendEmail } from "@/lib/server/integrations/resend"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * E-mails de pedido para o cliente da Loja. São SÓ DOIS, no máximo um de
 * cada por pedido:
 *
 *   • `confirmed` — "compra confirmada", quando o pedido sai de "aguardando
 *     pagamento" para pago (`paid`/`awaiting_shipping_info`): webhooks da
 *     Asaas (PIX e cartão) e o resgate de periférico com Aura;
 *   • `shipped` — "pedido enviado", com o rastreio, quando o admin marca o
 *     envio.
 *
 * O resto do fluxo fica SÓ na notificação do site, de propósito — o Resend
 * está no plano gratuito (100 e-mails/dia, 3.000/mês):
 *   • `awaiting_shipping_info` → `paid`: quem preencheu o endereço foi o
 *     próprio cliente, a tela já mostra;
 *   • `delivered`: o normal é o cliente confirmar o recebimento;
 *   • `pending`/`expired`/`cancelled`: não houve compra.
 * Antes de acrescentar um e-mail aqui, faça a conta: cada evento novo
 * multiplica o volume por pedido.
 *
 * GARANTIAS (mesmo contrato do Discord de pedidos):
 *   • best-effort absoluto — nunca lança. Um Resend fora do ar não pode
 *     derrubar o 200 de um pagamento já confirmado;
 *   • idempotente — chave `order-confirmation/<id>` no Resend; reentrega de
 *     webhook não vira segundo e-mail;
 *   • silencioso por padrão — sem `RESEND_API_KEY`, é um no-op.
 */

const ORDER_COLUMNS =
  "id, status, total_cents, aura_cost_paid, items, payment_method, customer_name, customer_email, " +
  "is_sandbox, requires_shipping_address, asaas_receipt_url, tracking_code, carrier, metadata"

export type OrderEmailKind = "confirmed" | "shipped"

/**
 * Status em que cada e-mail ainda faz sentido. Relido do banco na hora do
 * envio: um estorno ou cancelamento que chegou no meio não pode gerar
 * "compra confirmada".
 */
const KIND_STATUSES: Record<OrderEmailKind, OrderStatusValue[]> = {
  confirmed: ["paid", "awaiting_shipping_info"],
  shipped: ["shipped"],
}

const PAYMENT_LABEL: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de crédito",
  aura: "Aura",
}

type EmailItem = { name: string; quantity: number; unitPriceCents: number | null; auraCost: number | null }

type OrderEmailData = {
  kind: OrderEmailKind
  orderId: string
  status: OrderStatusValue
  totalCents: number
  auraCostPaid: number | null
  paymentMethod: string | null
  customerName: string | null
  requiresShipping: boolean
  receiptUrl: string | null
  trackingCode: string | null
  carrier: string | null
  items: EmailItem[]
}

function parseItems(raw: unknown): EmailItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>
    const quantity = Number(item.quantity)
    const unitPrice = Number(item.price_cents ?? item.unit_price_cents)
    const auraCost = Number(item.aura_cost)
    return {
      name: typeof item.name === "string" ? item.name : "Item",
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitPriceCents: Number.isFinite(unitPrice) ? unitPrice : null,
      auraCost: Number.isFinite(auraCost) && auraCost > 0 ? auraCost : null,
    }
  })
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatAura(amount: number): string {
  return `${new Intl.NumberFormat("pt-BR").format(amount)} de Aura`
}

function itemPrice(item: EmailItem): string {
  if (item.auraCost != null) return formatAura(item.auraCost * item.quantity)
  if (item.unitPriceCents != null) return formatBRL(item.unitPriceCents * item.quantity)
  return ""
}

function orderTotal(data: OrderEmailData): string {
  if (data.paymentMethod === "aura" && data.auraCostPaid != null) return formatAura(data.auraCostPaid)
  return formatBRL(data.totalCents)
}

/**
 * HTML de e-mail: tabela + estilo inline, porque Gmail/Outlook ignoram
 * `<style>` e flex/grid. Fundo claro de propósito — o modo escuro do
 * cliente de e-mail inverte sozinho, e o inverso (escuro forçado) sai
 * ilegível em vários deles.
 */
function buildEmail(data: OrderEmailData): { subject: string; html: string; text: string } {
  const shortId = data.orderId.slice(0, 8).toUpperCase()
  const firstName = data.customerName?.trim().split(/\s+/)[0] ?? null
  const greeting = firstName ? `Olá, ${firstName}!` : "Olá!"
  const shipped = data.kind === "shipped"
  const title = shipped ? "Pedido enviado 📦" : "Compra confirmada ✅"
  const lead = shipped
    ? (orderStatusDescription(data.status, data.requiresShipping) ?? "Seu pedido está a caminho.")
    : // A frase do status às vezes já abre com "Pagamento confirmado." —
      // repetir depois de "Recebemos o seu pagamento" soa como erro.
      `Recebemos o seu pagamento. ${(orderStatusDescription(data.status, data.requiresShipping) ?? "").replace(/^Pagamento confirmado\.\s*/, "")}`.trim()
  const ordersUrl = absoluteUrl("/conta/pedidos")
  const needsAddress = data.status === "awaiting_shipping_info"
  const ctaLabel = needsAddress ? "Informar endereço de entrega" : "Ver meu pedido"
  const total = orderTotal(data)
  const payment = data.paymentMethod ? (PAYMENT_LABEL[data.paymentMethod] ?? null) : null
  const tracking = shipped && data.trackingCode
    ? `${data.carrier ? `${data.carrier} — ` : ""}${data.trackingCode}`
    : null

  const subject = shipped
    ? `Pedido #${shortId} enviado`
    : `Compra confirmada — pedido #${shortId}`

  const itemRows = data.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eeeeee;font-size:14px;color:#222222;">
            ${escapeHtml(item.name)}${item.quantity > 1 ? ` <span style="color:#777777;">× ${item.quantity}</span>` : ""}
          </td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #eeeeee;font-size:14px;color:#222222;white-space:nowrap;">
            ${escapeHtml(itemPrice(item))}
          </td>
        </tr>`
    )
    .join("")

  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px 28px;">
        <tr><td style="font-size:20px;font-weight:700;color:#111111;padding-bottom:4px;">${title}</td></tr>
        <tr><td style="font-size:13px;color:#777777;padding-bottom:20px;">Pedido #${shortId}</td></tr>
        <tr><td style="font-size:15px;color:#222222;line-height:1.5;padding-bottom:8px;">${escapeHtml(greeting)}</td></tr>
        <tr><td style="font-size:15px;color:#222222;line-height:1.5;padding-bottom:${tracking ? 16 : 24}px;">${escapeHtml(lead)}</td></tr>
        ${tracking ? `<tr><td style="padding-bottom:24px;"><div style="background:#f4f4f5;border-radius:8px;padding:12px 16px;font-size:14px;color:#222222;">Código de rastreio: <strong style="font-family:Menlo,Consolas,monospace;">${escapeHtml(tracking)}</strong></div></td></tr>` : ""}
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${itemRows}
            <tr>
              <td style="padding:14px 0 0;font-size:15px;font-weight:700;color:#111111;">Total</td>
              <td align="right" style="padding:14px 0 0;font-size:15px;font-weight:700;color:#111111;white-space:nowrap;">${escapeHtml(total)}</td>
            </tr>
            ${payment ? `<tr><td colspan="2" style="padding-top:4px;font-size:13px;color:#777777;">Pago com ${escapeHtml(payment)}</td></tr>` : ""}
          </table>
        </td></tr>
        <tr><td align="center" style="padding:28px 0 8px;">
          <a href="${ordersUrl}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">${ctaLabel}</a>
        </td></tr>
        ${data.receiptUrl ? `<tr><td align="center" style="font-size:13px;padding-bottom:8px;"><a href="${escapeHtml(data.receiptUrl)}" style="color:#555555;">Ver comprovante do pagamento</a></td></tr>` : ""}
        <tr><td style="font-size:12px;color:#999999;line-height:1.5;padding-top:20px;border-top:1px solid #eeeeee;">
          Você está recebendo este e-mail porque fez uma compra na Sunano. Dúvidas? Abra um chamado em <a href="${absoluteUrl("/conta/suporte")}" style="color:#777777;">${absoluteUrl("/conta/suporte")}</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    subject,
    "",
    greeting,
    lead,
    ...(tracking ? ["", `Código de rastreio: ${tracking}`] : []),
    "",
    ...data.items.map((item) => {
      const price = itemPrice(item)
      return `- ${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ""}${price ? ` — ${price}` : ""}`
    }),
    "",
    `Total: ${total}${payment ? ` (${payment})` : ""}`,
    "",
    `${ctaLabel}: ${ordersUrl}`,
    ...(data.receiptUrl ? [`Comprovante: ${data.receiptUrl}`] : []),
  ].join("\n")

  return { subject, html, text }
}

/**
 * Envia um e-mail de pedido. Ponto de entrada único — quem chama grava o
 * status no banco ANTES (esta função relê o pedido).
 *
 * NUNCA lança: o retorno existe só para diagnóstico.
 */
export async function sendOrderEmail(
  orderId: string,
  kind: OrderEmailKind
): Promise<{ delivered: boolean; reason?: string }> {
  try {
    const config = getResendConfig()
    if (!config) return { delivered: false, reason: "e-mail desativado" }

    const db = createSupabaseAdminClient()
    const { data, error } = await db.from("store_orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle()
    if (error || !data) {
      if (error) console.error("[order-emails-repository] leitura do pedido:", error)
      return { delivered: false, reason: "pedido não encontrado" }
    }

    const row = data as unknown as Record<string, unknown>
    const status = row.status as OrderStatusValue

    if (!KIND_STATUSES[kind].includes(status)) {
      return { delivered: false, reason: `status ${status}` }
    }

    // Pagamento de sandbox é de mentira — por padrão não manda e-mail de
    // compra para ninguém. `RESEND_INCLUDE_SANDBOX=true` liga para testar.
    if (row.is_sandbox && process.env.RESEND_INCLUDE_SANDBOX !== "true") {
      return { delivered: false, reason: "pedido de sandbox" }
    }

    // O checkout grava `customer_email`; o resgate com Aura não (não há
    // pagador), então cai no e-mail da conta dona do pedido.
    let to = (row.customer_email as string | null)?.trim() || null
    if (!to) {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>
      const userId = typeof metadata.user_id === "string" ? metadata.user_id : null
      if (userId) {
        const { data: authUser } = await db.auth.admin.getUserById(userId)
        to = authUser?.user?.email ?? null
      }
    }
    if (!to) return { delivered: false, reason: "pedido sem e-mail" }

    const email = buildEmail({
      kind,
      orderId: row.id as string,
      status,
      totalCents: Number(row.total_cents ?? 0),
      auraCostPaid: row.aura_cost_paid == null ? null : Number(row.aura_cost_paid),
      paymentMethod: (row.payment_method as string | null) ?? null,
      customerName: (row.customer_name as string | null) ?? null,
      requiresShipping: row.requires_shipping_address !== false,
      receiptUrl: (row.asaas_receipt_url as string | null) ?? null,
      trackingCode: (row.tracking_code as string | null) ?? null,
      carrier: (row.carrier as string | null) ?? null,
      items: parseItems(row.items),
    })

    await sendEmail({ config, to, ...email, idempotencyKey: `order-${kind}/${orderId}` })
    return { delivered: true }
  } catch (err) {
    // 403 é domínio do remetente não verificado — configuração, não queda.
    // Sem este aviso vira um stack trace idêntico em cada venda.
    if (err instanceof ResendApiError && err.status === 403) {
      console.error(
        `[order-emails-repository] Resend recusou (HTTP 403) — confira se o domínio de RESEND_FROM ` +
          `está verificado no Resend. E-mail do pedido ${orderId} ignorado; a Loja segue normal.`
      )
      return { delivered: false, reason: "remetente não verificado" }
    }
    // 429 é a cota do plano (gratuito: 100/dia, 3.000/mês) ou o limite de
    // requisições por segundo. O e-mail se perde — o pedido não.
    if (err instanceof ResendApiError && err.status === 429) {
      console.error(
        `[order-emails-repository] Resend recusou (HTTP 429) — cota do plano ou rate limit estourado. ` +
          `E-mail "${kind}" do pedido ${orderId} não enviado; a notificação do site segue valendo.`
      )
      return { delivered: false, reason: "cota do Resend" }
    }
    console.error(`[order-emails-repository] sendOrderEmail(${kind}):`, err)
    return { delivered: false, reason: "erro no envio" }
  }
}
