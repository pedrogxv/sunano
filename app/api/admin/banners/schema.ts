import { z } from "zod"

import { BANNER_LINK_HINT, isValidBannerLink, normalizeBannerLink } from "@/lib/banner-link"

/**
 * Schemas compartilhados entre `POST /api/admin/banners` e
 * `PATCH /api/admin/banners/[id]` — as duas rotas aceitam exatamente o mesmo
 * conjunto de campos, mudando só o que é obrigatório.
 */

const linkUrl = z
  .string()
  .nullish()
  .transform((value) => normalizeBannerLink(value))
  .refine((value) => value === null || isValidBannerLink(value), BANNER_LINK_HINT)

const altText = z
  .string()
  .max(160, "Texto alternativo deve ter no máximo 160 caracteres.")
  .nullish()
  .transform((value) => value?.trim() || null)

const timestamp = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null)
  .refine(
    (value) => value === null || !Number.isNaN(Date.parse(value)),
    "Data inválida."
  )

/** Uma janela que termina antes de começar nunca veicularia. */
function hasValidWindow(value: { startsAt?: string | null; endsAt?: string | null }) {
  if (!value.startsAt || !value.endsAt) return true
  return Date.parse(value.endsAt) > Date.parse(value.startsAt)
}

const WINDOW_ERROR = "A data de fim precisa ser posterior à data de início."

export const createBannerSchema = z
  .object({
    imageUrl: z.string().min(1, "Envie a imagem do banner."),
    imageUrlMobile: z
      .string()
      .nullish()
      .transform((value) => value?.trim() || null),
    linkUrl,
    altText,
    isActive: z.boolean().optional().default(true),
    startsAt: timestamp,
    endsAt: timestamp,
  })
  .refine(hasValidWindow, { message: WINDOW_ERROR, path: ["endsAt"] })

export const updateBannerSchema = z
  .object({
    imageUrl: z.string().min(1).optional(),
    imageUrlMobile: z
      .string()
      .nullish()
      .transform((value) => value?.trim() || null)
      .optional(),
    linkUrl: linkUrl.optional(),
    altText: altText.optional(),
    isActive: z.boolean().optional(),
    startsAt: timestamp.optional(),
    endsAt: timestamp.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nenhum campo para atualizar.")
  .refine(hasValidWindow, { message: WINDOW_ERROR, path: ["endsAt"] })
