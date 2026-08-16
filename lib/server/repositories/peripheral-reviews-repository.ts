import "server-only"

import type { AccountTier } from "@/lib/account-tier"
import { reviewCategoryKeyFor, REVIEW_CATEGORY_GROUPS } from "@/lib/peripheral-review-categories"
import type { ShowcaseReview, ShowcaseReviewCategoryBlock } from "@/lib/profile-showcase"
import { creditPeripheralReviewCreationAura } from "@/lib/server/repositories/aura-repository"
import {
  PERIPHERAL_SHOWCASE_COLUMNS,
  toShowcasePeripheral,
  type PeripheralShowcaseRow,
} from "@/lib/server/repositories/peripheral-showcase-mapping"
import { buildProfileMap } from "@/lib/server/repositories/profile-enrichment"
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

/** Review de um periférico já enriquecida com dados do autor — pra lista de reviews da página do periférico (Parte 2). */
export type PeripheralReviewDetail = {
  id: string
  rating: number
  body: string | null
  created_at: string
  edited_at: string | null
  is_edited: boolean
  user_id: string
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  author_display_slug: string | null
  author_streak: number
}

export type PeripheralReviewStats = {
  reviews: PeripheralReviewDetail[]
  /** Média das notas (1 casa decimal) de todos os reviews visíveis, ou `null` se não houver nenhum. */
  average: number | null
  totalCount: number
  hasMore: boolean
}

export const PERIPHERAL_REVIEWS_PAGE_SIZE = 4

/**
 * Reviews visíveis de um periférico + média/contagem, ordenadas por Aura do
 * autor (desc, empate por mais recente). PostgREST não ordena por coluna de
 * tabela relacionada, então a ordenação é feita em duas etapas: busca todas
 * as linhas (colunas mínimas) + saldo de Aura de cada autor, ordena em JS, aí
 * sim busca os dados completos só da página pedida — mesma estratégia de
 * `getTopAuraProfiles` (users-repository.ts).
 */
export async function getPeripheralReviewsWithStats(
  peripheralId: string,
  { page = 1, limit = PERIPHERAL_REVIEWS_PAGE_SIZE }: { page?: number; limit?: number } = {}
): Promise<PeripheralReviewStats> {
  const db = createSupabaseAdminClient()

  const { data: allRows, error } = await db
    .from("peripheral_reviews")
    .select("id, user_id, rating, created_at")
    .eq("peripheral_id", peripheralId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    // Defesa contra periférico com volume anormal de reviews — a ordenação
    // por Aura do autor só é possível em memória (ver comentário da função),
    // então precisa de todas as linhas da página de ranking, mas não precisa
    // de mais que isso.
    .limit(2000)

  if (error) {
    console.error("[peripheral-reviews-repository] getPeripheralReviewsWithStats:", error)
    return { reviews: [], average: null, totalCount: 0, hasMore: false }
  }

  const rows = (allRows ?? []) as Array<{ id: string; user_id: string; rating: number; created_at: string }>
  const totalCount = rows.length
  if (totalCount === 0) {
    return { reviews: [], average: null, totalCount: 0, hasMore: false }
  }

  const average = Math.round((rows.reduce((sum, r) => sum + r.rating, 0) / totalCount) * 10) / 10

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: wallets } = await db.from("user_aura_wallet").select("user_id, balance").in("user_id", userIds)
  const auraByUser = new Map(
    ((wallets ?? []) as Array<{ user_id: string; balance: number }>).map((w) => [w.user_id, w.balance])
  )

  const sorted = [...rows].sort((a, b) => {
    const auraDiff = (auraByUser.get(b.user_id) ?? 0) - (auraByUser.get(a.user_id) ?? 0)
    if (auraDiff !== 0) return auraDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const from = (page - 1) * limit
  const pageIds = sorted.slice(from, from + limit).map((r) => r.id)
  const hasMore = from + limit < totalCount

  if (pageIds.length === 0) {
    return { reviews: [], average, totalCount, hasMore: false }
  }

  const { data: pageRows, error: pageError } = await db
    .from("peripheral_reviews")
    .select("id, user_id, rating, body, created_at, edited_at, is_edited")
    .in("id", pageIds)

  if (pageError) {
    console.error("[peripheral-reviews-repository] getPeripheralReviewsWithStats (page):", pageError)
    return { reviews: [], average, totalCount, hasMore }
  }

  type PageRow = {
    id: string
    user_id: string
    rating: number
    body: string | null
    created_at: string
    edited_at: string | null
    is_edited: boolean
  }
  const rowById = new Map(((pageRows ?? []) as PageRow[]).map((r) => [r.id, r]))
  const profileMap = await buildProfileMap(pageIds.map((id) => rowById.get(id)?.user_id ?? null))

  const reviews = pageIds
    .map((id) => rowById.get(id))
    .filter((r): r is PageRow => Boolean(r))
    .map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      created_at: r.created_at,
      edited_at: r.edited_at,
      is_edited: r.is_edited ?? false,
      user_id: r.user_id,
      author_display_name: profileMap[r.user_id]?.display_name ?? "Usuário",
      author_avatar_url: profileMap[r.user_id]?.avatar_url ?? null,
      author_account_tier: profileMap[r.user_id]?.account_tier ?? "common",
      author_display_slug: profileMap[r.user_id]?.display_slug ?? null,
      author_streak: profileMap[r.user_id]?.streak ?? 0,
    }))

  return { reviews, average, totalCount, hasMore }
}
