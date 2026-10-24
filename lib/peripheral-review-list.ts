/**
 * Ordenação, filtro por nota e busca da lista de reviews de periférico.
 *
 * Módulo puro (sem `server-only`): a rota `GET /api/peripherals/[id]/reviews`,
 * o repositório e a página `/perifericos/[slug]/reviews` leem daqui. A query
 * string da página é a MESMA da API (`order`, `stars`, `q`), então um link
 * compartilhado com filtro abre exatamente a lista que a pessoa estava vendo,
 * e um parser só decide o que é valor válido.
 */

/**
 * `aura` é a ordem histórica (Aura do autor, empate por mais recente) e segue
 * sendo o padrão da página. `random` é só do carrossel da ficha, que embaralha
 * por visita com uma `seed` estável; não aparece no seletor.
 */
export type ReviewListOrder = "aura" | "random" | "helpful" | "recent" | "rating_desc" | "rating_asc"

/** Ordens oferecidas no seletor da página, na ordem em que aparecem. */
export const REVIEW_SORT_OPTIONS: ReadonlyArray<{
  key: Exclude<ReviewListOrder, "random">
  label: string
  hint: string
}> = [
  { key: "aura", label: "Em destaque", hint: "Autores com mais Aura primeiro" },
  { key: "helpful", label: "Mais úteis", hint: "As que a comunidade marcou como úteis" },
  { key: "recent", label: "Mais recentes", hint: "Das novas para as antigas" },
  { key: "rating_desc", label: "Maior nota", hint: "Das 5 estrelas para baixo" },
  { key: "rating_asc", label: "Menor nota", hint: "Críticas primeiro" },
]

export const DEFAULT_REVIEW_ORDER: ReviewListOrder = "aura"

const ORDERS: ReadonlySet<string> = new Set<ReviewListOrder>([
  "aura",
  "random",
  "helpful",
  "recent",
  "rating_desc",
  "rating_asc",
])

export type RatingBucket = 1 | 2 | 3 | 4 | 5

export const RATING_BUCKETS: readonly RatingBucket[] = [5, 4, 3, 2, 1]

/**
 * Faixa de estrelas de uma nota. A nota anda em meia estrela, e a faixa N
 * cobre `N - 0,5` e `N`: 4,5 conta como 5 estrelas, 3,5 como 4. É a mesma
 * regra do filtro (repositório) e das barras do resumo; uma diferença entre os
 * dois faria a barra prometer 3 reviews e o filtro devolver 2.
 */
export function ratingBucketOf(rating: number): RatingBucket {
  return Math.min(5, Math.max(1, Math.ceil(rating))) as RatingBucket
}

/** Notas que caem na faixa, para o rótulo da barra ("Notas 4,5 e 5"). */
export function ratingBucketRange(bucket: RatingBucket): string {
  return bucket === 1 ? "Nota 1" : `Notas ${String(bucket - 0.5).replace(".", ",")} e ${bucket}`
}

/** Quantas reviews há em cada faixa. Chave = estrelas. */
export type RatingDistribution = Record<RatingBucket, number>

export const EMPTY_RATING_DISTRIBUTION: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

/**
 * Nota a partir da qual uma review conta como "aprovou" no resumo. Comparação
 * direta com a nota (não com a faixa): 3,5 cai na faixa de 4 estrelas, mas não
 * é uma aprovação.
 */
export const POSITIVE_REVIEW_MIN_RATING = 4

/** Abaixo disto o termo não filtra nada: uma letra casa com quase tudo. */
export const REVIEW_SEARCH_MIN_LENGTH = 2
export const REVIEW_SEARCH_MAX_LENGTH = 80

export type ReviewListQuery = {
  order: ReviewListOrder
  stars: RatingBucket | null
  q: string | null
}

export const DEFAULT_REVIEW_LIST_QUERY: ReviewListQuery = {
  order: DEFAULT_REVIEW_ORDER,
  stars: null,
  q: null,
}

/** Normaliza o termo de busca: `null` quando curto demais para filtrar. */
export function normalizeReviewSearch(raw: string | null | undefined): string | null {
  const term = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, REVIEW_SEARCH_MAX_LENGTH)
  return term.length >= REVIEW_SEARCH_MIN_LENGTH ? term : null
}

/**
 * Lê `order`/`stars`/`q` de uma query string. Valor desconhecido cai no
 * padrão em vez de virar erro: link antigo ou digitado à mão abre a lista
 * normal, nunca uma página quebrada.
 */
export function parseReviewListQuery(params: URLSearchParams): ReviewListQuery {
  const rawOrder = params.get("order")
  const order = rawOrder && ORDERS.has(rawOrder) ? (rawOrder as ReviewListOrder) : DEFAULT_REVIEW_ORDER
  const starsNumber = Number(params.get("stars"))
  const stars = Number.isInteger(starsNumber) && starsNumber >= 1 && starsNumber <= 5 ? (starsNumber as RatingBucket) : null
  return { order, stars, q: normalizeReviewSearch(params.get("q")) }
}

/** Inverso de `parseReviewListQuery`, omitindo o que é padrão (URL limpa). */
export function reviewListQueryToParams(query: ReviewListQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.order !== DEFAULT_REVIEW_ORDER) params.set("order", query.order)
  if (query.stars) params.set("stars", String(query.stars))
  if (query.q) params.set("q", query.q)
  return params
}

export function isDefaultReviewListQuery(query: ReviewListQuery): boolean {
  return query.order === DEFAULT_REVIEW_ORDER && query.stars === null && query.q === null
}

/**
 * Reviews por página na página de reviews. Aqui (e não no componente) porque
 * a página do servidor e a lista no cliente precisam do mesmo número: importar
 * uma constante de um módulo "use client" num Server Component entrega uma
 * referência de cliente, não o valor.
 */
export const REVIEW_LIST_PAGE_SIZE = 12
