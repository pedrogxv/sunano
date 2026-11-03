import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { isUuid } from "@/lib/server/repositories/_shared"
import { closeSupportTicket } from "@/lib/server/repositories/support-repository"

/** Encerra o chamado como resolvido direto da listagem — mesmo efeito do "Marcar como resolvido" da página do chamado. */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "support_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 })
  }

  const result = await closeSupportTicket({ ticketId: id, status: "resolved", adminId: auth.profile.id })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  revalidatePath(`/admin/suporte/${id}`)
  revalidatePath("/admin/suporte")
  return NextResponse.json({ ok: true })
}
