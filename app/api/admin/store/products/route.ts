import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  listStoreProductsPaginated,
  recordPriceHistoryIfChanged,
  type StoreProductListFilters,
} from "@/lib/server/repositories/store-repository"
import { parseSlug } from "@/lib/format"
import { isValidYoutubeUrl } from "@/lib/youtube-url"

const MAX_PRODUCT_IMAGES = 8
const MAX_STOCK = 999_999
const MIN_PRICE_CENTS = 600

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  price_cents: z.number().int().min(MIN_PRICE_CENTS, "Preço mínimo de R$6,00."),
  promo_price_cents: z.number().int().positive().nullable().optional(),
  stock: z.number().int().min(0).max(MAX_STOCK).nullable().optional(),
  images: z.array(z.string().url()).max(MAX_PRODUCT_IMAGES).optional().default([]),
  category: z.string().trim().max(50).optional().nullable(),
  brand: z.string().trim().max(80).optional().nullable(),
  type: z.enum(["store", "bazaar"]),
  condition: z.enum(["new", "used", "opened"]).optional().default("new"),
  condition_notes: z.string().trim().max(1000).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  is_sold_out: z.boolean().optional().default(false),
  features: z.array(z.string().trim().min(1).max(200)).max(30).optional().default([]),
  video_url: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidYoutubeUrl(v), "URL de vídeo precisa ser um link do YouTube.")
    .optional()
    .nullable(),
})

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const typeParam = searchParams.get("type") // 'store' | 'bazaar' | null = all
  const type = typeParam === "store" || typeParam === "bazaar" ? typeParam : undefined

  function parseNumber(value: string | null): number | undefined {
    if (!value) return undefined
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }

  function parseCsv(value: string | null): string[] | undefined {
    const trimmed = value?.trim()
    if (!trimmed) return undefined
    const list = trimmed.split(",").map((v) => v.trim()).filter(Boolean)
    return list.length > 0 ? list : undefined
  }

  const filters: StoreProductListFilters = {
    type,
    includeInactive: true,
    search: searchParams.get("search")?.trim() || undefined,
    categories: parseCsv(searchParams.get("categories")),
    brands: parseCsv(searchParams.get("brands")),
    outOfStockOnly: searchParams.get("outOfStock") === "1",
    featured: searchParams.get("featured") === "1" ? true : undefined,
    page: parseNumber(searchParams.get("page")),
    pageSize: parseNumber(searchParams.get("pageSize")) ?? 100,
  }

  const { items, total } = await listStoreProductsPaginated(filters)
  return NextResponse.json({
    products: items,
    total,
    page: Math.max(1, filters.page ?? 1),
    pageSize: filters.pageSize,
  })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const parsed = createProductSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }
  const {
    name, description, price_cents, promo_price_cents, stock, images, category, brand, type, condition,
    condition_notes, is_active, is_sold_out, features, video_url,
  } = parsed.data

  if (promo_price_cents != null && promo_price_cents >= price_cents) {
    return NextResponse.json(
      { error: "Preço promocional deve ser menor que o preço base." },
      { status: 400 }
    )
  }

  // Generate unique slug
  const db = createSupabaseAdminClient()
  let slug = parseSlug(name)
  const { data: existing } = await db
    .from("store_products")
    .select("slug")
    .like("slug", `${slug}%`)

  if (existing && existing.length > 0) {
    slug = `${slug}-${Date.now()}`
  }

  const { data, error } = await db
    .from("store_products")
    .insert({
      slug,
      name,
      description: description ?? null,
      price_cents,
      promo_price_cents: promo_price_cents ?? null,
      stock: stock ?? null,
      images,
      category: category ?? null,
      brand: brand ?? null,
      type,
      condition,
      condition_notes: condition_notes ?? null,
      is_active,
      is_sold_out,
      features,
      video_url: video_url || null,
    })
    .select()
    .single()

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao criar produto.")
    return NextResponse.json(body, { status })
  }

  await recordPriceHistoryIfChanged(data.id as string, null, price_cents, promo_price_cents ?? null)

  return NextResponse.json({ product: data })
}
