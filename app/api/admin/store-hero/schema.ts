import { z } from "zod"

import { BANNER_LINK_HINT, isValidBannerLink, normalizeBannerLink } from "@/lib/banner-link"
import { HERO_CTA_TEXT_MAX, HERO_SUBTITLE_MAX, HERO_TITLE_MAX } from "@/lib/store-hero"

/**
 * Schemas de `POST /api/admin/store-hero` e `PATCH /api/admin/store-hero/[id]`.
 *
 * Regras que dependem do slide inteiro (arte OU produto; fim depois do
 * início) moram em `store-hero-repository`, que enxerga o que já está salvo.
 * Mesma distinção de store-banners/schema.ts: na edição, chave AUSENTE = "não
 * mexe", e só `null` explícito limpa o campo, por isso `.nullable()` e não
 * `.nullish()` no PATCH.
 */

const trimmedOrNull = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .nullable()
    .transform((value) => value?.trim() || null)

const link = z
  .string()
  .nullable()
  .transform((value) => normalizeBannerLink(value))
  .refine((value) => value === null || isValidBannerLink(value), BANNER_LINK_HINT)

const mediaUrl = z
  .string()
  .nullable()
  .transform((value) => value?.trim() || null)
  .refine((value) => value === null || /^https:\/\//i.test(value), "A imagem precisa ser uma URL https.")

const dateTime = z.iso.datetime({ offset: true, message: "Data inválida." }).nullable()

const fields = {
  title: z
    .string()
    .trim()
    .min(1, "Escreva o título do slide.")
    .max(HERO_TITLE_MAX, `Título deve ter no máximo ${HERO_TITLE_MAX} caracteres.`),
  subtitle: trimmedOrNull(HERO_SUBTITLE_MAX, `Subtítulo deve ter no máximo ${HERO_SUBTITLE_MAX} caracteres.`),
  imageDesktopUrl: mediaUrl,
  imageMobileUrl: mediaUrl,
  productId: z.uuid("Produto inválido.").nullable(),
  primaryCtaText: trimmedOrNull(HERO_CTA_TEXT_MAX, `Texto do botão deve ter no máximo ${HERO_CTA_TEXT_MAX} caracteres.`),
  primaryCtaLink: link,
  secondaryCtaText: trimmedOrNull(HERO_CTA_TEXT_MAX, `Texto do botão deve ter no máximo ${HERO_CTA_TEXT_MAX} caracteres.`),
  secondaryCtaLink: link,
  startsAt: dateTime,
  endsAt: dateTime,
  isActive: z.boolean(),
}

export const createStoreHeroSchema = z.object({
  ...fields,
  subtitle: fields.subtitle.optional().default(null),
  imageDesktopUrl: fields.imageDesktopUrl.optional().default(null),
  imageMobileUrl: fields.imageMobileUrl.optional().default(null),
  productId: fields.productId.optional().default(null),
  primaryCtaText: fields.primaryCtaText.optional().default(null),
  primaryCtaLink: fields.primaryCtaLink.optional().default(null),
  secondaryCtaText: fields.secondaryCtaText.optional().default(null),
  secondaryCtaLink: fields.secondaryCtaLink.optional().default(null),
  startsAt: fields.startsAt.optional().default(null),
  endsAt: fields.endsAt.optional().default(null),
  isActive: fields.isActive.optional().default(true),
})

export const updateStoreHeroSchema = z
  .object({
    title: fields.title.optional(),
    subtitle: fields.subtitle.optional(),
    imageDesktopUrl: fields.imageDesktopUrl.optional(),
    imageMobileUrl: fields.imageMobileUrl.optional(),
    productId: fields.productId.optional(),
    primaryCtaText: fields.primaryCtaText.optional(),
    primaryCtaLink: fields.primaryCtaLink.optional(),
    secondaryCtaText: fields.secondaryCtaText.optional(),
    secondaryCtaLink: fields.secondaryCtaLink.optional(),
    startsAt: fields.startsAt.optional(),
    endsAt: fields.endsAt.optional(),
    isActive: fields.isActive.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nenhum campo para atualizar.")
