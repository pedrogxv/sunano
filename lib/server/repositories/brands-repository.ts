import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório de marcas de periféricos (`brands`). Fonte da verdade para o
 * campo `peripherals.brand_id` — substitui o antigo array hardcoded
 * `BRAND_OPTIONS` que existia só como sugestão de autocomplete.
 */

const COLUMNS = "id, name, created_at, updated_at"

export type Brand = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

type BrandResult = { ok: true; brand: Brand } | { ok: false; error: string; status: number }

function toBrand(row: { id: string; name: string; created_at: string; updated_at: string }): Brand {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505"
}

/** Todas as marcas, ordenadas por nome — usadas no CRUD admin e no combobox do form de periférico. */
export async function listBrands(): Promise<Brand[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("brands").select(COLUMNS).order("name", { ascending: true })

  if (error) {
    console.error("[brands-repository] listBrands:", error)
    throw error
  }
  return (data ?? []).map(toBrand)
}

export async function createBrand(name: string): Promise<BrandResult> {
  const trimmed = name.trim()
  const db = createSupabaseAdminClient()

  const { data, error } = await db.from("brands").insert({ name: trimmed }).select(COLUMNS).single()

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "Já existe uma marca com este nome.", status: 409 }
    }
    console.error("[brands-repository] createBrand:", error)
    return { ok: false, error: error.message, status: 400 }
  }
  return { ok: true, brand: toBrand(data) }
}

export async function updateBrand(id: string, name: string): Promise<BrandResult> {
  const trimmed = name.trim()
  const db = createSupabaseAdminClient()

  const { data, error } = await db.from("brands").update({ name: trimmed }).eq("id", id).select(COLUMNS).maybeSingle()

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "Já existe uma marca com este nome.", status: 409 }
    }
    console.error("[brands-repository] updateBrand:", error)
    return { ok: false, error: error.message, status: 400 }
  }
  if (!data) return { ok: false, error: "Marca não encontrada.", status: 404 }
  return { ok: true, brand: toBrand(data) }
}

/**
 * Exclui uma marca. Bloqueia se houver periféricos vinculados — evita deixar
 * o `on delete restrict` do banco estourar como erro cru e permite informar
 * quantos periféricos dependem da marca.
 */
export async function deleteBrand(id: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const db = createSupabaseAdminClient()

  const { count } = await db
    .from("peripherals")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", id)

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Não é possível excluir: ${count} periférico(s) usam esta marca.`,
      status: 409,
    }
  }

  const { error } = await db.from("brands").delete().eq("id", id)
  if (error) {
    console.error("[brands-repository] deleteBrand:", error)
    return { ok: false, error: error.message, status: 400 }
  }
  return { ok: true }
}
