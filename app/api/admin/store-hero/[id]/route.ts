import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { deleteHeroSlide, updateHeroSlide } from "@/lib/server/repositories/store-hero-repository"

import { updateStoreHeroSchema } from "../schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Edita qualquer subconjunto dos campos de um slide do Hero. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para editar o Hero da Loja." }, { status: 403 })
  }

  const { id } = await context.params
  const parsed = updateStoreHeroSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const result = await updateHeroSlide(id, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, slide: result.slide })
}

/** Remove um slide e apaga as artes que ficaram sem dono. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para editar o Hero da Loja." }, { status: 403 })
  }

  const { id } = await context.params
  const result = await deleteHeroSlide(id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
