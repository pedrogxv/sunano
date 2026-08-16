import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { ALLOWED_PERIPHERAL_CATEGORIES, ALLOWED_PERIPHERAL_TIERS, dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { cascadeRerank, getRankingFromSpecs } from "@/lib/server/peripherals/ranking-cascade"
import { sanitizeTagsForCategory, type Category } from "@/lib/tag-options"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DEFAULT_COLUMNS =
  "id, name, brand_id, brands(name), category, tier, price, image_url, tags, specs, created_at, weight_g, connectivity, mouse_shape, keyboard_layout, surface, profile, panel_type, refresh_rate, tier_rank"
const ALLOWED_COLUMNS = new Set(DEFAULT_COLUMNS.split(",").map((c) => c.trim()))

/** Restringe `columns` a uma allowlist — evita que o parâmetro vindo da query
 *  string monte uma cláusula `select` arbitrária (colunas fora do schema
 *  esperado ou embeds de outras tabelas via sintaxe do PostgREST). */
function sanitizeColumns(raw: string | null): string {
  if (!raw) return DEFAULT_COLUMNS
  const requested = raw.split(",").map((c) => c.trim()).filter(Boolean)
  const safe = requested.filter((c) => ALLOWED_COLUMNS.has(c))
  return safe.length > 0 ? safe.join(", ") : DEFAULT_COLUMNS
}

const peripheralPayload = z.object({
  name: z.string().min(1, "Nome é obrigatório.").max(200, "Nome muito longo (máx. 200 caracteres)."),
  brand_id: z.string().uuid("Selecione uma marca válida."),
  category: z.enum(ALLOWED_PERIPHERAL_CATEGORIES, {
    message: `Categoria inválida. Use uma das opções: ${ALLOWED_PERIPHERAL_CATEGORIES.join(", ")}.`,
  }),
  tier: z.union([z.enum(ALLOWED_PERIPHERAL_TIERS), z.null()]).optional(),
  price: z.number({ message: "Preço deve ser um número." }).nonnegative("Preço não pode ser negativo."),
  image_url: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  specs: z.record(z.string(), z.unknown()).optional(),
  weight_g: z.number().int().positive().nullable().optional(),
  connectivity: z.string().max(50).nullable().optional(),
  mouse_shape: z.string().max(50).nullable().optional(),
  keyboard_layout: z.string().max(50).nullable().optional(),
  surface: z.string().max(50).nullable().optional(),
  profile: z.string().max(50).nullable().optional(),
  panel_type: z.string().max(50).nullable().optional(),
  refresh_rate: z.number().int().positive().nullable().optional(),
  tier_rank: z.number().int().min(0).max(99).nullable().optional(),
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
  const columns = sanitizeColumns(searchParams.get("columns"))

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

  // Sanitiza tags mesmo na criação: um payload montado fora do formulário de admin
  // (ou um front desatualizado) pode enviar uma tag que já saiu da config da categoria.
  const insertData = {
    ...parsed.data,
    tags: sanitizeTagsForCategory(parsed.data.category as Category, parsed.data.tags),
  }

  const db = createSupabaseAdminClient()
  const { data, error } = await (db.from("peripherals") as any)
    .insert([insertData])
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
