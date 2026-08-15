import "server-only"

import { reviewCategoryKeyFor, REVIEW_CATEGORY_GROUPS } from "@/lib/peripheral-review-categories"
import type { ShowcaseReview, ShowcaseReviewCategoryBlock } from "@/lib/profile-showcase"
import { creditPeripheralReviewCreationAura } from "@/lib/server/repositories/aura-repository"
import {
  PERIPHERAL_SHOWCASE_COLUMNS,
  toShowcasePeripheral,
  type PeripheralShowcaseRow,
} from "@/lib/server/repositories/peripheral-showcase-mapping"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório de mini reviews de periférico — única porta de acesso à tabela
 * `peripheral_reviews` (Parte 1: criação a partir do perfil, "Meus Reviews").
 * Como é 1 review ativa por `(user, peripheral)` (constraint `unique`), não
 * há RPC de upsert: um insert/update simples basta, com a unique-violation
 * (`23505`) tratada aqui. Sem relação com `peripheral-comments-repository.ts`
 * (discussão) nem com o vote box "BOM OU BAGRE" atual — isso é Parte 2.
 */

const REVIEW_COLUMNS = `id, peripheral_id, user_id, rating, body, created_at, edited_at, is_edited, peripherals ( ${PERIPHERAL_SHOWCASE_COLUMNS} )`

const UNIQUE_VIOLATION = "23505"

type ReviewRow = {
  id: string
  peripheral_id: string
  user_id: string
  rating: number
  body: string | null
  created_at: string
  edited_at: string | null
  is_edited: boolean
  peripherals: PeripheralShowcaseRow | PeripheralShowcaseRow[] | null
}

function toShowcaseReview(row: ReviewRow): ShowcaseReview | null {
  const peripheralRow = Array.isArray(row.peripherals) ? row.peripherals[0] : row.peripherals
  if (!peripheralRow) return null
  return {
    id: row.id,
    rating: row.rating,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    peripheral: toShowcasePeripheral(peripheralRow),
  }
}

export type ReviewRepositoryResult =
  | { ok: true; review: ShowcaseReview }
  | { ok: false; error: string; status: number }

/** Cria a review do usuário atual pra um periférico. Falha se ele já avaliou esse periférico (unique). */
export async function addPeripheralReview(params: {
  peripheralId: string
  userId: string
  rating: number
  body: string | null
}): Promise<ReviewRepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: peripheral } = await db
    .from("peripherals")
    .select("id, category")
    .eq("id", params.peripheralId)
    .maybeSingle()
  if (!peripheral) return { ok: false, error: "Periférico não encontrado.", status: 404 }
  if (!reviewCategoryKeyFor(peripheral.category)) {
    return { ok: false, error: "Este tipo de periférico ainda não pode ser avaliado.", status: 400 }
  }

  const { data, error } = await db
    .from("peripheral_reviews")
    .insert({
      peripheral_id: params.peripheralId,
      user_id: params.userId,
      rating: params.rating,
      body: params.body,
      is_hidden: false,
    })
    .select(REVIEW_COLUMNS)
    .single()

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "Você já avaliou este periférico.", status: 409 }
    }
    console.error("[peripheral-reviews-repository] addPeripheralReview:", error)
    return { ok: false, error: "Erro ao salvar sua avaliação.", status: 400 }
  }

  const review = toShowcaseReview(data as unknown as ReviewRow)
  if (!review) return { ok: false, error: "Erro ao salvar sua avaliação.", status: 400 }

  // +10 de aura por avaliar, 1x por periférico pra sempre — best-effort, nunca bloqueia a criação em si.
  await creditPeripheralReviewCreationAura(params.userId, params.peripheralId, review.id)

  return { ok: true, review }
}

/** Edita a review do próprio usuário pra um periférico. Sem janela de tempo (editável sempre); nunca credita aura de novo. */
export async function updateOwnPeripheralReview(params: {
  peripheralId: string
  userId: string
  rating?: number
  body?: string | null
}): Promise<ReviewRepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("peripheral_reviews")
    .select("id, user_id")
    .eq("peripheral_id", params.peripheralId)
    .eq("user_id", params.userId)
    .maybeSingle()
  if (!existing) return { ok: false, error: "Avaliação não encontrada.", status: 404 }

  const { data, error } = await db
    .from("peripheral_reviews")
    .update({
      ...(params.rating !== undefined ? { rating: params.rating } : {}),
      ...(params.body !== undefined ? { body: params.body } : {}),
      edited_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .select(REVIEW_COLUMNS)
    .single()

  if (error) {
    console.error("[peripheral-reviews-repository] updateOwnPeripheralReview:", error)
    return { ok: false, error: "Erro ao salvar sua avaliação.", status: 400 }
  }

  const review = toShowcaseReview(data as unknown as ReviewRow)
  if (!review) return { ok: false, error: "Erro ao salvar sua avaliação.", status: 400 }

  return { ok: true, review }
}

export type RepositoryResult = { ok: true } | { ok: false; error: string; status: number }

/** Exclui (hard delete) a review do próprio usuário pra um periférico — libera o slot único pra uma nova avaliação futura. */
export async function deleteOwnPeripheralReview(params: {
  peripheralId: string
  userId: string
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("peripheral_reviews")
    .select("id")
    .eq("peripheral_id", params.peripheralId)
    .eq("user_id", params.userId)
    .maybeSingle()
  if (!existing) return { ok: false, error: "Avaliação não encontrada.", status: 404 }

  const { error } = await db.from("peripheral_reviews").delete().eq("id", existing.id)
  if (error) {
    console.error("[peripheral-reviews-repository] deleteOwnPeripheralReview:", error)
    return { ok: false, error: "Erro ao excluir sua avaliação.", status: 400 }
  }

  return { ok: true }
}

/**
 * Reviews do usuário agrupadas por categoria, na ordem fixa de
 * `REVIEW_CATEGORY_GROUPS` — só blocos com pelo menos 1 review. `limitPerCategory`
 * capa cada bloco (mini-vitrine do perfil); omitido, devolve tudo (página completa).
 */
export async function getUserReviewsByCategory(
  userId: string,
  opts?: { limitPerCategory?: number }
): Promise<ShowcaseReviewCategoryBlock[]> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db
    .from("peripheral_reviews")
    .select(REVIEW_COLUMNS)
    .eq("user_id", userId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[peripheral-reviews-repository] getUserReviewsByCategory:", error)
    return []
  }

  const reviews = ((data ?? []) as unknown as ReviewRow[])
    .map(toShowcaseReview)
    .filter((r): r is ShowcaseReview => r !== null)

  const byKey = new Map<string, ShowcaseReview[]>()
  for (const review of reviews) {
    const key = reviewCategoryKeyFor(review.peripheral.category)
    if (!key) continue
    const bucket = byKey.get(key) ?? []
    bucket.push(review)
    byKey.set(key, bucket)
  }

  return REVIEW_CATEGORY_GROUPS.flatMap((group) => {
    const bucket = byKey.get(group.key)
    if (!bucket || bucket.length === 0) return []
    const reviews = opts?.limitPerCategory ? bucket.slice(0, opts.limitPerCategory) : bucket
    return [{ key: group.key, label: group.label, reviews }]
  })
}

/** Quantidade total de reviews visíveis do usuário — pro contador de "Meus Reviews". */
export async function countUserReviews(userId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count } = await db
    .from("peripheral_reviews")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_hidden", false)
  return count ?? 0
}

/** Ids de todos os periféricos já avaliados pelo usuário, sem cap — filtro `excludeIds` do picker de criação. */
export async function getReviewedPeripheralIds(userId: string): Promise<string[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("peripheral_reviews")
    .select("peripheral_id")
    .eq("user_id", userId)
    .eq("is_hidden", false)

  if (error) {
    console.error("[peripheral-reviews-repository] getReviewedPeripheralIds:", error)
    return []
  }
  return (data ?? []).map((r) => (r as { peripheral_id: string }).peripheral_id)
}
