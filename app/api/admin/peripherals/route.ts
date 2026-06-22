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

const peripheralPayload = z.object({
  name: z.string().min(1, "Nome é obrigatório.").max(200, "Nome muito longo (máx. 200 caracteres)."),
  brand: z.string().min(1, "Marca é obrigatória.").max(120, "Marca muito longa (máx. 120 caracteres)."),
  category: z.enum(ALLOWED_PERIPHERAL_CATEGORIES, {
    message: `Categoria inválida. Use uma das opções: ${ALLOWED_PERIPHERAL_CATEGORIES.join(", ")}.`,
  }),
  tier: z.union([z.enum(ALLOWED_PERIPHERAL_TIERS), z.null()]).optional(),
  price: z.number({ message: "Preço deve ser um número." }).nonnegative("Preço não pode ser negativo."),
  image_url: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  specs: z.record(z.string(), z.unknown()).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "peripherals_read")) {
    return NextResponse.json({ error: "Sem permissão para ler periféricos." }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const category = searchParams.get("category")
  const search = searchParams.get("search")
  const columns = searchParams.get("columns") || DEFAULT_COLUMNS

  const db = createSupabaseAdminClient()
  let query = db.from("peripherals").select(columns).order("created_at", { ascending: false })

  if (category) query = query.eq("category", category as any)
  if (search) query = query.ilike("name", `%${search}%`)

  const { data, error } = await query
  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao listar periféricos.")
    return NextResponse.json(body, { status })
  }

  return NextResponse.json({ peripherals: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "peripherals_write")) {
    return NextResponse.json({ error: "Sem permissão para criar periféricos." }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido (JSON malformado)." }, { status: 400 })
  }

  const parsed = peripheralPayload.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      { error: first?.message ?? "Dados inválidos.", field: first?.path[0] as string | undefined },
      { status: 400 }
    )
  }

  const db = createSupabaseAdminClient()
  const { data, error } = await (db.from("peripherals") as any)
    .insert([parsed.data])
    .select(DEFAULT_COLUMNS)
    .single()

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao criar periférico.")
    return NextResponse.json(body, { status })
  }

  const newRanking = getRankingFromSpecs((parsed.data.specs ?? {}) as Record<string, unknown>)
  if (newRanking !== null && data) {
    await cascadeRerank(db, parsed.data.category, data.id, null, newRanking)
  }

  return NextResponse.json({ peripheral: data })
}
