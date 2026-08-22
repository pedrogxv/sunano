import { z } from "zod"

import { BANNER_LINK_HINT, isValidBannerLink, normalizeBannerLink } from "@/lib/banner-link"

/**
 * Schemas compartilhados entre `POST /api/admin/store-banners` e
 * `PATCH /api/admin/store-banners/[id]` — as duas rotas aceitam exatamente o
 * mesmo conjunto de campos, mudando só o que é obrigatório.
 */

const SECTIONS = ["main", "best_sellers", "pre_sale", "ready_stock", "site_items"] as const

const nullableTrimmed = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .nullish()
    .transform((value) => value?.trim() || null)

const ctaLink = z
  .string()
  .nullish()
  .transform((value) => normalizeBannerLink(value))
  .refine((value) => value === null || isValidBannerLink(value), BANNER_LINK_HINT)

export const createStoreBannerSchema = z
  .object({
    section: z.enum(SECTIONS),
    imageUrl: z
      .string()
      .nullish()
      .transform((value) => value?.trim() || null),
    videoUrl: z
      .string()
      .nullish()
      .transform((value) => value?.trim() || null),
    title: z.string().trim().min(1, "Envie o título do banner.").max(120, "Título deve ter no máximo 120 caracteres."),
    subtitle: nullableTrimmed(200, "Subtítulo deve ter no máximo 200 caracteres."),
    ctaText: nullableTrimmed(40, "Texto do botão deve ter no máximo 40 caracteres."),
    ctaLink,
    isActive: z.boolean().optional().default(true),
  })
  .refine((value) => Boolean(value.imageUrl || value.videoUrl), {
    message: "Envie uma imagem ou um vídeo de fundo.",
    path: ["imageUrl"],
  })

// ── Edição: chave AUSENTE precisa significar "não mexe nesse campo", e só
// `null` explícito deve limpá-lo — senão um PATCH parcial (ex.: só alternar
// `isActive`) apagaria imagem/vídeo/subtítulo/CTA sem o admin ter pedido.
//
// `.nullish()` (usado no schema de criação acima) faz o Zod rodar o
// `.transform()` mesmo quando a chave está ausente do payload — porque o tipo
// de baixo já aceita `undefined`, o `.optional()` no fim não impede isso — e o
// resultado vira `null` de qualquer forma. Isso faria QUALQUER PATCH parcial
// zerar os campos omitidos (e, com a constraint `image_url is not null or
// video_url is not null`, até o botão de ativar/desativar quebraria). Usar
// `.nullable()` (sem aceitar `undefined`) como base faz o Zod pular o campo
// de fato quando a chave está ausente, preservando a distinção.
const editableTrimmed = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .nullable()
    .transform((value) => value?.trim() || null)
    .optional()

const editableCtaLink = z
  .string()
  .nullable()
  .transform((value) => normalizeBannerLink(value))
  .refine((value) => value === null || isValidBannerLink(value), BANNER_LINK_HINT)
  .optional()

export const updateStoreBannerSchema = z
  .object({
    section: z.enum(SECTIONS).optional(),
    imageUrl: z
      .string()
      .nullable()
      .transform((value) => value?.trim() || null)
      .optional(),
    videoUrl: z
      .string()
      .nullable()
      .transform((value) => value?.trim() || null)
      .optional(),
    title: z
      .string()
      .trim()
      .min(1, "Envie o título do banner.")
      .max(120, "Título deve ter no máximo 120 caracteres.")
      .optional(),
    subtitle: editableTrimmed(200, "Subtítulo deve ter no máximo 200 caracteres."),
    ctaText: editableTrimmed(40, "Texto do botão deve ter no máximo 40 caracteres."),
    ctaLink: editableCtaLink,
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nenhum campo para atualizar.")
  // Só dispara quando os DOIS campos vêm explícitos no payload e ambos ficam
  // vazios — omitir um deles (chave ausente = "não mexe") não passa por aqui,
  // já que só dá pra saber se o resultado final fica sem mídia comparando com
  // o que já está salvo, e isso o schema não tem como ver.
  .refine(
    (value) => !(value.imageUrl !== undefined && value.videoUrl !== undefined && !value.imageUrl && !value.videoUrl),
    { message: "Envie uma imagem ou um vídeo de fundo.", path: ["imageUrl"] }
  )
