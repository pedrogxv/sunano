"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LockOpen,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Search,
  X,
} from "lucide-react"
import Link from "next/link"

import type { ModerationComment, ModerationPost } from "@/lib/server/repositories/forum-repository"
import { CategoryBadge } from "@/components/forum/CategoryBadge"
import { ImageLightbox } from "@/components/forum/ImageLightbox"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DeletePostButton } from "./DeletePostButton"

type FilterKey = "all" | "visible" | "hidden" | "locked" | "pinned"

function extractYoutubeId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1) || null
    return parsed.searchParams.get("v")
  } catch {
    return null
  }
}

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "Todos",
  visible: "Visíveis",
  hidden: "Ocultos",
  locked: "Bloqueados",
  pinned: "Fixados",
}

const COMMENTS_PREVIEW_COUNT = 3

type ModerationResponse = {
  posts: ModerationPost[]
  commentsByPost: Record<string, ModerationComment[]>
  total: number
  totalPages: number
  page: number
}

async function postAction(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/forum/moderation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? "Falha ao aplicar ação.")
  }
}

export function ForumModerationClient({
  canWrite,
  pageSize,
  initialPosts,
  initialCommentsByPost,
  initialTotal,
}: {
  canWrite: boolean
  pageSize: number
  initialPosts: ModerationPost[]
  initialCommentsByPost: Record<string, ModerationComment[]>
  initialTotal: number
}) {
  const [filter, setFilter] = useState<FilterKey>("all")
  const [qInput, setQInput] = useState("")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)

  const [posts, setPosts] = useState(initialPosts)
  const [commentsByPost, setCommentsByPost] = useState(initialCommentsByPost)
  const [total, setTotal] = useState(initialTotal)
  const [isLoading, setIsLoading] = useState(false)
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const requestId = useRef(0)
  const isFirstLoad = useRef(true)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const fetchData = useCallback(
    async (params: { filter: FilterKey; q: string; page: number }) => {
      const currentRequest = ++requestId.current
      setIsLoading(true)
      try {
        const url = new URL("/api/admin/forum/moderation", window.location.origin)
        if (params.filter !== "all") url.searchParams.set("filter", params.filter)
        if (params.q) url.searchParams.set("q", params.q)
        if (params.page > 1) url.searchParams.set("page", String(params.page))

        const res = await fetch(url.toString())
        if (!res.ok) throw new Error("Falha ao carregar posts.")
        const data: ModerationResponse = await res.json()

        if (currentRequest !== requestId.current) return
        setPosts(data.posts)
        setCommentsByPost(data.commentsByPost)
        setTotal(data.total)
        setError(null)
      } catch {
        if (currentRequest !== requestId.current) return
        setError("Erro ao buscar posts. Tente novamente.")
      } finally {
        if (currentRequest === requestId.current) setIsLoading(false)
      }
    },
    []
  )

  // Debounce da busca por título/autor — evita disparar uma request a cada tecla.
  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(qInput)
      setPage(1)
    }, 350)
    return () => clearTimeout(handle)
  }, [qInput])

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      return
    }
    fetchData({ filter, q, page })
  }, [filter, q, page, fetchData])

  function toggleCommentsExpanded(postId: string) {
    setExpandedComments((prev) => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  async function handlePostFlag(postId: string, flag: "is_hidden" | "is_locked" | "is_pinned", value: boolean) {
    setPosts((prev) =>
      prev.map((p) => {
        if (flag === "is_pinned" && value && p.id !== postId) return { ...p, is_pinned: false }
        if (p.id === postId) return { ...p, [flag]: value }
        return p
      })
    )
    try {
      await postAction({ type: "post_flag", postId, flag, value })
    } catch {
      setError("Falha ao atualizar o post. Recarregando…")
      fetchData({ filter, q, page })
    }
  }

  async function handleCommentHidden(postId: string, commentId: string, value: boolean) {
    setCommentsByPost((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? []).map((c) => (c.id === commentId ? { ...c, is_hidden: value } : c)),
    }))
    try {
      await postAction({ type: "comment_hidden", commentId, value })
    } catch {
      setError("Falha ao atualizar o comentário. Recarregando…")
      fetchData({ filter, q, page })
    }
  }

  async function handleDeletePost(postId: string) {
    const prevPosts = posts
    setPosts((prev) => prev.filter((p) => p.id !== postId))
    setTotal((t) => Math.max(0, t - 1))
    try {
      await postAction({ type: "delete_post", postId })
    } catch {
      setPosts(prevPosts)
      setError("Falha ao excluir o post.")
    }
  }

  const resultsLabel = useMemo(() => {
    const n = total ?? 0
    return `${n} post${n !== 1 ? "s" : ""} encontrado${n !== 1 ? "s" : ""}`
  }, [total])

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f)
                setPage(1)
              }}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:border-border/70 hover:text-foreground"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar título ou autor…"
            className="h-8 w-52 rounded-lg border border-border bg-muted/20 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {qInput && (
            <button
              type="button"
              onClick={() => setQInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {isLoading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" />
            Buscando…
          </span>
        ) : (
          <span>{resultsLabel}</span>
        )}
        {q && !isLoading && <span>· filtrando por &quot;{q}&quot;</span>}
        {error && <span className="text-destructive">· {error}</span>}
      </div>

      {/* Post list */}
      <div className={`space-y-4 transition-opacity ${isLoading ? "opacity-60" : ""}`}>
        {posts.map((post) => {
          const comments = commentsByPost[post.id] ?? []
          const hiddenComments = comments.filter((c) => c.is_hidden).length
          const isExpanded = expandedComments.has(post.id)
          const visibleComments = isExpanded ? comments : comments.slice(0, COMMENTS_PREVIEW_COUNT)
          const hasMoreComments = comments.length > COMMENTS_PREVIEW_COUNT
          const youtubeId = post.media_video_url ? extractYoutubeId(post.media_video_url) : null

          return (
            <div
              key={post.id}
              className={`rounded-xl border bg-card transition-colors ${
                post.is_pinned
                  ? "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/15"
                  : post.is_hidden
                  ? "border-border/40 opacity-70"
                  : "border-border"
              }`}
            >
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <UserAvatar name={post.author_name} avatarUrl={post.author_avatar_url} size={9} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">{post.author_name}</span>
                      <span className="text-xs text-muted-foreground">
                        · {format(new Date(post.created_at), "dd MMM yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <CategoryBadge category={post.category} />
                      {post.is_pinned && (
                        <Badge variant="secondary" className="gap-1 bg-primary/15 text-[10px] text-primary">
                          <Pin className="size-2.5" />
                          Fixado
                        </Badge>
                      )}
                      {post.is_hidden && (
                        <Badge variant="secondary" className="gap-1 bg-red-500/15 text-[10px] text-red-400">
                          <EyeOff className="size-2.5" />
                          Oculto
                        </Badge>
                      )}
                      {post.is_locked && (
                        <Badge variant="secondary" className="gap-1 bg-amber-500/15 text-[10px] text-amber-400">
                          <Lock className="size-2.5" />
                          Bloqueado
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground line-clamp-3">
                      {post.body_preview}
                    </p>

                    {post.media_image_urls.length > 0 && (
                      <div className="max-w-sm">
                        <ImageLightbox
                          srcs={post.media_image_urls}
                          alt={`Imagem do post de ${post.author_name}`}
                        />
                      </div>
                    )}

                    {youtubeId && (
                      <div className="mt-3 aspect-video max-w-sm overflow-hidden rounded-lg border border-border/50">
                        <iframe
                          src={`https://www.youtube.com/embed/${youtubeId}`}
                          title="Vídeo do post"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="size-full"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                  <Link href={`/admin/forum/${post.slug}/edit`} className="contents sm:block">
                    <Button size="sm" variant="secondary" className="h-8 w-full gap-1.5 text-xs">
                      <Pencil className="size-3.5" />
                      Editar
                    </Button>
                  </Link>

                  {canWrite && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant={post.is_pinned ? "default" : "secondary"}
                        className="h-8 w-full gap-1.5 text-xs"
                        title={post.is_pinned ? "Desafixar post" : "Fixar post"}
                        onClick={() => startTransition(() => handlePostFlag(post.id, "is_pinned", !post.is_pinned))}
                      >
                        {post.is_pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                        {post.is_pinned ? "Desafixar" : "Fixar"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={post.is_hidden ? "default" : "secondary"}
                        className="h-8 w-full gap-1.5 text-xs"
                        title={post.is_hidden ? "Mostrar post" : "Ocultar post"}
                        onClick={() => startTransition(() => handlePostFlag(post.id, "is_hidden", !post.is_hidden))}
                      >
                        {post.is_hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                        {post.is_hidden ? "Mostrar" : "Ocultar"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={post.is_locked ? "default" : "secondary"}
                        className="h-8 w-full gap-1.5 text-xs"
                        title={post.is_locked ? "Desbloquear" : "Bloquear comentários"}
                        onClick={() => startTransition(() => handlePostFlag(post.id, "is_locked", !post.is_locked))}
                      >
                        {post.is_locked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
                        {post.is_locked ? "Desbloquear" : "Bloquear"}
                      </Button>
                      <DeletePostButton
                        action={() => handleDeletePost(post.id)}
                        postTitle={post.body_preview}
                      />
                    </>
                  )}
                </div>
              </div>

              {comments.length > 0 && (
                <div className="border-t border-border/50 px-4 pb-4 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <MessageSquare className="size-3.5" />
                      {comments.length} comentário{comments.length !== 1 ? "s" : ""}
                      {hiddenComments > 0 && ` · ${hiddenComments} oculto${hiddenComments !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {visibleComments.map((comment) => (
                      <div
                        key={comment.id}
                        className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                          comment.is_hidden ? "border-border/30 bg-muted/10 opacity-60" : "border-border/30 bg-muted/5"
                        }`}
                      >
                        <UserAvatar name={comment.author_name} avatarUrl={comment.author_avatar_url} size={6} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">{comment.author_name}</span>
                            {" · "}
                            {format(new Date(comment.created_at), "dd MMM yyyy", { locale: ptBR })}
                            {comment.is_hidden && <span className="ml-1 text-red-400">(oculto)</span>}
                          </p>
                          <p className="mt-0.5 text-xs text-foreground">{comment.body}</p>
                        </div>
                        {canWrite && (
                          <Button
                            type="button"
                            size="sm"
                            variant={comment.is_hidden ? "default" : "secondary"}
                            className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                            title={comment.is_hidden ? "Mostrar comentário" : "Ocultar comentário"}
                            onClick={() =>
                              startTransition(() => handleCommentHidden(post.id, comment.id, !comment.is_hidden))
                            }
                          >
                            {comment.is_hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {hasMoreComments && (
                    <button
                      type="button"
                      onClick={() => toggleCommentsExpanded(post.id)}
                      className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-border/50 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <ChevronDown className={`size-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      {isExpanded
                        ? "Mostrar menos"
                        : `Ver mais ${comments.length - COMMENTS_PREVIEW_COUNT} comentário${
                            comments.length - COMMENTS_PREVIEW_COUNT !== 1 ? "s" : ""
                          }`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {posts.length === 0 && !isLoading && (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {q ? `Nenhum post encontrado para "${q}".` : "Nenhum post no fórum ainda."}
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages} · {total} posts
          </p>
          <div className="flex gap-1.5">
            {page > 1 && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-border text-xs"
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
            )}
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = Math.min(Math.max(page - 2, 1) + i, totalPages)
              return (
                <Button
                  key={p}
                  size="sm"
                  variant={p === page ? "default" : "outline"}
                  className={`h-8 w-8 border-border text-xs ${p === page ? "" : "text-muted-foreground"}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              )
            })}
            {page < totalPages && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-border text-xs"
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
