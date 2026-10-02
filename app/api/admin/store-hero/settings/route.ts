import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { BANNER_LINK_HINT, isValidBannerLink, normalizeBannerLink } from "@/lib/banner-link"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { getStoreHeroSettings, updateStoreHeroSettings } from "@/lib/server/repositories/store-hero-repository"
import { getStoreWideReviewAggregate } from "@/lib/server/repositories/store-reviews-repository"
import {
  HERO_SEAL_DESCRIPTION_MAX,
  HERO_SEAL_ICONS,
  HERO_SEAL_TITLE_MAX,
  MAX_HERO_SEALS,
} from "@/lib/store-hero"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const link = z
  .string()
  .nullable()
  .transform((value) => normalizeBannerLink(value))
  .refine((value) => value === null || isValidBannerLink(value), BANNER_LINK_HINT)

const settingsSchema = z.object({
  sealsEnabled: z.boolean(),
  showRating: z.boolean(),
  seals: z
    .array(
      z.object({
        icon: z.enum(HERO_SEAL_ICONS),
        title: z
          .string()
          .trim()
          .min(1, "Todo selo precisa de um título.")
          .max(HERO_SEAL_TITLE_MAX, `Cada título pode ter até ${HERO_SEAL_TITLE_MAX} caracteres.`),
        description: z
          .string()
          .max(HERO_SEAL_DESCRIPTION_MAX, `Cada descrição pode ter até ${HERO_SEAL_DESCRIPTION_MAX} caracteres.`)
          .nullable()
          .transform((value) => value?.trim() || null),
        link,
      })
    )
    .max(MAX_HERO_SEALS, `No máximo ${MAX_HERO_SEALS} selos.`),
})

/**
 * Selos de curadoria do Hero da Loja e a chave da nota dos compradores. A nota
 * atual vai junto para a prévia do painel mostrar o que a vitrine mostraria.
 */
export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Sem permissão para ver o Hero da Loja." }, { status: 403 })
  }

  const [settings, aggregate] = await Promise.all([getStoreHeroSettings(), getStoreWideReviewAggregate()])
  return NextResponse.json({
    settings,
    rating: aggregate.count > 0 ? { average: aggregate.avgRating, count: aggregate.count } : null,
  })
}

/** Grava os selos inteiros de uma vez (ordem do array = ordem na tela). */
export async function PUT(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para editar o Hero da Loja." }, { status: 403 })
  }

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const result = await updateStoreHeroSettings({ ...parsed.data, adminId: auth.profile.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, settings: result.settings })
}
