import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { deleteBanner, updateBanner } from "@/lib/server/repositories/store-banners-repository"

import { updateStoreBannerSchema } from "../schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Edita qualquer subconjunto dos campos de um banner de seção. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para editar banners." }, { status: 403 })
  }

  const { id } = await context.params
  const payload = await request.json().catch(() => null)
  const parsed = updateStoreBannerSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    const banner = await updateBanner(id, parsed.data)
    return NextResponse.json({ ok: true, banner })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao atualizar banner.")
    return NextResponse.json(body, { status })
  }
}

/** Remove um banner de seção e limpa a mídia que ficou sem dono. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para remover banners." }, { status: 403 })
  }

  const { id } = await context.params

  try {
    await deleteBanner(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao remover banner.")
    return NextResponse.json(body, { status })
  }
}
