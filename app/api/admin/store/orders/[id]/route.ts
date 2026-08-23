import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { advanceOrderStatus, cancelOrder, refundOrder } from "@/lib/server/repositories/orders-repository"

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("advance"),
    status: z.enum(["awaiting_shipping_info", "shipped", "delivered"]),
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
