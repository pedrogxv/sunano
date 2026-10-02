import * as z from "zod"

import { PREORDER_STATUSES, type PreorderStatus } from "@/lib/store-preorder"

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** "" vira null: o form manda campo vazio quando o admin apaga o valor. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value || null)
    .nullable()
    .optional()

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || DATE_KEY.test(value), "Data inválida.")
  .transform((value) => value || null)
  .nullable()
  .optional()

/**
 * Campos da página do produto que entraram com a migration 20261213000001:
 * SKU de produto simples, lote de pré-venda e Lançamento. Fragmento único
 * para a criação (POST) e a edição (PATCH) não divergirem.
 */
export const productPageFieldsShape = {
  sku: optionalText(64, "O SKU tem até 64 caracteres."),
  preorder_batch_name: optionalText(60, "O nome do lote tem até 60 caracteres."),
  preorder_ships_at: optionalDate,
  preorder_status: z.enum(PREORDER_STATUSES as [PreorderStatus, ...PreorderStatus[]]).optional(),
  is_launch: z.boolean().optional(),
  launch_until: optionalDate,
}

/** Mensagem para SKU repetido (índice único `store_products_sku_uniq`). */
export function skuConflictMessage(error: { code?: string; message?: string } | null): string | null {
  if (error?.code === "23505" && error.message?.includes("sku_uniq")) {
    return "Esse SKU já está em uso em outro produto."
  }
  return null
}

const skuRowSchema = z.object({
  variant_id: z.string().uuid().nullable(),
  option_ids: z.array(z.string().uuid()).max(6),
  sku: optionalText(64, "O SKU tem até 64 caracteres.").transform((value) => value ?? null),
  price_cents: z.number().int().min(600, "Preço mínimo de R$6,00.").nullable(),
  promo_price_cents: z.number().int().positive().nullable(),
  stock: z.number().int().min(0).max(999_999).nullable(),
  image_url: z.string().trim().url().nullable(),
  is_sold_out: z.boolean(),
})

/** Matriz de combinações (PUT /api/admin/store/products/[id]/skus). */
export const productSkusSchema = z.object({
  skus: z
    .array(skuRowSchema)
    .max(400, "Combinações demais para um produto.")
    .superRefine((rows, ctx) => {
      rows.forEach((row, index) => {
        if (row.promo_price_cents != null && row.price_cents != null && row.promo_price_cents >= row.price_cents) {
          ctx.addIssue({ code: "custom", path: [index, "promo_price_cents"], message: "Promoção da combinação precisa ser menor que o preço dela." })
        }
      })
      const codes = rows.map((row) => row.sku?.toLowerCase()).filter(Boolean)
      if (new Set(codes).size !== codes.length) {
        ctx.addIssue({ code: "custom", message: "Duas combinações com o mesmo SKU." })
      }
    }),
})
