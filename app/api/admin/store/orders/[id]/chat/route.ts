import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { openOrderTicketByAdmin } from "@/lib/server/repositories/support-repository"

const bodySchema = z.object({
  body: z.string().trim().min(1, "Escreva a mensagem.").max(4000),
})

/**
 * A equipe abre a conversa do pedido com o cliente. Exige `support_write`
 * (é um chamado de suporte, respondido em /admin/suporte) e `store_read`
 * (o botão mora na fila de pedidos).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  const auth = await getAuthorizedProfile()
  if (
    !auth.profile ||
    !hasAdminPermission(auth.profile, "store_read") ||
    !hasAdminPermission(auth.profile, "support_write")
  ) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const result = await openOrderTicketByAdmin({
    orderId: id,
    adminId: auth.profile.id,
    adminName: auth.profile.display_name?.trim() || "Suporte Sunano",
    body: parsed.data.body,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, ticketId: result.ticketId, existing: result.existing === true })
}
