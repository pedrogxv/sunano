import { z } from "zod"

import { TESTIMONIAL_SOURCES } from "@/lib/store-testimonials"

const nullableTrimmed = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .nullish()
    .transform((value) => value?.trim() || null)

/** Mesmo corpo para POST e PATCH: o painel sempre envia o depoimento inteiro. */
export const storeTestimonialSchema = z.object({
  customerName: z.string().trim().min(1, "Informe o nome do cliente.").max(80, "Nome deve ter no máximo 80 caracteres."),
  source: z.enum(TESTIMONIAL_SOURCES),
  productId: z
    .string()
    .uuid("Produto inválido.")
    .nullish()
    .transform((value) => value || null),
  productLabel: nullableTrimmed(120, "Nome do produto deve ter no máximo 120 caracteres."),
  rating: z.number().int().min(1, "Nota de 1 a 5.").max(5, "Nota de 1 a 5."),
  body: z.string().trim().min(1, "Escreva o depoimento.").max(1500, "Depoimento deve ter no máximo 1500 caracteres."),
  proofImageUrl: nullableTrimmed(2000, "URL da prova muito longa.").refine(
    (value) => value === null || /^https:\/\//i.test(value),
    "A prova deve ser uma URL https."
  ),
  purchasedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .nullish()
    .transform((value) => value || null),
  isPublished: z.boolean(),
})
