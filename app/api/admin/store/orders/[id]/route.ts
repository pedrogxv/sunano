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
} from "@/lib/server/repositories/orders-repository"
import { registerManualPayment } from "@/lib/server/repositories/order-manual-payment-repository"
import { approveStripeCardReview } from "@/lib/server/repositories/stripe-orders-repository"

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("advance"),
    // "Aguardando dados de entrega" e "Pedido feito" saem do endereço, não
    // de um clique (ver trg_store_orders_shipping_stage).
    status: z.enum(ADMIN_ADVANCE_STATUSES),
    trackingCode: z.string().trim().max(120).optional(),
    carrier: z.string().trim().max(80).optional(),
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

  if (parsed.data.action === "approve_card_review") {
    const approved = await approveStripeCardReview(id, auth.profile.id)
    if (!approved.ok) {
      return NextResponse.json({ error: approved.error }, { status: approved.status })
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
