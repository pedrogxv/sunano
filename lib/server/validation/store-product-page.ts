import * as z from "zod"

import { PREORDER_STATUSES, type PreorderStatus } from "@/lib/store-preorder"
import { SALE_WINDOW_END_ACTIONS, type SaleWindowEndAction } from "@/lib/store-sale-window"

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
  /**
   * Prazo da pré-venda/lançamento (ISO com fuso). Data no passado é recusada:
   * o cron fecharia o prazo (e mudaria o preço) cinco minutos depois do save.
   * O PATCH só manda o campo quando ele mudou, então um prazo antigo salvo
   * não trava o resto do form.
   */
  sale_window_ends_at: z
    .string()
    .trim()
    .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), "Data do fim do prazo inválida.")
    .refine((value) => value === "" || Date.parse(value) > Date.now(), "O fim do prazo precisa ser no futuro.")
    .transform((value) => (value ? new Date(value).toISOString() : null))
    .nullable()
    .optional(),
  sale_window_end_action: z.enum(SALE_WINDOW_END_ACTIONS as [SaleWindowEndAction, ...SaleWindowEndAction[]]).optional(),
  sale_window_end_price_cents: z.number().int().min(600, "Preço depois do prazo: mínimo de R$6,00.").nullable().optional(),
}

/**
 * "Muda para outro preço" sem o preço não tem o que aplicar; o preço solto
 * sem essa escolha seria ignorado pelo cron e enganaria quem lê o admin. O
 * banco recusa os dois (`store_products_sale_window_end_price_check`); aqui
 * a mensagem sai legível. Só confere quando os dois vieram no corpo (o PATCH
 * manda o que mudou, e o form manda o par junto).
 */
export function saleWindowPriceIssue(fields: {
  sale_window_end_action?: SaleWindowEndAction
  sale_window_end_price_cents?: number | null
}): string | null {
  if (fields.sale_window_end_action === undefined) return null
  if (fields.sale_window_end_action === "set_price" && fields.sale_window_end_price_cents == null) {
    return "Informe o preço que passa a valer depois do prazo."
  }
  if (fields.sale_window_end_action !== "set_price" && fields.sale_window_end_price_cents != null) {
    return "O preço depois do prazo só vale com \"Muda para outro preço\"."
  }
  return null
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
