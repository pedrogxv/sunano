import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  ActiveBannerLimitError,
  createBanner,
  listAllBanners,
  MAX_ACTIVE_BANNERS,
} from "@/lib/server/repositories/banners-repository"

import { createBannerSchema } from "./schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Lista todos os banners (ativos, inativos e agendados) para o painel. */
export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "banners_read")) {
    return NextResponse.json({ error: "Sem permissão para ver banners." }, { status: 403 })
  }

  try {
    const banners = await listAllBanners()
    return NextResponse.json({
      banners,
      activeCount: banners.filter((banner) => banner.is_active).length,
      maxActive: MAX_ACTIVE_BANNERS,
    })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao listar banners.")
    return NextResponse.json(body, { status })
  }
}

/** Cria um banner no fim da fila. */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "banners_write")) {
    return NextResponse.json({ error: "Sem permissão para criar banners." }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = createBannerSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    const banner = await createBanner({
      imageUrl: parsed.data.imageUrl,
      imageUrlMobile: parsed.data.imageUrlMobile ?? null,
      linkUrl: parsed.data.linkUrl,
      altText: parsed.data.altText ?? null,
      isActive: parsed.data.isActive,
      startsAt: parsed.data.startsAt ?? null,
      endsAt: parsed.data.endsAt ?? null,
    })
    return NextResponse.json({ ok: true, banner }, { status: 201 })
  } catch (error) {
    if (error instanceof ActiveBannerLimitError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    const { body, status } = dbErrorResponse(error, "Erro ao criar banner.")
    return NextResponse.json(body, { status })
  }
}
