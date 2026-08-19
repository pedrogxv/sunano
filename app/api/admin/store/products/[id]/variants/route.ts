import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { replaceProductVariants } from "@/lib/server/repositories/store-repository"

const MAX_STOCK = 999_999
const MIN_PRICE_CENTS = 600
const MAX_VARIANTS_PER_PRODUCT = 12
const MAX_IMAGES_PER_VARIANT = 3

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

const variantsSchema = z.object({
  variants: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        label: z.string().trim().min(1).max(120),
        price_cents_override: z.number().int().min(MIN_PRICE_CENTS, "Preço mínimo de R$6,00.").nullable().optional(),
        promo_price_cents: z.number().int().positive().nullable().optional(),
        stock: z.number().int().min(0).max(MAX_STOCK).nullable().optional(),
        color: z.string().regex(HEX_COLOR_RE).nullable().optional(),
        icon: z.string().trim().max(40).nullable().optional(),
        image_url: z.string().trim().url().max(2048).nullable().optional(),
        images: z.array(z.string().trim().url().max(2048)).max(MAX_IMAGES_PER_VARIANT).optional().default([]),
        is_sold_out: z.boolean().optional().default(false),
      })
      .refine(
        (v) => v.promo_price_cents == null || v.price_cents_override == null || v.promo_price_cents < v.price_cents_override,
        { message: "Preço promocional da variante deve ser menor que o preço da variante.", path: ["promo_price_cents"] }
      )
    )
    .max(MAX_VARIANTS_PER_PRODUCT, `Cada produto pode ter no máximo ${MAX_VARIANTS_PER_PRODUCT} variantes.`),
})

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await context.params
  const parsed = variantsSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    await replaceProductVariants(
      id,
      parsed.data.variants.map((v) => ({
        ...v,
        price_cents_override: v.price_cents_override ?? null,
        promo_price_cents: v.promo_price_cents ?? null,
        stock: v.stock ?? null,
        color: v.color ?? null,
        icon: v.icon ?? null,
        image_url: v.image_url ?? null,
        is_sold_out: v.is_sold_out ?? false,
      }))
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar variantes."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
