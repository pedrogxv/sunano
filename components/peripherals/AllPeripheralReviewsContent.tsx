"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  EyeOff,
  Link2,
  Loader2,
  MessageSquareText,
  PenLine,
  Scale,
  Search,
  SearchX,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  PeripheralReviewCard,
  type PeripheralReviewRow,
  type ReviewVotePatch,
} from "@/components/peripherals/PeripheralReviewCard"
import { PeripheralReviewsSummary } from "@/components/peripherals/PeripheralReviewsSummary"
import type { ReviewFormPeripheral } from "@/components/profile/ReviewFormDialog"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useAuthUser } from "@/components/providers/auth-context"
import { AuraAmount } from "@/components/ui/AuraIcon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { PERIPHERAL_REVIEW_CREATION_AURA, type ReviewCategoryKey } from "@/lib/peripheral-review-categories"
import {
  DEFAULT_REVIEW_LIST_QUERY,
  isDefaultReviewListQuery,
  normalizeReviewSearch,
  parseReviewListQuery,
  REVIEW_LIST_PAGE_SIZE,
  REVIEW_SEARCH_MAX_LENGTH,
  REVIEW_SORT_OPTIONS,
  reviewListQueryToParams,
  type RatingBucket,
  type ReviewListOrder,
  type ReviewListQuery,
} from "@/lib/peripheral-review-list"
import { cn } from "@/lib/utils"
// `import type` é apagado no build: não puxa `server-only` para o bundle.
import type {
  PeripheralReviewStats,
  PeripheralReviewViewerState,
} from "@/lib/server/repositories/peripheral-reviews-repository"

// Os diálogos só existem para quem clica em avaliar/editar: fora do bundle
// inicial da página (que a maioria só lê), carregados no primeiro clique — e
// pré-carregados no hover do botão.
const loadReviewFormDialog = () => import("@/components/profile/ReviewFormDialog")
const loadIntegrityTermDialog = () => import("@/components/profile/IntegrityTermDialog")
const ReviewFormDialog = dynamic(() => loadReviewFormDialog().then((m) => m.ReviewFormDialog), { ssr: false })
const IntegrityTermDialog = dynamic(() => loadIntegrityTermDialog().then((m) => m.IntegrityTermDialog), {
  ssr: false,
})

/** A busca só aparece quando há o que buscar; com 3 reviews, ler é mais rápido que digitar. */
const SEARCH_MIN_REVIEWS = 6

/** Duração do destaque ao chegar por um link de review. */
const HIGHLIGHT_MS = 2600

/** Exemplos do campo de busca, no vocabulário de quem usa cada tipo de produto. */
const SEARCH_EXAMPLES: Record<ReviewCategoryKey, string> = {
  mouse: "pegada, sensor, peso",
  mousepad: "controle, velocidade, bordas",
  keyboard: "switch, som, estabilizador",
  monitor: "cores, ghosting, brilho",
  headset: "graves, palco, conforto",
}

type ViewerState = PeripheralReviewViewerState & { viewerId: string }

type ListState = {
  reviews: PeripheralReviewRow[]
  matchCount: number
  hasMore: boolean
  page: number
}

type SummaryState = Pick<PeripheralReviewStats, "average" | "totalCount" | "distribution" | "positiveCount">

export interface ReviewsPagePeripheral {
  id: string
  /** Nome de exibição (marca + modelo, sem repetir). */
  displayName: string
  /** Linha "Fone/Headset · Kiwi Ears" acima do título. */
  eyebrow: string | null
  imageUrl: string | null
  /** Ficha do produto — o ÚNICO caminho de volta da página. */
  href: string
  /** Esta página, para o link de cada review e para a volta do login. */
  reviewsPath: string
  /** Grupo de review do periférico; `null` = categoria que ainda não aceita review. */
  categoryKey: ReviewCategoryKey | null
  /** O que o formulário de review desenha do produto. */
  formPeripheral: ReviewFormPeripheral
}

interface AllPeripheralReviewsContentProps {
  peripheral: ReviewsPagePeripheral
  initial: PeripheralReviewStats
}

/**
 * Página "todas as reviews" de um periférico — a contrapartida do carrossel
 * de flashcards da ficha.
 *
 * O HTML é ISR (igual para todo mundo): a lista padrão e o resumo vêm prontos
 * do servidor, e tudo que depende de QUEM está vendo (votos, a própria review,
 * o termo de integridade) chega depois por `/reviews/viewer`. Filtro, ordem e
 * busca vivem na query string, então o link copiado abre a mesma lista.
 */
export function AllPeripheralReviewsContent({ peripheral, initial }: AllPeripheralReviewsContentProps) {
  const { user, loading: authLoading } = useAuthUser()
  const { openLogin } = useAuthModal()
  const userId = user?.id ?? null

  const [query, setQuery] = useState<ReviewListQuery>(DEFAULT_REVIEW_LIST_QUERY)
  const [searchInput, setSearchInput] = useState("")
  const [list, setList] = useState<ListState>({
    reviews: initial.reviews,
    matchCount: initial.matchCount,
    hasMore: initial.hasMore,
    page: 1,
  })
  const [summary, setSummary] = useState<SummaryState>({
    average: initial.average,
    totalCount: initial.totalCount,
    distribution: initial.distribution,
    positiveCount: initial.positiveCount,
  })
  const [spotlight, setSpotlight] = useState(initial.spotlight)
  const [status, setStatus] = useState<"idle" | "loading" | "loading-more">("idle")
  const [failed, setFailed] = useState<"replace" | "append" | null>(null)

  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [sharedReview, setSharedReview] = useState<PeripheralReviewRow | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const [dialogsMounted, setDialogsMounted] = useState(false)
  const [integrityOpen, setIntegrityOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")

  const requestRef = useRef<AbortController | null>(null)
  const searchTimerRef = useRef<number | null>(null)
  // Chave da consulta que a lista na tela representa. Começa na padrão, que é
  // a que o servidor já renderizou: o efeito de consulta não a busca de novo.
  const loadedKeyRef = useRef("")
  const listTopRef = useRef<HTMLHeadingElement>(null)

  const queryKey = reviewListQueryToParams(query).toString()
  const filtered = query.stars !== null || query.q !== null
  const ownReview = viewer?.myReview ?? null

  const fetchList = useCallback(
    async (target: ReviewListQuery, page: number, mode: "replace" | "append") => {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      setStatus(mode === "replace" ? "loading" : "loading-more")
      setFailed(null)

      const params = reviewListQueryToParams(target)
      params.set("page", String(page))
      params.set("limit", String(REVIEW_LIST_PAGE_SIZE))

      try {
        const res = await fetch(`/api/peripherals/${peripheral.id}/reviews?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as PeripheralReviewStats

        setList((prev) => {
          // Sem duplicar: a ordem por Aura pode andar entre uma página e a
          // seguinte (alguém ganhou Aura no meio), e a mesma review voltaria.
          const known = new Set(mode === "append" ? prev.reviews.map((r) => r.id) : [])
          const incoming = data.reviews.filter((r) => !known.has(r.id))
          return {
            reviews: mode === "append" ? [...prev.reviews, ...incoming] : incoming,
            matchCount: data.matchCount,
            hasMore: data.hasMore,
            page,
          }
        })
        setSummary({
          average: data.average,
          totalCount: data.totalCount,
          distribution: data.distribution,
          positiveCount: data.positiveCount,
        })
        setStatus("idle")
      } catch {
        if (controller.signal.aborted) return
        // A lista anterior continua na tela e `hasMore` não muda: o botão
        // continua lá para tentar de novo. Antes, uma falha zerava `hasMore`
        // e o "Carregar mais" sumia para sempre.
        setFailed(mode)
        setStatus("idle")
      }
    },
    [peripheral.id]
  )

  // Consulta mudou (ordem, faixa, busca): busca a página 1 e grava na URL.
  useEffect(() => {
    if (queryKey === loadedKeyRef.current) return
    loadedKeyRef.current = queryKey
    void fetchList(parseReviewListQuery(new URLSearchParams(queryKey)), 1, "replace")
    window.history.replaceState(null, "", `${window.location.pathname}${queryKey ? `?${queryKey}` : ""}`)
  }, [queryKey, fetchList])

  // Link com filtro (`?stars=1&q=graves`): o HTML ISR é sempre o da lista
  // padrão, então a consulta da URL é aplicada depois de montar.
  useEffect(() => {
    const fromUrl = parseReviewListQuery(new URLSearchParams(window.location.search))
    if (isDefaultReviewListQuery(fromUrl)) return
    setQuery(fromUrl)
    setSearchInput(fromUrl.q ?? "")
  }, [])

  const focusReview = useCallback((reviewId: string) => {
    setHighlightId(reviewId)
    window.setTimeout(() => {
      document.getElementById(`review-${reviewId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 120)
    window.setTimeout(() => setHighlightId((current) => (current === reviewId ? null : current)), HIGHLIGHT_MS)
  }, [])

  // Link de uma review (`#review-<id>`, do "Copiar link" ou de "Meus
  // Reviews"): se ela está na lista, só destaca; se não está (outra página da
  // ordenação), busca ela sozinha e fixa no topo.
  useEffect(() => {
    const match = window.location.hash.match(/^#review-([0-9a-f-]{36})$/i)
    if (!match) return
    const reviewId = match[1]
    if (initial.reviews.some((r) => r.id === reviewId)) {
      focusReview(reviewId)
      return
    }
    let active = true
    fetch(`/api/peripherals/${peripheral.id}/reviews/${reviewId}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { review?: PeripheralReviewRow } | null) => {
        if (!active || !data?.review) return
        setSharedReview(data.review)
        focusReview(reviewId)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [peripheral.id, initial.reviews, focusReview])

  const loadViewer = useCallback(
    async (reviewIds: string[]) => {
      try {
        const res = await fetch(
          `/api/peripherals/${peripheral.id}/reviews/viewer?ids=${encodeURIComponent(reviewIds.join(","))}`,
          { cache: "no-store" }
        )
        if (!res.ok) return
        const data = (await res.json()) as
          | { authenticated: false }
          | ({ authenticated: true; viewerId: string } & PeripheralReviewViewerState)
        if (!data.authenticated) {
          setViewer(null)
          return
        }
        setViewer({
          viewerId: data.viewerId,
          votes: data.votes,
          myReview: data.myReview,
          integrityAccepted: data.integrityAccepted,
        })
        // Só preenche quem ainda não tem voto conhecido: um voto dado enquanto
        // esta chamada estava no ar já tem a resposta do servidor, mais nova.
        const withVote = (r: PeripheralReviewRow): PeripheralReviewRow =>
          r.my_vote === null && data.votes[r.id] ? { ...r, my_vote: data.votes[r.id] } : r
        setList((prev) => ({ ...prev, reviews: prev.reviews.map(withVote) }))
        setSpotlight((prev) => prev && { positive: withVote(prev.positive), critical: withVote(prev.critical) })
      } catch {
        // Sem o estado do visitante a página continua legível; só o CTA espera.
      }
    },
    [peripheral.id]
  )

  // Login/logout trocam o visitante: o HTML ISR não sabe quem é, então o
  // estado dele (votos, review própria) é sempre buscado à parte.
  useEffect(() => {
    if (!userId) {
      setViewer(null)
      return
    }
    const ids = [
      ...initial.reviews.map((r) => r.id),
      ...(initial.spotlight ? [initial.spotlight.positive.id, initial.spotlight.critical.id] : []),
    ]
    void loadViewer(ids)
  }, [userId, loadViewer, initial.reviews, initial.spotlight])

  const patchReview = useCallback((reviewId: string, patch: ReviewVotePatch) => {
    const apply = (r: PeripheralReviewRow) => (r.id === reviewId ? { ...r, ...patch } : r)
    setList((prev) => ({ ...prev, reviews: prev.reviews.map(apply) }))
    setSpotlight((prev) => prev && { positive: apply(prev.positive), critical: apply(prev.critical) })
    setSharedReview((prev) => prev && apply(prev))
  }, [])

  function updateQuery(patch: Partial<ReviewListQuery>) {
    setQuery((prev) => ({ ...prev, ...patch }))
  }

  function selectStars(stars: RatingBucket | null) {
    updateQuery({ stars })
    // No celular o resumo fica acima da lista: leva a pessoa ao resultado.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  function onSearchChange(value: string) {
    setSearchInput(value)
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    searchTimerRef.current = window.setTimeout(() => updateQuery({ q: normalizeReviewSearch(value) }), 300)
  }

  function clearSearch() {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    setSearchInput("")
    updateQuery({ q: null })
  }

  function clearFilters() {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    setSearchInput("")
    updateQuery({ stars: null, q: null })
  }

  function prefetchDialogs() {
    void loadReviewFormDialog()
    void loadIntegrityTermDialog()
  }

  function startCreate() {
    if (!userId) {
      openLogin(peripheral.reviewsPath)
      return
    }
    if (!viewer) return
    setDialogsMounted(true)
    setFormMode("create")
    if (!viewer.integrityAccepted) {
      setIntegrityOpen(true)
      return
    }
    setFormOpen(true)
  }

  function startEdit() {
    setDialogsMounted(true)
    setFormMode("edit")
    setFormOpen(true)
  }

  async function acceptIntegrity() {
    const res = await fetch("/api/account/reviews-integrity-acceptance", { method: "POST" })
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null
    if (!res.ok || !data?.ok) {
      toast.error("Erro ao registrar o aceite do termo.")
      throw new Error("integrity accept failed")
    }
    setViewer((prev) => prev && { ...prev, integrityAccepted: true })
    setFormOpen(true)
  }

  function afterSave() {
    // Nota nova muda média, distribuição e a posição na lista: recarrega a
    // consulta atual e o estado do visitante (agora com a review dele).
    void fetchList(query, 1, "replace")
    void loadViewer(list.reviews.map((r) => r.id))
  }

  const hiddenFromList = new Set([ownReview?.id, sharedReview?.id].filter(Boolean))
  const visibleReviews = list.reviews.filter((r) => !hiddenFromList.has(r.id))
  const showSpotlight = spotlight !== null && isDefaultReviewListQuery(query)
  // A única review do produto é a do próprio visitante (já fixada acima): um
  // "Todas as reviews" vazio logo abaixo dela pareceria lista quebrada.
  const showList = filtered || visibleReviews.length > 0 || status !== "idle" || failed !== null
  const searchExample = peripheral.categoryKey ? SEARCH_EXAMPLES[peripheral.categoryKey] : "conforto, qualidade"
  const permalinkOf = (reviewId: string) => `${peripheral.reviewsPath}#review-${reviewId}`

  const cta = renderCta()

  function renderCta() {
    if (!peripheral.categoryKey) return null
    if (!userId) {
      if (authLoading) return <Skeleton className="h-9 w-full rounded-lg" />
      return (
        <div className="space-y-2">
          <Button className="w-full" size="lg" onClick={() => openLogin(peripheral.reviewsPath)}>
            <PenLine />
            Avaliar este periférico
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">Entre na sua conta para avaliar</p>
        </div>
      )
    }
    if (!viewer) return <Skeleton className="h-9 w-full rounded-lg" />
    if (ownReview?.hidden) {
      return (
        <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
          <EyeOff className="mt-0.5 size-3.5 shrink-0" />
          Sua review deste periférico foi ocultada pela moderação e não aparece para a comunidade
        </p>
      )
    }
    if (ownReview) {
      return (
        <Button variant="outline" size="lg" className="w-full" onClick={startEdit} onPointerEnter={prefetchDialogs}>
          <PenLine />
          Editar minha review
        </Button>
      )
    }
    return (
      <div className="space-y-2">
        <Button className="w-full" size="lg" onClick={startCreate} onPointerEnter={prefetchDialogs}>
          <PenLine />
          Avaliar este periférico
        </Button>
        <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          Sua primeira review rende
          <AuraAmount value={PERIPHERAL_REVIEW_CREATION_AURA} prefix="+" size="xs" tone="brand" />
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader peripheral={peripheral} />

      {summary.totalCount === 0 ? (
        <EmptyReviews displayName={peripheral.displayName} cta={cta} />
      ) : (
        <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-8">
          <aside className="mb-6 lg:sticky lg:top-24 lg:mb-0">
            <PeripheralReviewsSummary
              average={summary.average}
              totalCount={summary.totalCount}
              distribution={summary.distribution}
              positiveCount={summary.positiveCount}
              activeStars={query.stars}
              onSelectStars={selectStars}
              cta={cta}
            />
          </aside>

          <div className="min-w-0 space-y-6">
            {ownReview && !ownReview.hidden && (
              <PeripheralReviewCard
                peripheralId={peripheral.id}
                review={ownReview}
                highlighted={highlightId === ownReview.id}
                permalink={permalinkOf(ownReview.id)}
                eyebrow={<Eyebrow icon={PenLine} tone="own">Sua review</Eyebrow>}
                action={
                  <Button variant="ghost" size="sm" onClick={startEdit} onPointerEnter={prefetchDialogs}>
                    Editar
                  </Button>
                }
                onVoteChange={patchReview}
              />
            )}

            {sharedReview && sharedReview.id !== ownReview?.id && (
              <PeripheralReviewCard
                peripheralId={peripheral.id}
                review={sharedReview}
                highlighted={highlightId === sharedReview.id}
                permalink={permalinkOf(sharedReview.id)}
                eyebrow={<Eyebrow icon={Link2} tone="neutral">Review do link</Eyebrow>}
                onVoteChange={patchReview}
              />
            )}

            {showSpotlight && spotlight && (
              <section aria-labelledby="reviews-spotlight-title" className="space-y-3">
                <h2 id="reviews-spotlight-title" className="flex items-center gap-2 text-sm font-semibold">
                  <Scale className="size-4 text-muted-foreground" />
                  Os dois lados
                  <span className="font-normal text-muted-foreground">· as mais úteis para a comunidade</span>
                </h2>
                <div className="grid gap-3 xl:grid-cols-2">
                  <PeripheralReviewCard
                    peripheralId={peripheral.id}
                    review={spotlight.positive}
                    anchor={false}
                    permalink={permalinkOf(spotlight.positive.id)}
                    eyebrow={<Eyebrow icon={ThumbsUp} tone="positive">Positiva mais útil</Eyebrow>}
                    onVoteChange={patchReview}
                  />
                  <PeripheralReviewCard
                    peripheralId={peripheral.id}
                    review={spotlight.critical}
                    anchor={false}
                    permalink={permalinkOf(spotlight.critical.id)}
                    eyebrow={<Eyebrow icon={ThumbsDown} tone="critical">Crítica mais útil</Eyebrow>}
                    onVoteChange={patchReview}
                  />
                </div>
              </section>
            )}

            {showList && (
            <section aria-labelledby="reviews-list-title" className="space-y-4">
              <div className="space-y-3">
                <h2
                  id="reviews-list-title"
                  ref={listTopRef}
                  className="flex scroll-mt-24 items-center gap-2 text-sm font-semibold"
                >
                  <MessageSquareText className="size-4 text-muted-foreground" />
                  Todas as reviews
                </h2>

                {summary.totalCount > 1 && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {summary.totalCount >= SEARCH_MIN_REVIEWS && (
                      <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="search"
                          value={searchInput}
                          onChange={(e) => onSearchChange(e.target.value)}
                          maxLength={REVIEW_SEARCH_MAX_LENGTH}
                          placeholder={`Buscar nas reviews: ${searchExample}`}
                          aria-label="Buscar nas reviews"
                          className="h-9 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
                        />
                        {searchInput && (
                          <button
                            type="button"
                            onClick={clearSearch}
                            aria-label="Limpar busca"
                            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    <Select
                      value={query.order}
                      onValueChange={(value) => updateQuery({ order: value as ReviewListOrder })}
                    >
                      <SelectTrigger className="h-9 w-full gap-2 sm:w-52" aria-label="Ordenar reviews">
                        <ArrowUpDown className="size-3.5 text-muted-foreground" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" align="end">
                        {REVIEW_SORT_OPTIONS.map((option) => (
                          <SelectItem key={option.key} value={option.key} title={option.hint}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {filtered && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                    <span>
                      {status === "loading" ? (
                        "Buscando…"
                      ) : (
                        <>
                          <span className="font-medium text-foreground tabular-nums">{list.matchCount}</span>{" "}
                          {list.matchCount === 1 ? "review encontrada" : "reviews encontradas"}
                        </>
                      )}
                    </span>
                    {query.stars !== null && (
                      <FilterChip onRemove={() => updateQuery({ stars: null })}>
                        {query.stars} {query.stars === 1 ? "estrela" : "estrelas"}
                      </FilterChip>
                    )}
                    {query.q && <FilterChip onRemove={clearSearch}>“{query.q}”</FilterChip>}
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="font-medium text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Limpar filtros
                    </button>
                  </div>
                )}
              </div>

              {failed === "replace" ? (
                <InlineError message="Não foi possível carregar as reviews" onRetry={() => void fetchList(query, 1, "replace")} />
              ) : status === "loading" && visibleReviews.length === 0 ? (
                <ReviewListSkeleton />
              ) : visibleReviews.length === 0 && status === "idle" ? (
                filtered ? (
                  <NoMatches query={query} onClear={clearFilters} />
                ) : null
              ) : (
                <ol
                  aria-busy={status === "loading"}
                  className={cn("space-y-3 transition-opacity", status === "loading" && "pointer-events-none opacity-50")}
                >
                  {visibleReviews.map((review) => (
                    <li key={review.id}>
                      <PeripheralReviewCard
                        peripheralId={peripheral.id}
                        review={review}
                        highlighted={highlightId === review.id}
                        searchTerm={query.q}
                        permalink={permalinkOf(review.id)}
                        onVoteChange={patchReview}
                      />
                    </li>
                  ))}
                </ol>
              )}

              {list.hasMore && failed !== "replace" && (
                <div className="flex flex-col items-center gap-2.5 pt-2">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {list.reviews.length} de {list.matchCount}
                    </span>
                    <span className="h-1 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span
                        className="block h-full rounded-full bg-foreground/40 transition-[width] duration-500"
                        style={{ width: `${Math.min(100, (list.reviews.length / Math.max(1, list.matchCount)) * 100)}%` }}
                      />
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => void fetchList(query, list.page + 1, "append")}
                    disabled={status !== "idle"}
                  >
                    {status === "loading-more" && <Loader2 className="animate-spin" />}
                    Mostrar mais reviews
                  </Button>
                  {failed === "append" && (
                    <p className="text-xs text-destructive">Não foi possível carregar mais. Tente de novo</p>
                  )}
                </div>
              )}

              {!list.hasMore && list.reviews.length > REVIEW_LIST_PAGE_SIZE && (
                <div className="flex flex-col items-center gap-2 pt-2 text-xs text-muted-foreground">
                  <p>
                    Você chegou ao fim {filtered ? "do filtro" : `das ${list.matchCount} reviews`}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  >
                    <ArrowUp />
                    Voltar ao início da lista
                  </Button>
                </div>
              )}
            </section>
            )}
          </div>
        </div>
      )}

      {dialogsMounted && (
        <>
          <IntegrityTermDialog open={integrityOpen} onOpenChange={setIntegrityOpen} onAccept={acceptIntegrity} />
          <ReviewFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            mode={formMode}
            peripheral={peripheral.formPeripheral}
            initialRating={formMode === "edit" ? ownReview?.rating : undefined}
            initialBody={formMode === "edit" ? ownReview?.body : undefined}
            onSaved={afterSave}
          />
        </>
      )}
    </div>
  )
}

/**
 * Cabeçalho com UM caminho de volta: a ficha do produto. Antes havia dois
 * ("Voltar", que era `router.back()`, e "Voltar para <produto>") empilhados,
 * e o primeiro levava para fora do site quem chegou pelo Google.
 */
function PageHeader({ peripheral }: { peripheral: ReviewsPagePeripheral }) {
  return (
    <header className="space-y-5">
      <Link
        href={peripheral.href}
        className="group inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pr-3 pl-1.5 text-sm text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
      >
        <ArrowLeft className="size-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
        <span className="truncate">Ficha do {peripheral.displayName}</span>
      </Link>

      <div className="flex items-center gap-4">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-foreground/[0.07] sm:size-20">
          {peripheral.imageUrl ? (
            <Image
              src={peripheral.imageUrl}
              alt=""
              fill
              sizes="80px"
              className="object-contain p-2"
              priority
            />
          ) : (
            <MessageSquareText className="absolute inset-0 m-auto size-7 text-muted-foreground/50" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
            <span className="mb-1 block text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Reviews da comunidade
            </span>
            {peripheral.displayName}
          </h1>
          {peripheral.eyebrow && <p className="mt-1 text-sm text-muted-foreground">{peripheral.eyebrow}</p>}
        </div>
      </div>
    </header>
  )
}

function EmptyReviews({ displayName, cta }: { displayName: string; cta: React.ReactNode }) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-card px-6 py-12 text-center ring-1 ring-foreground/[0.07]">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-400/10">
        <MessageSquareText className="size-7 text-amber-400" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">Ninguém avaliou ainda</h2>
        <p className="text-sm text-muted-foreground">
          Se você já usou o {displayName}, a sua review vai ser a primeira que todo mundo lê antes de comprar
        </p>
      </div>
      {cta && <div className="w-full max-w-xs">{cta}</div>}
    </section>
  )
}

const EYEBROW_TONES = {
  positive: "bg-emerald-500/10 text-emerald-400",
  critical: "bg-rose-500/10 text-rose-400",
  own: "bg-sky-500/10 text-sky-400",
  neutral: "bg-muted text-muted-foreground",
} as const

function Eyebrow({
  icon: Icon,
  tone,
  children,
}: {
  icon: React.ElementType
  tone: keyof typeof EYEBROW_TONES
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        EYEBROW_TONES[tone]
      )}
    >
      <Icon className="size-3" />
      {children}
    </span>
  )
}

function FilterChip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 font-medium text-foreground">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover filtro"
        className="flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

function NoMatches({ query, onClear }: { query: ReviewListQuery; onClear: () => void }) {
  const what =
    query.q && query.stars
      ? `com ${query.stars} ${query.stars === 1 ? "estrela" : "estrelas"} falando de “${query.q}”`
      : query.q
        ? `falando de “${query.q}”`
        : `com ${query.stars} ${query.stars === 1 ? "estrela" : "estrelas"}`
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-6 py-10 text-center ring-1 ring-foreground/[0.07]">
      <SearchX className="size-8 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">Nenhuma review {what}</p>
      <Button variant="outline" size="sm" onClick={onClear}>
        Ver todas as reviews
      </Button>
    </div>
  )
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-6 py-10 text-center ring-1 ring-foreground/[0.07]">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  )
}

function ReviewListSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/[0.07] sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      ))}
    </div>
  )
}
