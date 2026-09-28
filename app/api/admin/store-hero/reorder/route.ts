import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { reorderHeroSlides } from "@/lib/server/repositories/store-hero-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const reorderSchema = z.object({
  ids: z.array(z.uuid("Identificador de slide inválido.")).min(1, "Envie ao menos um slide.").max(50),
})

/** Recebe os ids na ordem desejada e regrava `sort_order` dos slides do Hero. */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para editar o Hero da Loja." }, { status: 403 })
  }

  const parsed = reorderSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    await reorderHeroSlides(parsed.data.ids)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao reordenar os slides.")
    return NextResponse.json(body, { status })
  }
}
