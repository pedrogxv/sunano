import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { markPayoutPaid, rejectPayoutRequest } from "@/lib/server/repositories/affiliates-repository"

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark_paid") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().max(300).optional() }),
])

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "affiliates_write")) {
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
    parsed.data.action === "mark_paid"
      ? await markPayoutPaid(id, auth.profile.id)
      : await rejectPayoutRequest(id, auth.profile.id, parsed.data.reason)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
