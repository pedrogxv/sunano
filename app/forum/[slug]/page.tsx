"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowLeft, Lock, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { AuraButton } from "@/components/forum/AuraButton"
import { AuthorTierBadge, PostCard, type PostCardData } from "@/components/forum/PostCard"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useAuthUser } from "@/components/providers/auth-context"
import type { AccountTier } from "@/lib/account-tier"

type ForumPost = PostCardData

type ForumComment = {
  id: string
  body: string
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  parent_comment_id: string | null
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
  const { user: contextUser, loading: authLoading } = useAuthUser()
  const authUser: AuthUser = useMemo(
    () =>
      contextUser
        ? { id: contextUser.id, display_name: contextUser.displayName, avatar_url: contextUser.avatarUrl }
        : null,
    [contextUser]
  )
  const [postAuraGiven, setPostAuraGiven] = useState(false)
  const [commentAuraGiven, setCommentAuraGiven] = useState<Set<string>>(new Set())

  // Comment form
  const [formExpanded, setFormExpanded] = useState(false)
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Reply form (responde a um comentário raiz específico)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState("")
  const [replySaving, setReplySaving] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)

  useEffect(() => {
    if (!authUser) {
      setPostAuraGiven(false)
      setCommentAuraGiven(new Set())
    }
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
      setFormExpanded(false)
      await loadPost({ silent: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao enviar comentário")
    } finally {
      setSaving(false)
    }
  }

  async function submitReply(parentCommentId: string) {
    if (!post || !authUser) return
    try {
      setReplySaving(true)
      setReplyError(null)
      const res = await fetch(`/api/forum/posts/${post.slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody, parentCommentId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao enviar resposta")
      setReplyBody("")
      setReplyingTo(null)
      await loadPost({ silent: true })
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Erro ao enviar resposta")
    } finally {
      setReplySaving(false)
    }
  }

  function startReply(commentId: string) {
    setReplyingTo((current) => (current === commentId ? null : commentId))
    setReplyBody("")
    setReplyError(null)
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
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
          <PostCard
            post={post}
            auraGiven={postAuraGiven}
            auraDisabled={!authUser}
            onToggleAura={handleTogglePostAura}
            clickable={false}
            compact={false}
          />

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
              ) : authUser ? formExpanded ? (
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  {formError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {formError}
                    </div>
                  )}

                  <Textarea
                    autoFocus
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-[100px] border-border bg-muted/20"
                    placeholder="Escreva seu comentário..."
                  />

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFormExpanded(false)
                        setBody("")
                        setFormError(null)
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={submitComment} disabled={saving || body.trim().length < 4}>
                      {saving ? "Enviando…" : "Comentar"}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setFormExpanded(true)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card/80"
                >
                  <UserAvatar name={authUser.display_name} avatarUrl={authUser.avatar_url} size={6} />
                  Escreva um comentário...
                </button>
              ) : null}
            </div>
          )}

          {post.is_locked && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
              <Lock className="size-4 shrink-0" />
              Este tópico está bloqueado para novos comentários.
            </div>
          )}

          {/* Comments */}
          <div id="comments" className="scroll-mt-20">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <MessageCircle className="size-4 text-primary" />
              {comments.length} comentário{comments.length !== 1 ? "s" : ""}
            </div>

            {comments.length > 0 ? (
              <div className="space-y-4">
                {comments
                  .filter((comment) => !comment.parent_comment_id)
                  .map((comment) => {
                    const replies = comments.filter((c) => c.parent_comment_id === comment.id)
                    return (
                      <div key={comment.id} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                        <CommentRow
                          comment={comment}
                          auraGiven={commentAuraGiven.has(comment.id)}
                          authDisabled={!authUser}
                          onToggleAura={() => handleToggleCommentAura(comment)}
                          onReply={() => startReply(comment.id)}
                          replying={replyingTo === comment.id}
                        />

                        {replies.length > 0 && (
                          <div className="ml-11 mt-3 space-y-3 border-l-2 border-border/40 pl-4">
                            {replies.map((reply) => (
                              <div key={reply.id} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                                <CommentRow
                                  comment={reply}
                                  auraGiven={commentAuraGiven.has(reply.id)}
                                  authDisabled={!authUser}
                                  onToggleAura={() => handleToggleCommentAura(reply)}
                                  onReply={() => startReply(comment.id)}
                                  replying={replyingTo === comment.id}
                                  compactAvatar
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {replyingTo === comment.id && (
                          <div className="ml-11 mt-3">
                            <ReplyForm
                              authUser={authUser}
                              value={replyBody}
                              onChange={setReplyBody}
                              onCancel={() => setReplyingTo(null)}
                              onSubmit={() => submitReply(comment.id)}
                              saving={replySaving}
                              error={replyError}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Ainda não há comentários.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Uma linha de comentário (raiz ou resposta) com avatar, autor, corpo e ações. */
function CommentRow({
  comment,
  auraGiven,
  authDisabled,
  onToggleAura,
  onReply,
  replying,
  compactAvatar = false,
}: {
  comment: ForumComment
  auraGiven: boolean
  authDisabled: boolean
  onToggleAura: () => void
  onReply: () => void
  replying: boolean
  compactAvatar?: boolean
}) {
  return (
    <div className="flex gap-3">
      <UserAvatar name={comment.author_display_name} avatarUrl={comment.author_avatar_url} size={compactAvatar ? 7 : 8} />
      <div className="flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{comment.author_display_name}</span>
          <AuthorTierBadge tier={comment.author_account_tier} />
          <span>·</span>
          <span>{format(new Date(comment.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
        </p>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {comment.body}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <AuraButton
            auraCount={comment.aura_count}
            given={auraGiven}
            disabled={authDisabled}
            onToggle={onToggleAura}
          />
          <button
            type="button"
            onClick={onReply}
            className={`text-xs font-medium transition-colors ${
              replying ? "text-primary" : "text-muted-foreground hover:text-primary"
            }`}
          >
            Responder
          </button>
        </div>
      </div>
    </div>
  )
}

/** Formulário inline de resposta a um comentário raiz, aberto sob o comentário. */
function ReplyForm({
  authUser,
  value,
  onChange,
  onCancel,
  onSubmit,
  saving,
  error,
}: {
  authUser: { display_name: string; avatar_url: string | null } | null
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
  saving: boolean
  error: string | null
}) {
  if (!authUser) {
    return (
      <p className="text-xs text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">Entre na sua conta</Link>
        {" "}para responder.
      </p>
    )
  }

  return (
    <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-2 rounded-lg border border-border bg-muted/10 p-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <Textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[72px] border-border bg-background text-sm"
        placeholder="Escreva sua resposta..."
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={saving || value.trim().length < 4}>
          {saving ? "Enviando…" : "Responder"}
        </Button>
      </div>
    </div>
  )
}
