"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowLeft, Lock, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { AuraButton } from "@/components/forum/AuraButton"
import { PostCard, type PostCardData } from "@/components/forum/PostCard"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/ui/user-avatar"
import { supabaseAuth } from "@/lib/client/supabase-auth"

type ForumPost = PostCardData

type ForumComment = {
  id: string
  body: string
  author_display_name: string
  author_avatar_url: string | null
  created_at: string
  aura_count: number
}

type AuthUser = { id: string; display_name: string; avatar_url: string | null } | null

export default function ForumPostPage() {
  const params = useParams<{ slug: string }>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [post, setPost] = useState<ForumPost | null>(null)
  const [comments, setComments] = useState<ForumComment[]>([])
  const [authUser, setAuthUser] = useState<AuthUser>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [postAuraGiven, setPostAuraGiven] = useState(false)
  const [commentAuraGiven, setCommentAuraGiven] = useState<Set<string>>(new Set())

  // Comment form
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    // A sessão vem do cliente de autenticação; o perfil vem de /api/auth/me.
    // Em alguns navegadores mobile (webviews como o do Telegram) o evento
    // inicial do onAuthStateChange pode nunca disparar, travando a UI de
    // aura/comentários num skeleton eterno. Depois de alguns segundos,
    // assume-se deslogado — se o evento chegar depois, o estado é atualizado.
    const timeout = setTimeout(() => setAuthLoading(false), 4000)

    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange(async (_event, session) => {
      clearTimeout(timeout)
      if (session?.user) {
        let displayName = session.user.email?.split("@")[0] || "Usuário"
        let avatarUrl: string | null = null
        try {
          const res = await fetch("/api/auth/me")
          const data = await res.json()
          if (data?.userProfile) {
            displayName = data.userProfile.display_name || displayName
            avatarUrl = data.userProfile.avatar_url || null
          }
        } catch {
          // mantém os fallbacks derivados do e-mail
        }
        setAuthUser({ id: session.user.id, display_name: displayName, avatar_url: avatarUrl })
      } else {
        setAuthUser(null)
        setPostAuraGiven(false)
        setCommentAuraGiven(new Set())
      }
      setAuthLoading(false)
    })
    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const loadPost = useCallback(async () => {
    if (!params.slug) return
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/forum/posts/${params.slug}`)
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.post) throw new Error(data?.error ?? "Erro ao carregar post")
      setPost(data.post)
      setComments(data.comments ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar post")
    } finally {
      setLoading(false)
    }
  }, [params.slug])

  useEffect(() => { loadPost() }, [loadPost])

  // Aura dada pelo usuário atual neste post + comentários.
  useEffect(() => {
    if (!authUser || !post) return
    const commentIds = comments.map((c) => c.id)
    const query = new URLSearchParams({ postIds: post.id })
    if (commentIds.length > 0) query.set("commentIds", commentIds.join(","))
    fetch(`/api/forum/aura?${query}`)
      .then((res) => res.json())
      .then((data) => {
        setPostAuraGiven((data?.postsGiven ?? []).includes(post.id))
        setCommentAuraGiven(new Set(data?.commentsGiven ?? []))
      })
      .catch(() => {
        setPostAuraGiven(false)
        setCommentAuraGiven(new Set())
      })
  }, [authUser, post, comments.length]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleToggleCommentAura(comment: ForumComment) {
    if (!authUser || !post) return
    const wasGiven = commentAuraGiven.has(comment.id)
    const prevCount = comment.aura_count

    setCommentAuraGiven((prev) => {
      const next = new Set(prev)
      if (wasGiven) next.delete(comment.id)
      else next.add(comment.id)
      return next
    })
    setComments((prev) =>
      prev.map((c) => (c.id === comment.id ? { ...c, aura_count: c.aura_count + (wasGiven ? -10 : 10) } : c))
    )

    const res = await fetch(`/api/forum/posts/${post.slug}/comments/${comment.id}/aura`, { method: "POST" })

    if (!res.ok) {
      setCommentAuraGiven((prev) => {
        const next = new Set(prev)
        if (wasGiven) next.add(comment.id)
        else next.delete(comment.id)
        return next
      })
      setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, aura_count: prevCount } : c)))
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? "Erro ao dar aura")
    } else {
      const data = await res.json().catch(() => null)
      if (data?.aura_count !== undefined) {
        setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, aura_count: data.aura_count } : c)))
      }
    }
  }

  async function submitComment() {
    if (!post || !authUser) return
    try {
      setSaving(true)
      setFormError(null)
      const res = await fetch(`/api/forum/posts/${post.slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao enviar comentário")
      setBody("")
      await loadPost()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao enviar comentário")
    } finally {
      setSaving(false)
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
        <>
          <PostCard
            post={post}
            auraGiven={postAuraGiven}
            auraDisabled={!authUser}
            onToggleAura={handleTogglePostAura}
            clickable={false}
            compact={false}
          />

          {/* Comments */}
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <MessageCircle className="size-4 text-primary" />
              {comments.length} comentário{comments.length !== 1 ? "s" : ""}
            </div>

            {comments.length > 0 ? (
              <div className="space-y-3">
                {comments.map((comment, idx) => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <UserAvatar name={comment.author_display_name} avatarUrl={comment.author_avatar_url} size={8} />
                      {idx < comments.length - 1 && (
                        <div className="mt-2 w-px flex-1 bg-border/40" />
                      )}
                    </div>
                    <div className="flex-1 pb-3">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{comment.author_display_name}</span>
                        {" · "}{format(new Date(comment.created_at), "dd MMM yyyy", { locale: ptBR })}
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {comment.body}
                      </p>
                      <div className="mt-2">
                        <AuraButton
                          auraCount={comment.aura_count}
                          given={commentAuraGiven.has(comment.id)}
                          disabled={!authUser}
                          onToggle={() => handleToggleCommentAura(comment)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Ainda não há comentários.</p>
            )}
          </div>

          {/* Comment form */}
          {!post.is_locked && (
            <div>
              {!authLoading && !authUser ? (
                <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    <Link href="/login" className="font-medium text-primary hover:underline">Entre na sua conta</Link>
                    {" "}para deixar um comentário.
                  </p>
                </div>
              ) : authUser ? (
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <UserAvatar name={authUser.display_name} avatarUrl={authUser.avatar_url} size={6} />
                    Comentando como <span className="font-medium text-foreground">{authUser.display_name}</span>
                  </div>

                  {formError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {formError}
                    </div>
                  )}

                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-[100px] border-border bg-muted/20"
                    placeholder="Escreva seu comentário..."
                  />

                  <div className="flex justify-end">
                    <Button size="sm" onClick={submitComment} disabled={saving || body.trim().length < 4}>
                      {saving ? "Enviando…" : "Comentar"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {post.is_locked && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
              <Lock className="size-4 shrink-0" />
              Este tópico está bloqueado para novos comentários.
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
