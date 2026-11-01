import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { deployChargesInSandbox } from "@/lib/server/payments/gateway"
import { getResendConfig, ResendApiError, sendEmail } from "@/lib/server/integrations/resend"
import { escapeHtml } from "@/lib/server/repositories/order-emails-repository"
import { notifyOrderCustomerNotice } from "@/lib/server/repositories/notifications-repository"
import { notifyDiscordOrderEvent } from "@/lib/server/repositories/discord-orders-repository"
import { logAdminAction } from "@/lib/server/repositories/store-admin-audit-repository"
import { orderOwnerId, type OrderStatus } from "@/lib/server/repositories/orders-repository"
import { orderNumber } from "@/lib/order-number"
import { absoluteUrl } from "@/lib/site-url"
import {
  ORDER_NOTICE_COLUMNS,
  ORDER_NOTICE_MESSAGE_MAX,
  ORDER_NOTICE_REASON,
  canFixShippingOnSite,
  readAdminOrderNotice,
  type AdminOrderCustomerNotice,
  type OrderNoticeReason,
  type RawOrderNoticeColumns,
} from "@/lib/order-customer-notice"

/**
 * Aviso da loja ao cliente sobre um pedido (ver lib/order-customer-notice.ts).
 * O admin manda pela fila de pedidos quando o cliente errou um dado (CPF de
 * quem recebe, endereço) ou precisa saber de algo. Um envio faz quatro coisas:
 *
 *   • grava o aviso no pedido: o card em "Meus Pedidos" mostra o problema e
 *     o botão de corrigir, e o badge da TopBar acende;
 *   • notifica no sino do site;
 *   • manda e-mail: quem errou o CPF não está olhando o site, e o pedido
 *     fica parado até ele voltar. É envio manual e raro, então cabe na cota
 *     do Resend (ver o cabeçalho de order-emails-repository.ts);
 *   • registra no card do Discord e no log de auditoria.
 *
 * O aviso de ENTREGA fecha sozinho quando o cliente salva os dados de novo
 * (`setOrderShippingAddress`); o de outro assunto, o admin fecha.
 */

type NoticeOrderRow = {
  id: string
  status: OrderStatus
  metadata: Record<string, unknown> | null
  requires_shipping_address: boolean | null
  customer_email: string | null
  customer_name: string | null
  is_sandbox: boolean
} & RawOrderNoticeColumns

export type SendOrderNoticeResult =
  | {
      ok: true
      notice: AdminOrderCustomerNotice
      emailed: boolean
      /** Por que o e-mail não saiu (o aviso no site vale do mesmo jeito). */
      emailReason: string | null
    }
  | { ok: false; error: string; status: number }

export async function sendOrderCustomerNotice(
  orderId: string,
  input: { reason: OrderNoticeReason; message: string | null },
  adminId: string
): Promise<SendOrderNoticeResult> {
  const db = createSupabaseAdminClient()
  const meta = ORDER_NOTICE_REASON[input.reason]
  const message = input.message?.trim().slice(0, ORDER_NOTICE_MESSAGE_MAX) || null

  if (!meta.fixesShipping && !message) {
    return { ok: false, error: "Escreva a mensagem para o cliente.", status: 400 }
  }

  const { data, error: readError } = await db
    .from("store_orders")
    .select(
      `id, status, metadata, requires_shipping_address, customer_email, customer_name, is_sandbox, ${ORDER_NOTICE_COLUMNS}`
    )
    .eq("id", orderId)
    .maybeSingle()
  if (readError) {
    console.error("[order-customer-notice-repository] leitura do pedido:", readError)
    return { ok: false, error: "Não foi possível avisar o cliente.", status: 500 }
  }
  if (!data) {
    return { ok: false, error: "Pedido não encontrado.", status: 404 }
  }
  const order = data as unknown as NoticeOrderRow
  const requiresShipping = order.requires_shipping_address !== false

  // Motivo de entrega só onde o botão "Corrigir" funciona: depois de enviado
  // o servidor recusa a alteração, e o cliente receberia um pedido de
  // correção que não tem como atender.
  if (meta.fixesShipping && !canFixShippingOnSite(order.status, requiresShipping)) {
    return {
      ok: false,
      error: !requiresShipping
        ? "Este pedido não tem entrega. Use \"Outro assunto\"."
        : order.status === "shipped" || order.status === "delivered"
          ? "O pedido já foi despachado: o cliente não consegue mais corrigir a entrega pelo site. Use \"Outro assunto\" ou o chat."
          : "Neste status o cliente não corrige a entrega pelo site. Use \"Outro assunto\".",
      status: 400,
    }
  }

  const ownerId = orderOwnerId(order.metadata)
  if (!ownerId && !order.customer_email?.trim()) {
    return { ok: false, error: "Pedido sem conta nem e-mail: não há como avisar o cliente.", status: 422 }
  }

  const sentAt = new Date().toISOString()
  const { data: updated, error: updateError } = await db
    .from("store_orders")
    .update({
      customer_notice_reason: input.reason,
      customer_notice_message: message,
      customer_notice_sent_at: sentAt,
      customer_notice_resolved_at: null,
      customer_notice_resolved_by: null,
    })
    .eq("id", orderId)
    // O status lido acima: se o pedido saiu para entrega no meio, o motivo de
    // entrega que acabou de ser validado já não vale.
    .eq("status", order.status)
    .select("id")
    .maybeSingle()
  if (updateError) {
    console.error("[order-customer-notice-repository] gravação do aviso:", updateError)
    return { ok: false, error: "Não foi possível avisar o cliente.", status: 500 }
  }
  if (!updated) {
    return { ok: false, error: "O pedido mudou de status enquanto você editava. Recarregue a página.", status: 409 }
  }

  if (ownerId) {
    await notifyOrderCustomerNotice({
      userId: ownerId,
      orderId,
      fixesShipping: meta.fixesShipping,
      problem: meta.problem,
    })
  }

  const email = await sendNoticeEmail(order, ownerId, { reason: input.reason, message })

  await notifyDiscordOrderEvent({
    orderId,
    status: order.status,
    actor: "admin",
    eventKey: `notice:${sentAt}`,
    note: `Cliente avisado: ${meta.label}.${message ? ` "${message.slice(0, 200)}"` : ""}`,
  })

  await logAdminAction({
    adminId,
    action: "order.customer_notice",
    entityType: "store_order",
    entityId: orderId,
    before: { notice: readAdminOrderNotice(order) },
    after: { reason: input.reason, message, sentAt, emailed: email.delivered },
  })

  return {
    ok: true,
    notice: { reason: input.reason, message, sent_at: sentAt, resolved_at: null, resolved_by: null },
    emailed: email.delivered,
    emailReason: email.delivered ? null : (email.reason ?? null),
  }
}

/**
 * O admin fecha o aviso: resolveu por outro caminho (chat, e-mail) ou foi
 * mandado por engano. Some do card do cliente e do badge da TopBar.
 */
export async function resolveOrderCustomerNotice(
  orderId: string,
  adminId: string
): Promise<{ ok: true; resolvedAt: string } | { ok: false; error: string; status: number }> {
  const db = createSupabaseAdminClient()
  const resolvedAt = new Date().toISOString()

  const { data, error } = await db
    .from("store_orders")
    .update({ customer_notice_resolved_at: resolvedAt, customer_notice_resolved_by: "admin" })
    .eq("id", orderId)
    .not("customer_notice_sent_at", "is", null)
    .is("customer_notice_resolved_at", null)
    .select("id, customer_notice_reason")
    .maybeSingle()
  if (error) {
    console.error("[order-customer-notice-repository] resolveOrderCustomerNotice:", error)
    return { ok: false, error: "Não foi possível atualizar o aviso.", status: 500 }
  }
  if (!data) {
    return { ok: false, error: "Este pedido não tem aviso aberto. Recarregue a página.", status: 409 }
  }

  await logAdminAction({
    adminId,
    action: "order.customer_notice_resolve",
    entityType: "store_order",
    entityId: orderId,
    after: { reason: data.customer_notice_reason, resolvedAt },
  })

  return { ok: true, resolvedAt }
}

/**
 * Pedidos do usuário com aviso aberto, para o badge de "Meus Pedidos" na
 * TopBar (`resolveAuthUser`). Roda em toda resolução de sessão: casa com o
 * índice parcial `store_orders_open_customer_notice_idx`.
 */
export async function countOpenOrderNoticesByUser(userId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("metadata->>user_id", userId)
    .not("customer_notice_sent_at", "is", null)
    .is("customer_notice_resolved_at", null)
    .eq("is_sandbox", deployChargesInSandbox())

  if (error) {
    console.error("[order-customer-notice-repository] countOpenOrderNoticesByUser:", error)
    return 0
  }
  return count ?? 0
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------

/**
 * Mesmo layout dos e-mails de pedido (order-emails-repository.ts): tabela +
 * estilo inline, fundo claro. A mensagem da equipe é texto livre e entra
 * escapada, com as quebras de linha preservadas.
 */
function buildNoticeEmail(params: {
  orderId: string
  customerName: string | null
  reason: OrderNoticeReason
  message: string | null
}): { subject: string; html: string; text: string } {
  const meta = ORDER_NOTICE_REASON[params.reason]
  const shortId = orderNumber(params.orderId)
  const firstName = params.customerName?.trim().split(/\s+/)[0] ?? null
  const greeting = firstName ? `Olá, ${firstName}!` : "Olá!"
  const title = meta.fixesShipping ? "Precisamos de uma correção" : "Aviso sobre o seu pedido"
  const subject = meta.fixesShipping
    ? `Pedido #${shortId}: corrija os dados de entrega`
    : `Aviso sobre o pedido #${shortId}`
  const lead = meta.fixesShipping
    ? `Encontramos um problema nos dados de entrega do seu pedido. ${meta.problem} O pedido fica parado até a correção.`
    : meta.problem
  const howTo = meta.fixesShipping
    ? "Abra Meus Pedidos e toque em \"Corrigir dados de entrega\" no card do pedido."
    : "Se tiver dúvidas, responda pelo chat do pedido em Meus Pedidos."
  const ordersUrl = absoluteUrl("/conta/pedidos")
  const ctaLabel = meta.fixesShipping ? "Corrigir dados de entrega" : "Ver meu pedido"
  const messageHtml = params.message ? escapeHtml(params.message).replace(/\r?\n/g, "<br>") : null

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
        <tr><td style="font-size:15px;color:#222222;line-height:1.5;padding-bottom:16px;">${escapeHtml(lead)}</td></tr>
        ${messageHtml ? `<tr><td style="padding-bottom:16px;"><div style="background:#fff7ed;border-left:3px solid #f59e0b;border-radius:8px;padding:12px 16px;font-size:14px;color:#222222;line-height:1.5;"><strong>Mensagem da equipe:</strong><br>${messageHtml}</div></td></tr>` : ""}
        <tr><td style="font-size:14px;color:#555555;line-height:1.5;">${escapeHtml(howTo)}</td></tr>
        <tr><td align="center" style="padding:28px 0 8px;">
          <a href="${ordersUrl}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">${ctaLabel}</a>
        </td></tr>
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
    ...(params.message ? ["", "Mensagem da equipe:", params.message] : []),
    "",
    howTo,
    `${ctaLabel}: ${ordersUrl}`,
  ].join("\n")

  return { subject, html, text }
}

/** Best-effort, nunca lança: o aviso no site já foi gravado. */
async function sendNoticeEmail(
  order: NoticeOrderRow,
  ownerId: string | null,
  notice: { reason: OrderNoticeReason; message: string | null }
): Promise<{ delivered: boolean; reason?: string }> {
  try {
    const config = getResendConfig()
    if (!config) return { delivered: false, reason: "e-mail desativado neste ambiente" }

    // Mesma regra dos e-mails de pedido: sandbox não manda e-mail para
    // ninguém, a não ser com `RESEND_INCLUDE_SANDBOX=true`.
    if (order.is_sandbox && process.env.RESEND_INCLUDE_SANDBOX !== "true") {
      return { delivered: false, reason: "pedido de sandbox" }
    }

    let to = order.customer_email?.trim() || null
    if (!to && ownerId) {
      const { data: authUser } = await createSupabaseAdminClient().auth.admin.getUserById(ownerId)
      to = authUser?.user?.email ?? null
    }
    if (!to) return { delivered: false, reason: "pedido sem e-mail" }

    const email = buildNoticeEmail({
      orderId: order.id,
      customerName: order.customer_name,
      reason: notice.reason,
      message: notice.message,
    })
    await sendEmail({ config, to, ...email })
    return { delivered: true }
  } catch (err) {
    if (err instanceof ResendApiError && err.status === 403) {
      console.error(
        `[order-customer-notice-repository] Resend recusou (HTTP 403): confira o domínio de RESEND_FROM. Aviso do pedido ${order.id} só no site.`
      )
      return { delivered: false, reason: "remetente não verificado no Resend" }
    }
    if (err instanceof ResendApiError && err.status === 429) {
      console.error(
        `[order-customer-notice-repository] Resend recusou (HTTP 429): cota do plano. Aviso do pedido ${order.id} só no site.`
      )
      return { delivered: false, reason: "cota diária do Resend" }
    }
    console.error("[order-customer-notice-repository] sendNoticeEmail:", err)
    return { delivered: false, reason: "erro no envio" }
  }
}
