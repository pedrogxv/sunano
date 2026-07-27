import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const LINK_COLUMNS = "id, slug, name, type, price_cents, images, stock, is_active"

const linksPayload = z.object({
  storeProductId: z.string().uuid().nullable().optional(),
  bazaarProductId: z.string().uuid().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "peripherals_read")) {
    return NextResponse.json({ error: "Sem permissão para ler periféricos." }, { status: 403 })
  }

  const { id } = await params
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_products")
    .select(LINK_COLUMNS)
    .eq("peripheral_id", id)

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao listar produtos vinculados.")
    return NextResponse.json(body, { status })
  }

  const rows = (data ?? []) as Array<{ id: string; type: "store" | "bazaar" } & Record<string, unknown>>
  const store = rows.find((p) => p.type === "store") ?? null
  const bazaar = rows.find((p) => p.type === "bazaar") ?? null
  return NextResponse.json({ store, bazaar })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "peripherals_write")) {
    return NextResponse.json({ error: "Sem permissão para vincular produtos a periféricos." }, { status: 403 })
  }

  const { id } = await params

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido (JSON malformado)." }, { status: 400 })
  }

  const parsed = linksPayload.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json({ error: first?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const db = createSupabaseAdminClient()

  for (const [type, productId] of [
    ["store", parsed.data.storeProductId ?? null] as const,
    ["bazaar", parsed.data.bazaarProductId ?? null] as const,
  ]) {
    if (productId) {
      const { data: product, error: lookupError } = await db
        .from("store_products")
        .select("id, type")
        .eq("id", productId)
        .maybeSingle()
      if (lookupError) {
        const { body, status } = dbErrorResponse(lookupError, "Erro ao buscar produto.")
        return NextResponse.json(body, { status })
      }
      if (!product) {
        return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 })
      }
      if (product.type !== type) {
        return NextResponse.json(
          { error: type === "store" ? "O produto selecionado precisa ser do tipo Loja." : "O item selecionado precisa ser do tipo Bazar." },
          { status: 400 }
        )
      }
    }

    const { error: clearError } = await (db.from("store_products") as any)
      .update({ peripheral_id: null })
      .eq("peripheral_id", id)
      .eq("type", type)
    if (clearError) {
      const { body, status } = dbErrorResponse(clearError, "Erro ao limpar vínculo anterior.")
      return NextResponse.json(body, { status })
    }

    if (productId) {
      const { error: setError } = await (db.from("store_products") as any)
        .update({ peripheral_id: id })
        .eq("id", productId)
      if (setError) {
        const { body, status } = dbErrorResponse(setError, "Erro ao salvar vínculo.")
        return NextResponse.json(body, { status })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
