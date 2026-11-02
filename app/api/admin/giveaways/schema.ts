import { z } from "zod"

import { ALL_CATEGORIES } from "@/lib/tag-options"

/** Corpo de `POST /api/admin/giveaways` e `PATCH /api/admin/giveaways/[id]` (estado completo, não parcial). */
export const giveawayPayload = z
  .object({
    title: z.string().trim().min(1, "Dê um nome ao prêmio.").max(120, "Nome muito longo (máx. 120)."),
    category: z.enum(ALL_CATEGORIES as [string, ...string[]], { message: "Categoria inválida." }),
    rarity: z.enum(["rare", "special", "legendary"], { message: "Raridade inválida." }),
    peripheralId: z.string().uuid().nullish().transform((value) => value ?? null),
    imageUrl: z
      .string()
      .trim()
      .max(1024)
      .nullish()
      .transform((value) => value || null),
    maxParticipants: z
      .number({ message: "Informe o limite de participantes." })
      .int()
      .min(1, "Pelo menos 1 participante.")
      .max(100_000, "Limite muito alto."),
    status: z.enum(["draft", "open", "closed"]),
    endsAt: z
      .string()
      .nullish()
      .transform((value) => value?.trim() || null)
      .refine((value) => value === null || !Number.isNaN(Date.parse(value)), "Data de encerramento inválida."),
    sortOrder: z.number().int().min(-1000).max(1000).default(0),
  })
  .refine((value) => value.peripheralId || value.imageUrl, {
    message: "Escolha um periférico do catálogo ou envie uma foto.",
    path: ["peripheralId"],
  })

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
