import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { ALLOWED_PERIPHERAL_CATEGORIES, ALLOWED_PERIPHERAL_TIERS, dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { cascadeRerank, getRankingFromSpecs } from "@/lib/server/peripherals/ranking-cascade"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DEFAULT_COLUMNS = "id, name, brand, category, tier, price, image_url, tags, specs, created_at"

const peripheralUpdate = z
  .object({
    name: z.string().min(1, "Nome não pode ficar vazio.").max(200, "Nome muito longo (máx. 200 caracteres).").optional(),
    brand: z.string().min(1, "Marca não pode ficar vazia.").max(120, "Marca muito longa (máx. 120 caracteres).").optional(),
    category: z.enum(ALLOWED_PERIPHERAL_CATEGORIES, {
      message: `Categoria inválida. Use uma das opções: ${ALLOWED_PERIPHERAL_CATEGORIES.join(", ")}.`,
    }).optional(),
    tier: z.union([z.enum(ALLOWED_PERIPHERAL_TIERS), z.null()]).optional(),
    price: z.number({ message: "Preço deve ser um número." }).nonnegative("Preço não pode ser negativo.").optional(),
    image_url: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    specs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    .from("peripherals")
    .select(DEFAULT_COLUMNS)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao buscar periférico.")
    return NextResponse.json(body, { status })
  }
  if (!data) {
    return NextResponse.json({ error: "Periférico não encontrado." }, { status: 404 })
  }

  return NextResponse.json({ peripheral: data })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "peripherals_write")) {
    return NextResponse.json({ error: "Sem permissão para editar periféricos." }, { status: 403 })
  }

  const { id } = await params

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido (JSON malformado)." }, { status: 400 })
  }

  const parsed = peripheralUpdate.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      { error: first?.message ?? "Dados inválidos.", field: first?.path[0] as string | undefined },
      { status: 400 }
    )
  }

  const db = createSupabaseAdminClient()

  const { data: current } = await (db.from("peripherals") as any)
    .select("category, specs")
    .eq("id", id)
    .single()

  const { data, error } = await (db.from("peripherals") as any)
    .update(parsed.data)
    .eq("id", id)
    .select(DEFAULT_COLUMNS)
    .single()

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao atualizar periférico.")
    return NextResponse.json(body, { status })
  }

  if (current) {
    const oldCategory = current.category as string
    const newCategory = (parsed.data.category ?? oldCategory) as string
    const oldRanking = getRankingFromSpecs(current.specs as Record<string, unknown>)
    const newSpecs = parsed.data.specs !== undefined
      ? (parsed.data.specs as Record<string, unknown>)
      : (current.specs as Record<string, unknown>)
    const newRanking = getRankingFromSpecs(newSpecs)

    if (oldCategory === newCategory) {
      await cascadeRerank(db, newCategory, id, oldRanking, newRanking)
    } else {
      if (oldRanking !== null) await cascadeRerank(db, oldCategory, id, oldRanking, null)
      if (newRanking !== null) await cascadeRerank(db, newCategory, id, null, newRanking)
    }
  }

  return NextResponse.json({ peripheral: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "peripherals_write")) {
    return NextResponse.json({ error: "Sem permissão para deletar periféricos." }, { status: 403 })
  }

  const { id } = await params

  const db = createSupabaseAdminClient()

  const { data: current } = await (db.from("peripherals") as any)
    .select("category, specs")
    .eq("id", id)
    .single()

  const { error } = await db.from("peripherals").delete().eq("id", id)

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao deletar periférico.")
    return NextResponse.json(body, { status })
  }

  if (current) {
    const oldRanking = getRankingFromSpecs(current.specs as Record<string, unknown>)
    if (oldRanking !== null) {
      await cascadeRerank(db, current.category as string, id, oldRanking, null)
    }
  }

  return NextResponse.json({ ok: true })
}
