import "server-only"

import { absoluteUrl } from "@/lib/site-url"
import { getResendConfig, ResendApiError, sendEmail } from "@/lib/server/integrations/resend"
import { escapeHtml } from "@/lib/server/repositories/order-emails-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * E-mail do "Avise-me quando voltar" (ver 20261223000001_store_restock_alert_email.sql).
 *
 * O banco decide QUANDO avisar: `notify_restock` manda a notificação do site e
 * grava `notified_at`. Aqui só se manda o e-mail das inscrições já avisadas e
 * ainda sem `emailed_at`, rodado pelo cron `/api/cron/restock-emails`.
 *
 * COTA: o Resend está no plano gratuito (100/dia), dividido com os e-mails de
 * pedido. Um produto popular voltando teria dezenas de inscritos e comeria a
 * cota do "compra confirmada" do dia. Por isso há um teto diário próprio; o
 * que passar dele fica para o dia seguinte, e o que envelhecer além de
 * `MAX_AGE_HOURS` é descartado (o produto pode já ter esgotado de novo, e a
 * notificação do site já foi entregue de qualquer jeito).
 *
 * GARANTIAS (mesmo contrato de `sendOrderEmail`): nunca lança; marca
 * `emailed_at` ANTES de enviar (no máximo um e-mail por inscrição, mesmo com
 * dois crons sobrepostos); chave de idempotência por inscrição no Resend;
 * sem `RESEND_API_KEY`, no-op.
 */

const DAILY_CAP = 40
const BATCH_SIZE = 20
const MAX_AGE_HOURS = 72

type ClaimedAlert = { id: string; user_id: string; product_id: string; variant_id: string | null }

type ProductRow = {
  id: string
  name: string
  slug: string
  images: string[] | null
  stock: number | null
  is_active: boolean
  is_sold_out: boolean
}

type VariantRow = { id: string; label: string; stock: number | null; is_active: boolean; is_sold_out: boolean }

function isOut(row: { stock: number | null; is_active: boolean; is_sold_out: boolean }): boolean {
  return !row.is_active || row.is_sold_out || (row.stock != null && row.stock <= 0)
}

function buildEmail(product: ProductRow, variantLabel: string | null): { subject: string; html: string; text: string } {
  const productUrl = absoluteUrl(`/loja/${product.slug}`)
  const name = variantLabel ? `${product.name} (${variantLabel})` : product.name
  const subject = `Voltou ao estoque: ${name}`
  const lead = `O produto que você pediu para acompanhar está disponível de novo na Loja Sunano. O estoque costuma acabar rápido, então garanta o seu.`
  const image = product.images?.find((url) => /^https:\/\//.test(url)) ?? null

  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px 28px;">
        <tr><td style="font-size:20px;font-weight:700;color:#111111;padding-bottom:16px;">Voltou ao estoque 🔔</td></tr>
        ${image ? `<tr><td align="center" style="padding-bottom:20px;"><img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" width="240" style="display:block;max-width:240px;width:100%;height:auto;border-radius:8px;"></td></tr>` : ""}
        <tr><td style="font-size:17px;font-weight:700;color:#111111;padding-bottom:8px;">${escapeHtml(name)}</td></tr>
        <tr><td style="font-size:15px;color:#222222;line-height:1.5;padding-bottom:24px;">${escapeHtml(lead)}</td></tr>
        <tr><td align="center" style="padding-bottom:8px;">
          <a href="${productUrl}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">Ver produto</a>
        </td></tr>
        <tr><td style="font-size:12px;color:#999999;line-height:1.5;padding-top:20px;border-top:1px solid #eeeeee;">
          Você está recebendo este e-mail porque ativou "Avise-me quando voltar" neste produto. O aviso vale uma vez só: para ser avisado de novo, ative outra vez na página do produto.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = [subject, "", lead, "", `Ver produto: ${productUrl}`].join("\n")
  return { subject, html, text }
}

/** Envia os e-mails pendentes. NUNCA lança: o retorno é só para o log do cron. */
export async function sendPendingRestockEmails(): Promise<{ sent: number; skipped: number; reason?: string }> {
  try {
    const config = getResendConfig()
    if (!config) return { sent: 0, skipped: 0, reason: "e-mail desativado" }

    const db = createSupabaseAdminClient()
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    const oldestIso = new Date(now - MAX_AGE_HOURS * 3_600_000).toISOString()
    const dayAgoIso = new Date(now - 24 * 3_600_000).toISOString()

    // Velhos demais: fecha sem e-mail, senão o índice de pendentes só cresce.
    await db
      .from("store_restock_alerts")
      .update({ emailed_at: nowIso })
      .not("notified_at", "is", null)
      .is("emailed_at", null)
      .lt("notified_at", oldestIso)

    const { count: usedToday } = await db
      .from("store_restock_alerts")
      .select("id", { count: "exact", head: true })
      .gte("emailed_at", dayAgoIso)
      .gte("notified_at", oldestIso)
    const budget = Math.min(BATCH_SIZE, DAILY_CAP - (usedToday ?? 0))
    if (budget <= 0) return { sent: 0, skipped: 0, reason: "teto diário" }

    const { data: pending, error: pendingError } = await db
      .from("store_restock_alerts")
      .select("id")
      .not("notified_at", "is", null)
      .is("emailed_at", null)
      .order("notified_at", { ascending: true })
      .limit(budget)
    if (pendingError) throw pendingError
    if (!pending?.length) return { sent: 0, skipped: 0 }

    // Reserva antes de enviar: só sai e-mail das linhas que ESTE run marcou.
    const { data: claimed, error: claimError } = await db
      .from("store_restock_alerts")
      .update({ emailed_at: nowIso })
      .in("id", pending.map((row) => row.id))
      .is("emailed_at", null)
      .select("id, user_id, product_id, variant_id")
    if (claimError) throw claimError
    const alerts = (claimed ?? []) as ClaimedAlert[]
    if (!alerts.length) return { sent: 0, skipped: 0 }

    const productIds = [...new Set(alerts.map((a) => a.product_id))]
    const variantIds = [...new Set(alerts.map((a) => a.variant_id).filter((id): id is string => id !== null))]

    const [{ data: products }, { data: variants }] = await Promise.all([
      db.from("store_products").select("id, name, slug, images, stock, is_active, is_sold_out").in("id", productIds),
      variantIds.length
        ? db.from("store_product_variants").select("id, label, stock, is_active, is_sold_out").in("id", variantIds)
        : Promise.resolve({ data: [] as VariantRow[] }),
    ])
    const productById = new Map(((products ?? []) as ProductRow[]).map((p) => [p.id, p]))
    const variantById = new Map(((variants ?? []) as VariantRow[]).map((v) => [v.id, v]))

    let sent = 0
    let skipped = 0
    for (const alert of alerts) {
      const product = productById.get(alert.product_id)
      const variant = alert.variant_id ? variantById.get(alert.variant_id) : null
      // Esgotou de novo entre o aviso e o e-mail: o e-mail mandaria a pessoa
      // para um "esgotado". A notificação do site já foi.
      if (!product || isOut(product) || (alert.variant_id && (!variant || isOut(variant)))) {
        skipped++
        continue
      }

      const { data: authUser } = await db.auth.admin.getUserById(alert.user_id)
      const to = authUser?.user?.email ?? null
      if (!to) {
        skipped++
        continue
      }

      try {
        await sendEmail({
          config,
          to,
          ...buildEmail(product, variant?.label ?? null),
          idempotencyKey: `restock/${alert.id}`,
        })
        sent++
      } catch (err) {
        skipped++
        // Cota estourada: o resto do lote também cairia. Para aqui.
        if (err instanceof ResendApiError && (err.status === 429 || err.status === 403)) {
          console.error(`[restock-emails-repository] Resend recusou (HTTP ${err.status}); lote interrompido.`)
          break
        }
        console.error(`[restock-emails-repository] e-mail da inscrição ${alert.id}:`, err)
      }
    }

    return { sent, skipped }
  } catch (err) {
    console.error("[restock-emails-repository] sendPendingRestockEmails:", err)
    return { sent: 0, skipped: 0, reason: "erro" }
  }
}
