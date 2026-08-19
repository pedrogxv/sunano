"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { PostCard, type PostCardData } from "@/components/forum/PostCard"
import { Button } from "@/components/ui/button"
import BoxLoader from "@/components/ui/box-loader"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"

/**
 * Lista paginada (numerada, não infinite scroll — ver decisão do produto)
 * dos posts salvos do usuário. A primeira página já vem pronta via SSR
 * (`initialPosts`); trocar de página busca em `/api/forum/posts/salvos`.
 */
export function SavedPostsContent({
  initialPosts,
  initialTotal,
  initialTotalPages,
  currentUserId,
}: {
  initialPosts: PostCardData[]
  initialTotal: number
  initialTotalPages: number
  currentUserId: string
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [total, setTotal] = useState(initialTotal)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // A página 1 já veio via SSR — só busca quando `page` muda a partir daí.
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    let cancelled = false
    Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true)
        return fetch(`/api/forum/posts/salvos?page=${page}`)
      })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.ok) return
        setPosts(data.posts ?? [])
        setTotal(data.total ?? 0)
        setTotalPages(data.totalPages ?? 1)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page])

  const handleUnsaved = useCallback((slug: string) => {
    setPosts((prev) => prev.filter((p) => p.slug !== slug))
    setTotal((prev) => Math.max(0, prev - 1))
  }, [])

  if (posts.length === 0 && !loading) {
    return (
      <div className={cn("rounded-2xl p-12 text-center", CARD_SURFACE)}>
        <p className="text-sm text-muted-foreground">
          Você ainda não salvou nenhum post — toque no marcador em qualquer post do fórum para guardá-lo aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {total} {total === 1 ? "post salvo" : "posts salvos"}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <BoxLoader />
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={currentUserId} onOwnPostUnsaved={handleUnsaved} />
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  )
}
