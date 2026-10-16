import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import {
  ADMIN_ADVANCE_STATUSES,
  MANUAL_PAYMENT_METHODS,
  advanceOrderStatus,
  cancelOrder,
  refundOrder,
  updateOrderTracking,
} from "@/lib/server/repositories/orders-repository"
import { registerManualPayment } from "@/lib/server/repositories/order-manual-payment-repository"
import { approveStripeCardReview } from "@/lib/server/repositories/stripe-orders-repository"
import { setOrderComplementDue } from "@/lib/server/repositories/order-complement-repository"
import { COMPLEMENT_MAX_CENTS, COMPLEMENT_NOTE_MAX } from "@/lib/store-payment-complement"
import { STORE_CARRIERS } from "@/lib/store-carriers"

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("advance"),
    // "Aguardando dados de entrega" e "Pedido feito" saem do endereço, não
    // de um clique (ver trg_store_orders_shipping_stage).
    status: z.enum(ADMIN_ADVANCE_STATUSES),
    trackingCode: z.string().trim().max(120).optional(),
    carrier: z.enum(STORE_CARRIERS).optional(),
  }),
  // O código muda em alguns casos quando a encomenda chega ao Brasil.
  z.object({
    action: z.literal("update_tracking"),
    trackingCode: z.string().trim().min(1, "Informe o código de rastreio.").max(120),
    carrier: z.enum(STORE_CARRIERS).optional(),
  }),
  z.object({
    action: z.literal("refund"),
    valueCents: z.number().int().positive().optional(),
    reason: z.string().trim().max(300).optional(),
  }),
  z.object({
    action: z.literal("cancel"),
    reason: z.string().trim().max(300).optional(),
  }),
  // Cartão do Stripe autorizado e segurado para revisão: aprovar = capturar.
  // Recusar é o `cancel` de sempre (solta a autorização).
  z.object({ action: z.literal("approve_card_review") }),
  // Pago por fora do site (link avulso da Asaas, PIX direto).
  z.object({
    action: z.literal("manual_payment"),
    method: z.enum(MANUAL_PAYMENT_METHODS),
    amountCents: z.number().int().positive().max(100_000_000),
    reference: z.string().trim().max(120).optional(),
  }),
  // Complemento de Pagamento: o TOTAL cobrado além do que o pedido pagou
  // (orçamento do Xianyu/Expert Buy, diferença de outro pedido). Null limpa.
  z.object({
    action: z.literal("set_complement"),
    dueCents: z.number().int().positive().max(COMPLEMENT_MAX_CENTS).nullable(),
    note: z.string().trim().max(COMPLEMENT_NOTE_MAX).nullish(),
  }),
])

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  if (parsed.data.action === "manual_payment") {
    const manual = await registerManualPayment(
      id,
      { method: parsed.data.method, amountCents: parsed.data.amountCents, reference: parsed.data.reference },
      auth.profile.id
    )
    if (!manual.ok) {
      return NextResponse.json({ error: manual.error }, { status: manual.status })
    }
    return NextResponse.json({
      ok: true,
      status: manual.status,
      totalCents: manual.totalCents,
      manualPayment: manual.manualPayment,
    })
  }

  if (parsed.data.action === "set_complement") {
    const complement = await setOrderComplementDue(
      id,
      { dueCents: parsed.data.dueCents, note: parsed.data.note ?? null },
      auth.profile.id
    )
    if (!complement.ok) {
      return NextResponse.json({ error: complement.error }, { status: complement.status })
    }
    return NextResponse.json({ ok: true, complement: complement.summary })
  }

  if (parsed.data.action === "approve_card_review") {
    const approved = await approveStripeCardReview(id, auth.profile.id)
    if (!approved.ok) {
      return NextResponse.json({ error: approved.error }, { status: approved.status })
    }
    return NextResponse.json({ ok: true })
  }

  if (parsed.data.action === "update_tracking") {
    const tracking = await updateOrderTracking(
      id,
      { trackingCode: parsed.data.trackingCode, carrier: parsed.data.carrier },
      auth.profile.id
    )
    if (!tracking.ok) {
      return NextResponse.json({ error: tracking.error }, { status: tracking.status })
    }
    return NextResponse.json({ ok: true })
  }

  const result =
    parsed.data.action === "advance"
      ? await advanceOrderStatus(
          id,
          parsed.data.status,
          { trackingCode: parsed.data.trackingCode, carrier: parsed.data.carrier },
          auth.profile.id
        )
      : parsed.data.action === "refund"
        ? await refundOrder(id, { valueCents: parsed.data.valueCents, reason: parsed.data.reason }, auth.profile.id)
        : await cancelOrder(id, { reason: parsed.data.reason }, auth.profile.id)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
