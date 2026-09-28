import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { createHeroSlide, listAllHeroSlides } from "@/lib/server/repositories/store-hero-repository"

import { createStoreHeroSchema } from "./schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Lista todos os slides do Hero da Loja (no ar, agendados, encerrados e desativados). */
export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Sem permissão para ver o Hero da Loja." }, { status: 403 })
  }

  try {
    const slides = await listAllHeroSlides()
    return NextResponse.json({ slides })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao listar os slides.")
    return NextResponse.json(body, { status })
  }
}

/** Cria um slide no fim da fila. */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para editar o Hero da Loja." }, { status: 403 })
  }

  const parsed = createStoreHeroSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const result = await createHeroSlide(parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, slide: result.slide }, { status: 201 })
}
