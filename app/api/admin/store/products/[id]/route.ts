import { NextRequest, NextResponse } from "next/server"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { recordPriceHistoryIfChanged, listProductVariantGroups } from "@/lib/server/repositories/store-repository"
import type { Database } from "@/lib/database.types"

type StoreProductUpdate = Database["public"]["Tables"]["store_products"]["Update"]

const MAX_PRODUCT_IMAGES = 8
const MAX_STOCK = 999_999
const MIN_PRICE_CENTS = 600

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
  const [{ data, error }, { data: specs }, { data: variants }, { data: peripherals }, variantGroups] =
    await Promise.all([
      db.from("store_products").select("*").eq("id", id).single(),
      db
        .from("store_product_specs")
        .select("id, label, value, position")
        .eq("product_id", id)
        .order("position", { ascending: true }),
      db
        .from("store_product_variants")
        .select("id, label, price_cents_override, promo_price_cents, stock, position, color, icon, image_url, is_sold_out")
        .eq("product_id", id)
        .eq("is_active", true)
        .order("position", { ascending: true }),
      db
        .from("store_product_peripherals")
        .select("peripheral_id, position")
        .eq("product_id", id)
        .order("position", { ascending: true }),
      listProductVariantGroups(id),
    ])

  if (error) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })

  return NextResponse.json({
    product: data,
    specs: specs ?? [],
    variants: variants ?? [],
    variantGroups,
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
  const body = await request.json()

  const allowed: (keyof StoreProductUpdate)[] = [
    "name", "description", "price_cents", "promo_price_cents", "stock", "images",
    "category", "brand", "type", "condition", "condition_notes", "sale_type", "is_active", "is_sold_out",
    "is_featured", "features", "video_url",
  ]
  const patch: StoreProductUpdate = {}
  for (const key of allowed) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key]
  }

  if (Array.isArray(patch.images) && patch.images.length > MAX_PRODUCT_IMAGES) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_PRODUCT_IMAGES} imagens por produto.` },
      { status: 400 }
    )
  }
  if (typeof patch.stock === "number" && (patch.stock < 0 || patch.stock > MAX_STOCK)) {
    return NextResponse.json(
      { error: `Estoque deve estar entre 0 e ${MAX_STOCK}.` },
      { status: 400 }
    )
  }
  if (typeof patch.price_cents === "number" && patch.price_cents < MIN_PRICE_CENTS) {
    return NextResponse.json(
      { error: "Preço mínimo de R$6,00." },
      { status: 400 }
    )
  }

  const db = createSupabaseAdminClient()

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
    await recordPriceHistoryIfChanged(id, null, data.price_cents, data.promo_price_cents ?? null)
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
  const { error } = await db.from("store_products").delete().eq("id", id)

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao deletar produto.")
    return NextResponse.json(body, { status })
  }

  return NextResponse.json({ ok: true })
}
