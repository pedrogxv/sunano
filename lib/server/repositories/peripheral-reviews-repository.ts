import "server-only"

import { cache } from "react"

import type { AccountTier } from "@/lib/account-tier"
import { reviewCategoryKeyFor, REVIEW_CATEGORY_GROUPS } from "@/lib/peripheral-review-categories"
import {
  EMPTY_RATING_DISTRIBUTION,
  normalizeReviewSearch,
  POSITIVE_REVIEW_MIN_RATING,
  ratingBucketOf,
  type RatingBucket,
  type RatingDistribution,
  type ReviewListOrder,
} from "@/lib/peripheral-review-list"
import type {
  PeripheralReviewSummary,
  ShowcaseReview,
  ShowcaseReviewCategoryBlock,
} from "@/lib/profile-showcase"
import { creditPeripheralReviewCreationAura } from "@/lib/server/repositories/aura-repository"
import {
  NO_PERIPHERAL_REVIEWS,
  PERIPHERAL_SHOWCASE_COLUMNS,
  toShowcasePeripheral,
  type PeripheralShowcaseRow,
} from "@/lib/server/repositories/peripheral-showcase-mapping"
import { escapeLikePattern, isUuid, onlyUuids } from "@/lib/server/repositories/_shared"
import {
  authorFrameFields,
  buildProfileMap,
  type AuthorFrameFields,
  type EnrichedProfile,
} from "@/lib/server/repositories/profile-enrichment"
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

function toShowcaseReview(
  row: ReviewRow,
  stats: Map<string, PeripheralReviewSummary>
): ShowcaseReview | null {
  const peripheralRow = Array.isArray(row.peripherals) ? row.peripherals[0] : row.peripherals
  if (!peripheralRow) return null
  return {
    id: row.id,
    rating: row.rating,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    peripheral: toShowcasePeripheral(
      peripheralRow,
      stats.get(peripheralRow.id) ?? NO_PERIPHERAL_REVIEWS
    ),
  }
}

export type ReviewRepositoryResult =
  | { ok: true; review: ShowcaseReview }
  | { ok: false; error: string; status: number; code?: "integrity_required" }

/**
 * Cria a review do usuário atual pra um periférico. Falha se ele já avaliou esse periférico (unique).
 *
 * Exige o termo de integridade aceito. Antes só o formulário conferia, e um
 * POST direto na rota criava a review (e levava a Aura) sem o aceite que a
 * moderação usa como base para remover review de quem nunca usou o produto.
 */
export async function addPeripheralReview(params: {
  peripheralId: string
  userId: string
  rating: number
  body: string | null
}): Promise<ReviewRepositoryResult> {
  if (!isUuid(params.peripheralId)) return { ok: false, error: "Periférico não encontrado.", status: 404 }

  const db = createSupabaseAdminClient()

  const [{ data: peripheral }, { data: author }] = await Promise.all([
    db.from("peripherals").select("id, category").eq("id", params.peripheralId).maybeSingle(),
    db.from("user_profiles").select("reviews_integrity_accepted_at").eq("id", params.userId).maybeSingle(),
  ])
  if (!peripheral) return { ok: false, error: "Periférico não encontrado.", status: 404 }
  if (!reviewCategoryKeyFor(peripheral.category)) {
    return { ok: false, error: "Este tipo de periférico ainda não pode ser avaliado.", status: 400 }
  }
  if (!(author as { reviews_integrity_accepted_at: string | null } | null)?.reviews_integrity_accepted_at) {
    return {
      ok: false,
      error: "Aceite o termo de integridade antes de avaliar.",
      status: 403,
      code: "integrity_required",
    }
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

  const review = toShowcaseReview(
    data as unknown as ReviewRow,
    await getPeripheralReviewSummaries([params.peripheralId])
  )
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

  const review = toShowcaseReview(
    data as unknown as ReviewRow,
    await getPeripheralReviewSummaries([params.peripheralId])
  )
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

  const rows = (data ?? []) as unknown as ReviewRow[]
  const stats = await getPeripheralReviewSummaries(rows.map((r) => r.peripheral_id))

  const reviews = rows
    .map((row) => toShowcaseReview(row, stats))
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

/**
 * Contagem e média das reviews visíveis de VÁRIOS periféricos, de uma vez.
 *
 * É o que alimenta `ShowcasePeripheral.reviews` (card de setup, favoritos e
 * "Meus Reviews"). Em lote sempre: a vitrine desenha até 19 cards de uma vez
 * e uma consulta por card seria N+1, o mesmo motivo de
 * `getVipFounderOwners`.
 *
 * Traz as notas cruas e agrega em JS em vez de pedir `avg()` ao PostgREST:
 * são poucas dezenas de ids por perfil, e o embed agregado depende de
 * configuração do servidor (`db-aggregates-enabled`) que o resto do
 * repositório não assume.
 */
export async function getPeripheralReviewSummaries(
  peripheralIds: string[]
): Promise<Map<string, PeripheralReviewSummary>> {
  const ids = Array.from(new Set(peripheralIds.filter(Boolean)))
  const stats = new Map<string, PeripheralReviewSummary>()
  if (ids.length === 0) return stats

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("peripheral_reviews")
    .select("peripheral_id, rating")
    .in("peripheral_id", ids)
    .eq("is_hidden", false)

  if (error) {
    // Seção sem contagem é melhor do que perfil quebrado — mesmo critério do
    // resto da vitrine.
    console.error("[peripheral-reviews-repository] getPeripheralReviewSummaries:", error)
    return stats
  }

  const totals = new Map<string, { count: number; sum: number }>()
  for (const row of (data ?? []) as { peripheral_id: string; rating: number }[]) {
    const acc = totals.get(row.peripheral_id) ?? { count: 0, sum: 0 }
    acc.count += 1
    acc.sum += row.rating
    totals.set(row.peripheral_id, acc)
  }

  for (const [peripheralId, acc] of totals) {
    stats.set(peripheralId, {
      count: acc.count,
      average: acc.count > 0 ? acc.sum / acc.count : null,
    })
  }

  return stats
}

/**
 * Só quantas reviews visíveis um periférico tem.
 *
 * `head: true` — o total vem no header, sem trazer linha nenhuma. Existe
 * separado de `getPeripheralReviewsWithStats` (que carrega até 2000 linhas
 * para poder ordenar por Aura em memória) porque o `generateMetadata` da ficha
 * só precisa do número, para decidir indexabilidade. `cache` do React
 * deduplica com a chamada do corpo da página na mesma requisição.
 */
export const countPeripheralReviews = cache(async (peripheralId: string): Promise<number> => {
  const db = createSupabaseAdminClient()
  const { count } = await db
    .from("peripheral_reviews")
    .select("id", { count: "exact", head: true })
    .eq("peripheral_id", peripheralId)
    .eq("is_hidden", false)
  return count ?? 0
})

/**
 * Nota que o usuário deu a cada periférico que avaliou (`id → 1.0-5.0`).
 *
 * É a mesma consulta de `getReviewedPeripheralIds` com a coluna da nota
 * junto: o perfil precisa das duas coisas (ids para o picker, notas para a
 * estrela dos cards de setup/favoritos) e buscar em separado seria a mesma
 * varredura duas vezes.
 */
export async function getUserRatingsByPeripheral(
  userId: string
): Promise<Record<string, number>> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("peripheral_reviews")
    .select("peripheral_id, rating")
    .eq("user_id", userId)
    .eq("is_hidden", false)

  if (error) {
    console.error("[peripheral-reviews-repository] getUserRatingsByPeripheral:", error)
    return {}
  }

  const ratings: Record<string, number> = {}
  for (const row of (data ?? []) as { peripheral_id: string; rating: number }[]) {
    ratings[row.peripheral_id] = row.rating
  }
  return ratings
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
  author_vip_expires_at: string | null
  author_display_slug: string | null
  author_streak: number
  /** Upvotes - downvotes, estilo Reddit (`peripheral_review_votes`). */
  score: number
  /** Voto do usuário autenticado atual nesta review, ou `null` se não votou (ou anônimo). */
  my_vote: "like" | "dislike" | null
} & AuthorFrameFields

/**
 * As duas reviews que a comunidade mais marcou como úteis de cada lado: uma
 * que aprova (nota >= `POSITIVE_REVIEW_MIN_RATING`) e uma crítica. Só sai com
 * os DOIS lados: o valor do bloco é o contraste, e uma só repetiria o topo de
 * "Mais úteis".
 */
export type PeripheralReviewSpotlight = {
  positive: PeripheralReviewDetail
  critical: PeripheralReviewDetail
}

export type PeripheralReviewStats = {
  reviews: PeripheralReviewDetail[]
  /** Média das notas (1 casa decimal) de todos os reviews visíveis, ou `null` se não houver nenhum. */
  average: number | null
  /** Todas as reviews visíveis do periférico, sem filtro. */
  totalCount: number
  /**
   * Quantas casam com o filtro de nota/busca: é sobre esta lista que a
   * paginação anda. Sem filtro, igual a `totalCount`.
   */
  matchCount: number
  /** Reviews por faixa de estrelas (`ratingBucketOf`), sem filtro. */
  distribution: RatingDistribution
  /** Reviews com nota >= `POSITIVE_REVIEW_MIN_RATING`, sem filtro. */
  positiveCount: number
  hasMore: boolean
  /** Só quando pedido (`includeSpotlight`) e o periférico tem volume para isso. */
  spotlight: PeripheralReviewSpotlight | null
}

const REVIEW_DETAIL_COLUMNS = "id, user_id, rating, body, created_at, edited_at, is_edited, score"

type ReviewDetailRow = {
  id: string
  user_id: string
  rating: number
  body: string | null
  created_at: string
  edited_at: string | null
  is_edited: boolean
  score: number
}

/**
 * Linha + perfil enriquecido → `PeripheralReviewDetail`. Um mapper só para a
 * lista, a review avulsa (link compartilhado) e a review do próprio visitante:
 * eram três cópias, e campo novo de autor (moldura, recorde) chegava a uma e
 * não às outras.
 */
function toReviewDetail(
  row: ReviewDetailRow,
  profile: EnrichedProfile | undefined,
  myVote: "like" | "dislike" | null
): PeripheralReviewDetail {
  return {
    id: row.id,
    rating: Number(row.rating),
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
    is_edited: row.is_edited ?? false,
    user_id: row.user_id,
    author_display_name: profile?.display_name ?? "Usuário",
    author_avatar_url: profile?.avatar_url ?? null,
    author_account_tier: profile?.account_tier ?? "common",
    author_vip_expires_at: profile?.vip_expires_at ?? null,
    author_display_slug: profile?.display_slug ?? null,
    ...authorFrameFields(profile),
    author_streak: profile?.streak ?? 0,
    score: row.score ?? 0,
    my_vote: myVote,
  }
}

/**
 * Uma review pontual (por id), já enriquecida com dados do autor — usada para
 * abrir a lista direto numa review específica (link "Meus Reviews" do perfil,
 * botão "Copiar link") sem depender de em qual página ela cairia.
 *
 * `peripheralId` amarra a review ao periférico da URL: sem ele,
 * `/perifericos/A#review-<review do B>` desenhava a review do produto B na
 * página do A, como se fosse sobre ele.
 */
export async function getPeripheralReviewById(
  reviewId: string,
  viewerId: string | null | undefined,
  peripheralId: string
): Promise<PeripheralReviewDetail | null> {
  // Os dois vêm crus da URL; sem a checagem o Postgres recusa o cast (22P02)
  // e cada link malformado vira erro no log.
  if (!isUuid(reviewId) || !isUuid(peripheralId)) return null

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("peripheral_reviews")
    .select(REVIEW_DETAIL_COLUMNS)
    .eq("id", reviewId)
    .eq("peripheral_id", peripheralId)
    .eq("is_hidden", false)
    .maybeSingle()

  if (error || !data) return null

  const row = data as ReviewDetailRow
  const [profileMap, myVote] = await Promise.all([
    buildProfileMap([row.user_id]),
    getOwnPeripheralReviewVote(db, viewerId, [row.id]),
  ])

  return toReviewDetail(row, profileMap[row.user_id], myVote.get(row.id) ?? null)
}

/** Votos (like/dislike) do usuário atual num conjunto de reviews — vazio (sem query) se `viewerId` for nulo (visitante anônimo). */
async function getOwnPeripheralReviewVote(
  db: ReturnType<typeof createSupabaseAdminClient>,
  viewerId: string | null | undefined,
  reviewIds: string[]
): Promise<Map<string, "like" | "dislike">> {
  const votes = new Map<string, "like" | "dislike">()
  if (!viewerId || reviewIds.length === 0) return votes

  const { data } = await db
    .from("peripheral_review_votes")
    .select("review_id, kind")
    .eq("voter_id", viewerId)
    .in("review_id", reviewIds)

  for (const row of (data ?? []) as Array<{ review_id: string; kind: "like" | "dislike" }>) {
    votes.set(row.review_id, row.kind)
  }
  return votes
}

/**
 * O que a página de reviews precisa saber do visitante logado, numa chamada.
 *
 * A página é ISR (o HTML é o mesmo para todo mundo), então os votos do HTML
 * saem sempre `null`. Sem isto, quem já tinha votado via a seta apagada,
 * clicava de novo achando que estava votando, e o toggle do servidor REMOVIA
 * o voto: a tela mostrava +1 e voltava ao número anterior.
 */
export type PeripheralReviewViewerState = {
  /** Voto do visitante em cada review pedida (só as que ele votou). */
  votes: Record<string, "like" | "dislike">
  /**
   * A review do visitante neste periférico, se existir. Vem mesmo quando
   * oculta pela moderação (`hidden`), para a tela explicar por que não há
   * botão de avaliar: o slot único `(user, peripheral)` já está ocupado.
   */
  myReview: (PeripheralReviewDetail & { hidden: boolean }) | null
  /** Já aceitou o termo de integridade (pré-requisito de criar review). */
  integrityAccepted: boolean
}

export async function getPeripheralReviewViewerState(
  peripheralId: string,
  viewerId: string,
  reviewIds: string[]
): Promise<PeripheralReviewViewerState> {
  const empty: PeripheralReviewViewerState = { votes: {}, myReview: null, integrityAccepted: false }
  if (!isUuid(peripheralId)) return empty

  const db = createSupabaseAdminClient()
  const [votes, mine, profileRow, profileMap] = await Promise.all([
    getOwnPeripheralReviewVote(db, viewerId, onlyUuids(reviewIds, 100)),
    db
      .from("peripheral_reviews")
      .select(`${REVIEW_DETAIL_COLUMNS}, is_hidden`)
      .eq("peripheral_id", peripheralId)
      .eq("user_id", viewerId)
      .maybeSingle(),
    db.from("user_profiles").select("reviews_integrity_accepted_at").eq("id", viewerId).maybeSingle(),
    buildProfileMap([viewerId]),
  ])

  const mineRow = mine.data as (ReviewDetailRow & { is_hidden: boolean }) | null
  return {
    votes: Object.fromEntries(votes),
    myReview: mineRow
      ? { ...toReviewDetail(mineRow, profileMap[viewerId], null), hidden: Boolean(mineRow.is_hidden) }
      : null,
    integrityAccepted: Boolean(
      (profileRow.data as { reviews_integrity_accepted_at: string | null } | null)?.reviews_integrity_accepted_at
    ),
  }
}

export type ToggleReviewVoteResult =
  | { ok: true; reaction: "like" | "dislike" | null; score: number }
  | { ok: false; error: string; status: number }

/**
 * Dá, troca ou remove (toggle) o upvote/downvote do usuário atual numa review — estilo Reddit, mutuamente exclusivo.
 *
 * Autor não vota na própria review. A RPC não barra isso, e o voto do autor
 * inflava o "Mais úteis" e o destaque positiva × crítica, que ordenam por
 * score. A checagem mora aqui, não na rota: é o repositório que fala com a
 * RPC, e a próxima rota que votar herdaria o furo.
 */
export async function togglePeripheralReviewVote(
  voterId: string,
  reviewId: string,
  kind: "like" | "dislike",
  peripheralId: string
): Promise<ToggleReviewVoteResult> {
  if (!isUuid(reviewId) || !isUuid(peripheralId)) {
    return { ok: false, error: "Review não encontrada.", status: 404 }
  }

  const db = createSupabaseAdminClient()

  const { data: target } = await db
    .from("peripheral_reviews")
    .select("user_id, peripheral_id")
    .eq("id", reviewId)
    .eq("is_hidden", false)
    .maybeSingle()
  const targetRow = target as { user_id: string; peripheral_id: string } | null
  if (!targetRow || targetRow.peripheral_id !== peripheralId) {
    return { ok: false, error: "Review não encontrada.", status: 404 }
  }
  if (targetRow.user_id === voterId) {
    return { ok: false, error: "Você não pode votar na sua própria review.", status: 403 }
  }

  const { data, error } = await db.rpc("toggle_peripheral_review_vote", {
    p_voter_id: voterId,
    p_review_id: reviewId,
    p_kind: kind,
  })

  if (error) {
    if (error.message?.includes("target not found")) {
      return { ok: false, error: "Review não encontrada.", status: 404 }
    }
    console.error("[peripheral-reviews-repository] togglePeripheralReviewVote:", error)
    return { ok: false, error: "Erro ao votar.", status: 400 }
  }

  const result = data?.[0]
  if (!result) {
    return { ok: false, error: "Erro ao votar.", status: 400 }
  }
  return { ok: true, reaction: result.reaction as "like" | "dislike" | null, score: result.score }
}

export const PERIPHERAL_REVIEWS_PAGE_SIZE = 4

/** Abaixo disto o destaque positiva × crítica não aparece: com poucas reviews ele só repete a lista. */
const SPOTLIGHT_MIN_REVIEWS = 5

/**
 * Embaralhamento determinístico: mesma `seed` + mesmo conjunto de ids produz
 * sempre a mesma ordem, então a página 2 continua exatamente de onde a 1
 * parou. Hash simples (FNV-1a) do `seed + id` como chave de ordenação.
 */
function seededShuffle<T extends { id: string }>(rows: T[], seed: string): T[] {
  const hash = (value: string) => {
    let h = 0x811c9dc5
    for (let i = 0; i < value.length; i += 1) {
      h ^= value.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h
  }
  return [...rows]
    .map((row) => ({ row, key: hash(`${seed}:${row.id}`) }))
    .sort((a, b) => a.key - b.key || a.row.id.localeCompare(b.row.id))
    .map((entry) => entry.row)
}

type ReviewIndexRow = { id: string; user_id: string; rating: number; created_at: string; score: number }

const byRecent = (a: ReviewIndexRow, b: ReviewIndexRow) => Date.parse(b.created_at) - Date.parse(a.created_at)
const byScore = (a: ReviewIndexRow, b: ReviewIndexRow) => (b.score ?? 0) - (a.score ?? 0)

/** A mais votada como útil de um lado, ou `null` se ninguém a marcou (score <= 0 não é "mais útil"). */
function mostHelpful(rows: ReviewIndexRow[]): ReviewIndexRow | null {
  const best = rows.filter((r) => (r.score ?? 0) > 0).sort((a, b) => byScore(a, b) || byRecent(a, b))[0]
  return best ?? null
}

function emptyStats(): PeripheralReviewStats {
  return {
    reviews: [],
    average: null,
    totalCount: 0,
    matchCount: 0,
    distribution: { ...EMPTY_RATING_DISTRIBUTION },
    positiveCount: 0,
    hasMore: false,
    spotlight: null,
  }
}

/**
 * Reviews visíveis de um periférico + média/contagem/distribuição, numa das
 * ordens de `ReviewListOrder`, opcionalmente filtradas por faixa de estrelas
 * (`stars`) e por texto (`query`).
 *
 * PostgREST não ordena por coluna de tabela relacionada (Aura do autor), então
 * a ordenação é feita em duas etapas: busca o índice de todas as linhas
 * (colunas mínimas), ordena e filtra em JS, aí sim busca os dados completos só
 * da página pedida — mesma estratégia de `getTopAuraProfiles`
 * (users-repository.ts). Média e distribuição saem desse mesmo índice, então
 * o resumo da página não custa consulta a mais.
 *
 * As agregadas (`average`, `totalCount`, `distribution`) são SEMPRE do
 * periférico inteiro, nunca do filtro: o resumo continua o mesmo enquanto a
 * pessoa navega pelas faixas.
 */
export async function getPeripheralReviewsWithStats(
  peripheralId: string,
  {
    page = 1,
    limit = PERIPHERAL_REVIEWS_PAGE_SIZE,
    viewerId,
    order = "aura",
    seed,
    stars = null,
    query = null,
    includeSpotlight = false,
  }: {
    page?: number
    limit?: number
    viewerId?: string | null
    order?: ReviewListOrder
    seed?: string
    stars?: RatingBucket | null
    query?: string | null
    includeSpotlight?: boolean
  } = {}
): Promise<PeripheralReviewStats> {
  // O id vem cru do segmento da URL em `GET /api/peripherals/[id]/reviews`
  // (crawler, link antigo com slug). Sem esta checagem o Postgres recusa o
  // cast para uuid (22P02) e cada acesso vira um erro no log de produção.
  if (!isUuid(peripheralId)) return emptyStats()

  const db = createSupabaseAdminClient()
  const search = normalizeReviewSearch(query)

  const [indexResult, searchResult] = await Promise.all([
    db
      .from("peripheral_reviews")
      .select("id, user_id, rating, created_at, score")
      .eq("peripheral_id", peripheralId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      // Defesa contra periférico com volume anormal de reviews — a ordenação
      // por Aura do autor só é possível em memória (ver comentário da função),
      // então precisa de todas as linhas da página de ranking, mas não precisa
      // de mais que isso.
      .limit(2000),
    // `.ilike` grava UM parâmetro (sem a gramática do `.or()`), mas os
    // curingas continuam valendo: sem `escapeLikePattern`, buscar "_" ou "%"
    // casaria com todas as reviews.
    search
      ? db
          .from("peripheral_reviews")
          .select("id")
          .eq("peripheral_id", peripheralId)
          .eq("is_hidden", false)
          .ilike("body", `%${escapeLikePattern(search)}%`)
          .limit(2000)
      : Promise.resolve(null),
  ])

  if (indexResult.error) {
    console.error("[peripheral-reviews-repository] getPeripheralReviewsWithStats:", indexResult.error)
    return emptyStats()
  }
  if (searchResult?.error) {
    console.error("[peripheral-reviews-repository] getPeripheralReviewsWithStats (search):", searchResult.error)
  }

  // `numeric(2,1)` pode chegar como string do PostgREST; normaliza uma vez.
  const rows = ((indexResult.data ?? []) as ReviewIndexRow[]).map((r) => ({ ...r, rating: Number(r.rating) }))
  const totalCount = rows.length
  if (totalCount === 0) return emptyStats()

  const average = Math.round((rows.reduce((sum, r) => sum + r.rating, 0) / totalCount) * 10) / 10
  const distribution: RatingDistribution = { ...EMPTY_RATING_DISTRIBUTION }
  let positiveCount = 0
  for (const row of rows) {
    distribution[ratingBucketOf(row.rating)] += 1
    if (row.rating >= POSITIVE_REVIEW_MIN_RATING) positiveCount += 1
  }

  const searchIds = searchResult
    ? new Set(((searchResult.data ?? []) as Array<{ id: string }>).map((r) => r.id))
    : null
  const filtered = rows.filter(
    (r) => (stars === null || ratingBucketOf(r.rating) === stars) && (searchIds === null || searchIds.has(r.id))
  )
  const matchCount = filtered.length

  let sorted: ReviewIndexRow[]
  switch (order) {
    case "random":
      // Sem seed a ordem muda a cada request — só é seguro quando o chamador
      // pede uma página só (o carrossel sempre manda a sua).
      sorted = seededShuffle(filtered, seed ?? String(Date.now()))
      break
    case "helpful":
      sorted = [...filtered].sort((a, b) => byScore(a, b) || byRecent(a, b))
      break
    case "recent":
      sorted = [...filtered].sort(byRecent)
      break
    case "rating_desc":
      sorted = [...filtered].sort((a, b) => b.rating - a.rating || byScore(a, b) || byRecent(a, b))
      break
    case "rating_asc":
      sorted = [...filtered].sort((a, b) => a.rating - b.rating || byScore(a, b) || byRecent(a, b))
      break
    default: {
      const userIds = [...new Set(filtered.map((r) => r.user_id))]
      const { data: wallets } = userIds.length
        ? await db.from("user_aura_wallet").select("user_id, balance").in("user_id", userIds)
        : { data: [] }
      const auraByUser = new Map(
        ((wallets ?? []) as Array<{ user_id: string; balance: number }>).map((w) => [w.user_id, w.balance])
      )
      sorted = [...filtered].sort(
        (a, b) => (auraByUser.get(b.user_id) ?? 0) - (auraByUser.get(a.user_id) ?? 0) || byRecent(a, b)
      )
    }
  }

  const from = (page - 1) * limit
  const pageIds = sorted.slice(from, from + limit).map((r) => r.id)
  const hasMore = from + limit < matchCount

  // O destaque sai do índice já carregado: nenhuma consulta própria, e os dois
  // ids entram no MESMO lote de detalhes/perfis da página.
  let spotlightIds: { positive: string; critical: string } | null = null
  if (includeSpotlight && totalCount >= SPOTLIGHT_MIN_REVIEWS) {
    const positive = mostHelpful(rows.filter((r) => r.rating >= POSITIVE_REVIEW_MIN_RATING))
    const critical = mostHelpful(rows.filter((r) => r.rating < POSITIVE_REVIEW_MIN_RATING))
    if (positive && critical) spotlightIds = { positive: positive.id, critical: critical.id }
  }

  const detailIds = [...new Set([...pageIds, ...(spotlightIds ? [spotlightIds.positive, spotlightIds.critical] : [])])]
  const base = { average, totalCount, matchCount, distribution, positiveCount, hasMore }
  if (detailIds.length === 0) return { ...base, reviews: [], hasMore: false, spotlight: null }

  const { data: detailRows, error: detailError } = await db
    .from("peripheral_reviews")
    .select(REVIEW_DETAIL_COLUMNS)
    .in("id", detailIds)

  if (detailError) {
    console.error("[peripheral-reviews-repository] getPeripheralReviewsWithStats (page):", detailError)
    return { ...base, reviews: [], spotlight: null }
  }

  const rowById = new Map(((detailRows ?? []) as ReviewDetailRow[]).map((r) => [r.id, r]))
  const [profileMap, myVotes] = await Promise.all([
    buildProfileMap(detailIds.map((id) => rowById.get(id)?.user_id ?? null)),
    getOwnPeripheralReviewVote(db, viewerId, detailIds),
  ])

  const detailOf = (id: string): PeripheralReviewDetail | null => {
    const row = rowById.get(id)
    return row ? toReviewDetail(row, profileMap[row.user_id], myVotes.get(id) ?? null) : null
  }

  const reviews = pageIds.map(detailOf).filter((r): r is PeripheralReviewDetail => r !== null)
  const positive = spotlightIds ? detailOf(spotlightIds.positive) : null
  const critical = spotlightIds ? detailOf(spotlightIds.critical) : null

  return { ...base, reviews, spotlight: positive && critical ? { positive, critical } : null }
}
