import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { setSupportTicketStatus } from "@/lib/server/repositories/support-repository"

const statusSchema = z.object({
  status: z.enum(["open", "resolved", "cancelled"], { message: "Status inválido." }),
})

/** Muda o status do chamado direto pela tabela de `/admin/suporte`. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "support_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = statusSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const { id } = await params
  const result = await setSupportTicketStatus({ ticketId: id, status: parsed.data.status, adminId: auth.profile.id })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
