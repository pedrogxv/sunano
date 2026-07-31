import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { reorderForumCategories } from "@/lib/server/repositories/forum-categories-repository"

export const dynamic = "force-dynamic"

const reorderSchema = z.object({
  ids: z.array(z.uuid("Identificador de categoria inválido.")).min(1, "Envie ao menos uma categoria."),
})

/** Recebe os ids de um mesmo grupo de irmãs na ordem desejada e regrava `sort_order`. */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "forum_write")) {
    return NextResponse.json({ error: "Sem permissão para reordenar categorias." }, { status: 403 })
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
    await reorderForumCategories(parsed.data.ids)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao reordenar categorias.")
    return NextResponse.json(body, { status })
  }
}
