import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { reorderEvents } from "@/lib/server/repositories/events-repository"

export const dynamic = "force-dynamic"

const reorderSchema = z.object({
  ids: z.array(z.uuid("Identificador de conquista inválido.")).min(1, "Envie ao menos uma conquista."),
})

/** Recebe os ids de todas as conquistas na ordem desejada e regrava `sort_order`. */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_write")) {
    return NextResponse.json({ error: "Sem permissão para reordenar conquistas." }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = reorderSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    await reorderEvents(parsed.data.ids)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao reordenar conquistas.")
    return NextResponse.json(body, { status })
  }
}
