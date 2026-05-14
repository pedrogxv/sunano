import { NextRequest, NextResponse } from "next/server"
import { getAuthorizedProfile } from "@/lib/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { parseSlug } from "@/lib/stripe"

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type") // 'store' | 'bazaar' | null = all

  const db = createSupabaseAdminClient()
  let query = db
    .from("store_products")
    .select("*")
    .order("created_at", { ascending: false })

  if (type === "store" || type === "bazaar") {
    query = query.eq("type", type)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ products: data })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const body = await request.json()
  const { name, description, price_cents, stock, images, category, type, condition, condition_notes, is_active } = body

  if (!name || !price_cents || !type) {
    return NextResponse.json({ error: "Campos obrigatórios: name, price_cents, type" }, { status: 400 })
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
      description: description || null,
      price_cents: Number(price_cents),
      stock: Number(stock ?? 0),
      images: images || [],
      category: category || null,
      type,
      condition: condition || "new",
      condition_notes: condition_notes || null,
      is_active: is_active !== false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ product: data })
}
