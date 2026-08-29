import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  recordPriceHistoryIfChanged,
  listProductVariantGroups,
  listProductVariantCombinations,
} from "@/lib/server/repositories/store-repository"
import { logAdminAction } from "@/lib/server/repositories/store-admin-audit-repository"
import { isValidYoutubeUrl } from "@/lib/youtube-url"
import type { Database } from "@/lib/database.types"

type StoreProductUpdate = Database["public"]["Tables"]["store_products"]["Update"]

const MAX_PRODUCT_IMAGES = 8
const MAX_STOCK = 999_999
const MIN_PRICE_CENTS = 600

// Espelha `createProductSchema` da rota de criação (POST /api/admin/store/products),
// mas com todos os campos opcionais e SEM `.default(...)` — usar `.partial()` num
// schema com defaults preencheria campos ausentes do body com o valor default,
// sobrescrevendo silenciosamente o que já estava salvo em cada PATCH parcial.
const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  price_cents: z.number().int().min(MIN_PRICE_CENTS, "Preço mínimo de R$6,00.").optional(),
  promo_price_cents: z.number().int().positive().nullable().optional(),
  stock: z.number().int().min(0).max(MAX_STOCK).nullable().optional(),
  images: z.array(z.string().trim().url()).max(MAX_PRODUCT_IMAGES).optional(),
  category: z.string().trim().max(50).nullable().optional(),
  brand: z.string().trim().max(80).nullable().optional(),
  condition: z.enum(["new", "used", "opened"]).optional(),
  condition_notes: z.string().trim().max(1000).nullable().optional(),
  sale_type: z.enum(["pre_order", "ready_stock", "normal"]).optional(),
  is_active: z.boolean().optional(),
  is_sold_out: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  pin_best_seller: z.boolean().optional(),
  features: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  video_url: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidYoutubeUrl(v), "URL de vídeo precisa ser um link do YouTube.")
    .nullable()
    .optional(),
})

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await context.params
  const db = createSupabaseAdminClient()
  const [{ data, error }, { data: specs }, { data: variants }, { data: peripherals }, variantGroups, combinations] =
    await Promise.all([
      db.from("store_products").select("*").eq("id", id).single(),
      db
        .from("store_product_specs")
        .select("id, label, value, position")
        .eq("product_id", id)
        .order("position", { ascending: true }),
      db
        .from("store_product_variants")
        .select(
          // `variant_images` precisa vir junto: o formulário de edição reenvia
          // as variantes inteiras a cada save e `replaceProductVariants` faz
          // delete-then-insert da galeria. Sem as imagens aqui o form monta o
          // estado com `images: []` e qualquer edição — trocar o "esgotado",
          // por exemplo — apagava silenciosamente a galeria das variantes.
          "id, label, price_cents_override, promo_price_cents, stock, position, color, icon, image_url, is_sold_out, variant_images:store_product_variant_images(url, position)"
        )
        .eq("product_id", id)
        .eq("is_active", true)
        .order("position", { ascending: true }),
      db
        .from("store_product_peripherals")
        .select("peripheral_id, position")
        .eq("product_id", id)
        .order("position", { ascending: true }),
      listProductVariantGroups(id),
      listProductVariantCombinations(id),
    ])

  if (error) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })

  // Achata o join em `images: string[]`, que é o formato que o formulário
  // consome e que a rota de save (PUT .../variants) espera de volta.
  type RawVariantRow = { variant_images?: { url: string; position: number }[] | null }
  const variantsWithImages = (variants ?? []).map((variant) => {
    const { variant_images, ...rest } = variant as typeof variant & RawVariantRow
    return {
      ...rest,
      images: [...(variant_images ?? [])].sort((a, b) => a.position - b.position).map((img) => img.url),
    }
  })

  return NextResponse.json({
    product: data,
    specs: specs ?? [],
    variants: variantsWithImages,
    variantGroups,
    combinations,
    peripheralIds: (peripherals ?? []).map((row) => row.peripheral_id),
  })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido (JSON malformado)." }, { status: 400 })
  }

  const parsed = updateProductSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const allowed = Object.keys(updateProductSchema.shape) as (keyof StoreProductUpdate)[]
  const patch: StoreProductUpdate = {}
  for (const key of allowed) {
    if (key in parsed.data) (patch as Record<string, unknown>)[key] = (parsed.data as Record<string, unknown>)[key]
  }
  if (typeof patch.video_url === "string") patch.video_url = patch.video_url || null

  const db = createSupabaseAdminClient()

  // Fixar/desfixar em "Mais vendidos": entra no fim da fila manual (editável
  // depois em /admin/store, arrastar-e-soltar) e sai da fila ao desfixar —
  // sem isso o produto reaparecia na posição antiga se fosse refixado depois.
  if (patch.pin_best_seller === true) {
    const { data: last } = await db
      .from("store_products")
      .select("best_seller_position")
      .eq("pin_best_seller", true)
      .order("best_seller_position", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    patch.best_seller_position = (last?.best_seller_position ?? -1) + 1
  } else if (patch.pin_best_seller === false) {
    patch.best_seller_position = null
  }

  if ("promo_price_cents" in patch) {
    const effectivePriceCents =
      typeof patch.price_cents === "number"
        ? patch.price_cents
        : (await db.from("store_products").select("price_cents").eq("id", id).single()).data?.price_cents

    if (
      patch.promo_price_cents != null &&
      typeof effectivePriceCents === "number" &&
      patch.promo_price_cents >= effectivePriceCents
    ) {
      return NextResponse.json(
        { error: "Preço promocional deve ser menor que o preço base." },
        { status: 400 }
      )
    }
  }

  const { data, error } = await db
    .from("store_products")
    .update(patch)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao atualizar produto.")
    return NextResponse.json(body, { status })
  }

  if (typeof data.price_cents === "number") {
    await recordPriceHistoryIfChanged(id, null, data.price_cents, data.promo_price_cents ?? null, auth.profile.id)
  }

  return NextResponse.json({ product: data })
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await context.params
  const db = createSupabaseAdminClient()

  const { data: existing } = await db.from("store_products").select("*").eq("id", id).maybeSingle()

  const { error } = await db.from("store_products").delete().eq("id", id)

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao deletar produto.")
    return NextResponse.json(body, { status })
  }

  await logAdminAction({
    adminId: auth.profile.id,
    action: "product.delete",
    entityType: "store_product",
    entityId: id,
    before: existing ?? null,
    after: null,
  })

  return NextResponse.json({ ok: true })
}
