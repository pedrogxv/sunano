import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { reorderBanners } from "@/lib/server/repositories/store-banners-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const reorderSchema = z.object({
  section: z.enum(["main", "best_sellers", "pre_sale", "ready_stock", "site_items"]),
  ids: z.array(z.uuid("Identificador de banner inválido.")).min(1, "Envie ao menos um banner."),
})

/** Recebe os ids na ordem desejada e regrava `sort_order` dentro de uma seção. */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para reordenar banners." }, { status: 403 })
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
    await reorderBanners(parsed.data.section, parsed.data.ids)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao reordenar banners.")
    return NextResponse.json(body, { status })
  }
}
