import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { createBanner, listAllBanners } from "@/lib/server/repositories/store-banners-repository"

import { createStoreBannerSchema } from "./schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Lista todos os banners de seção da Loja (ativos e inativos) para o painel. */
export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Sem permissão para ver banners." }, { status: 403 })
  }

  try {
    const banners = await listAllBanners()
    return NextResponse.json({ banners })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao listar banners.")
    return NextResponse.json(body, { status })
  }
}

/** Cria um banner no fim da fila da seção informada. */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para criar banners." }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = createStoreBannerSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    const banner = await createBanner({
      section: parsed.data.section,
      imageUrl: parsed.data.imageUrl ?? null,
      videoUrl: parsed.data.videoUrl ?? null,
      title: parsed.data.title,
      subtitle: parsed.data.subtitle ?? null,
      ctaText: parsed.data.ctaText ?? null,
      ctaLink: parsed.data.ctaLink,
      isActive: parsed.data.isActive,
    })
    return NextResponse.json({ ok: true, banner }, { status: 201 })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao criar banner.")
    return NextResponse.json(body, { status })
  }
}
