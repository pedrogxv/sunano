import { z } from "zod"

import {
  STORE_CAMPAIGN_MAX_PRODUCTS,
  STORE_CAMPAIGN_SUBTITLE_MAX,
  STORE_CAMPAIGN_THEMES,
  STORE_CAMPAIGN_TITLE_MAX,
} from "@/lib/store-campaigns"

/** Corpo de criar e de editar: a campanha inteira, produtos inclusos, de uma vez. */
export const storeCampaignSchema = z.object({
  theme: z.enum(STORE_CAMPAIGN_THEMES, { message: "Tema inválido." }),
  title: z
    .string()
    .trim()
    .min(1, "Dê um título para a campanha.")
    .max(STORE_CAMPAIGN_TITLE_MAX, `O título pode ter até ${STORE_CAMPAIGN_TITLE_MAX} caracteres.`),
  subtitle: z
    .string()
    .max(STORE_CAMPAIGN_SUBTITLE_MAX, `O subtítulo pode ter até ${STORE_CAMPAIGN_SUBTITLE_MAX} caracteres.`)
    .nullable()
    .transform((value) => value?.trim() || null),
  startsAt: z.iso.datetime({ offset: true, message: "Data de início inválida." }),
  endsAt: z.iso.datetime({ offset: true, message: "Data de fim inválida." }),
  isEnabled: z.boolean(),
  productIds: z
    .array(z.uuid("Produto inválido."))
    .max(STORE_CAMPAIGN_MAX_PRODUCTS, `No máximo ${STORE_CAMPAIGN_MAX_PRODUCTS} produtos por campanha.`)
    // Repetido viraria conflito de chave na tabela de ligação; fica a primeira posição.
    .transform((ids) => [...new Set(ids)]),
})
