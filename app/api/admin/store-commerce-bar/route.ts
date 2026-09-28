import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { BANNER_LINK_HINT, isValidBannerLink, normalizeBannerLink } from "@/lib/banner-link"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  getStoreCommerceBar,
  updateStoreCommerceBar,
} from "@/lib/server/repositories/store-commerce-bar-repository"
import { listStoreProductsPaginated } from "@/lib/server/repositories/store-repository"
import {
  COMMERCE_BENEFIT_ICONS,
  COMMERCE_BENEFIT_TEXT_MAX,
  COMMERCE_CAMPAIGN_LINK_TEXT_MAX,
  COMMERCE_CAMPAIGN_TEXT_MAX,
  COMMERCE_CAMPAIGN_TONES,
  MAX_COMMERCE_BENEFITS,
} from "@/lib/store-commerce-bar"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const link = z
  .string()
  .nullable()
  .transform((value) => normalizeBannerLink(value))
  .refine((value) => value === null || isValidBannerLink(value), BANNER_LINK_HINT)

const optionalText = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .nullable()
    .transform((value) => value?.trim() || null)

const dateTime = z.iso.datetime({ offset: true, message: "Data inválida." }).nullable()

const barSchema = z.object({
  isEnabled: z.boolean(),
  benefits: z
    .array(
      z.object({
        icon: z.enum(COMMERCE_BENEFIT_ICONS),
        text: z
          .string()
          .trim()
          .min(1, "Todo benefício precisa de um texto.")
          .max(COMMERCE_BENEFIT_TEXT_MAX, `Cada benefício pode ter até ${COMMERCE_BENEFIT_TEXT_MAX} caracteres.`),
        link,
      })
    )
    .max(MAX_COMMERCE_BENEFITS, `No máximo ${MAX_COMMERCE_BENEFITS} benefícios.`),
  campaignEnabled: z.boolean(),
  campaignText: optionalText(COMMERCE_CAMPAIGN_TEXT_MAX, `A campanha pode ter até ${COMMERCE_CAMPAIGN_TEXT_MAX} caracteres.`),
  campaignLinkText: optionalText(
    COMMERCE_CAMPAIGN_LINK_TEXT_MAX,
    `O texto do link pode ter até ${COMMERCE_CAMPAIGN_LINK_TEXT_MAX} caracteres.`
  ),
  campaignLink: link,
  campaignProductId: z.uuid("Produto inválido.").nullable(),
  campaignTone: z.enum(COMMERCE_CAMPAIGN_TONES),
  campaignStartsAt: dateTime,
  campaignEndsAt: dateTime,
})

/**
 * Configuração atual da barra comercial da Loja, com o card do produto da
 * campanha (inclusive pausado) para o seletor do painel mostrar o escolhido.
 */
export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Sem permissão para ver a barra comercial." }, { status: 403 })
  }

  const config = await getStoreCommerceBar()
  const productId = config.campaign.productId
  const campaignProduct = productId
    ? (await listStoreProductsPaginated({ type: "store", productIds: [productId], pageSize: 1, includeInactive: true }))
        .items[0] ?? null
    : null

  return NextResponse.json({ config, campaignProduct })
}

/** Grava a barra inteira (benefícios + campanha) de uma vez. */
export async function PUT(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para editar a barra comercial." }, { status: 403 })
  }

  const parsed = barSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const result = await updateStoreCommerceBar({ ...parsed.data, adminId: auth.profile.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, config: result.config })
}
