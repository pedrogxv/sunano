import { NextRequest, NextResponse } from "next/server"
import { getAuthorizedProfile } from "@/lib/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import type { Database } from "@/lib/supabase"

type StoreProductUpdate = Database["public"]["Tables"]["store_products"]["Update"]

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
  const { data, error } = await db
    .from("store_products")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })

  return NextResponse.json({ product: data })
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
    "name", "description", "price_cents", "stock", "images",
    "category", "type", "condition", "condition_notes", "is_active",
  ]
  const patch: StoreProductUpdate = {}
  for (const key of allowed) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key]
  }

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_products")
    .update(patch)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
