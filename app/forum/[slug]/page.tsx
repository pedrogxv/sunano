"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { PostCard, type PostCardData } from "@/components/forum/PostCard"
import BoxLoader from "@/components/ui/box-loader"
import { useAuthUser } from "@/components/providers/auth-context"
import { CommentsSection } from "@/components/comments/CommentsSection"
import type { CommentItem } from "@/components/comments/types"

type ForumPost = PostCardData

export default function ForumPostPage() {
  const params = useParams<{ slug: string }>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [post, setPost] = useState<ForumPost | null>(null)
  const [comments, setComments] = useState<CommentItem[]>([])
  const { user: contextUser, loading: authLoading } = useAuthUser()
  const authUser = useMemo(
    () =>
      contextUser
        ? { id: contextUser.id, display_name: contextUser.displayName, avatar_url: contextUser.avatarUrl }
        : null,
    [contextUser]
  )
  const [postAuraGiven, setPostAuraGiven] = useState(false)

  useEffect(() => {
    if (!authUser) setPostAuraGiven(false)
  }, [authUser])

  const loadPost = useCallback(async (opts?: { silent?: boolean }) => {
    if (!params.slug) return
    try {
      // Refetch "silencioso" (após comentar) não troca a tela pelo loader —
      // só atualiza os dados por baixo, pra não parecer que a página recarregou.
      if (!opts?.silent) setLoading(true)
      setError(null)
      const res = await fetch(`/api/forum/posts/${params.slug}`)
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.post) throw new Error(data?.error ?? "Erro ao carregar post")
      setPost(data.post)
      setComments(data.comments ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar post")
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [params.slug])

  useEffect(() => { loadPost() }, [loadPost])

  // Aura dada pelo usuário atual no post.
  useEffect(() => {
    if (!authUser || !post) return
    const query = new URLSearchParams({ postIds: post.id })
    fetch(`/api/forum/aura?${query}`)
      .then((res) => res.json())
      .then((data) => setPostAuraGiven((data?.postsGiven ?? []).includes(post.id)))
      .catch(() => setPostAuraGiven(false))
  }, [authUser, post])

  async function handleTogglePostAura() {
    if (!authUser || !post) return
    const wasGiven = postAuraGiven
    const prevCount = post.aura_count

    setPostAuraGiven(!wasGiven)
    setPost((p) => (p ? { ...p, aura_count: p.aura_count + (wasGiven ? -10 : 10) } : p))

    const res = await fetch(`/api/forum/posts/${post.slug}/aura`, { method: "POST" })

    if (!res.ok) {
      setPostAuraGiven(wasGiven)
      setPost((p) => (p ? { ...p, aura_count: prevCount } : p))
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? "Erro ao dar aura")
    } else {
      const data = await res.json().catch(() => null)
      if (data?.aura_count !== undefined) {
        setPost((p) => (p ? { ...p, aura_count: data.aura_count } : p))
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar ao fórum
      </Link>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <BoxLoader />
        </div>
      ) : post ? (
        <div className="space-y-6">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none space-y-6">
            <PostCard
              post={post}
              auraGiven={postAuraGiven}
              auraDisabled={!authUser}
              onToggleAura={handleTogglePostAura}
              clickable={false}
              compact={false}
            />
          </div>

          {/* Comments — surge logo depois do post, com um leve atraso pra
              sensação de sequência (não uma seção à parte, "carregada"). */}
          <CommentsSection
            apiBasePath={`/api/forum/posts/${params.slug}`}
            auraLookupPath="/api/forum/aura"
            comments={comments}
            onCommentsChange={setComments}
            reloadComments={() => loadPost({ silent: true })}
            authUser={authUser}
            authLoading={authLoading}
            isLocked={post.is_locked}
          />
        </div>
      ) : null}
    </div>
  )
}
