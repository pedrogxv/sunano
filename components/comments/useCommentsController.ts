import { useEffect, useState } from "react"
import { toast } from "sonner"

import type { CommentItem, CommentsAuthUser } from "./types"

/**
 * Estado e handlers de comentários (listagem, novo comentário, resposta em
 * thread de 1 nível, Aura em comentário) — mesma lógica usada pelo fórum,
 * parametrizada só pelo prefixo de API (`/api/forum/posts/[slug]` ou
 * `/api/blog/[slug]`) para ser reaproveitada por notícias e futuras features.
 *
 * Não busca o post em si — cada página resolve isso do jeito que já faz
 * (client-side fetch no fórum, RSC/ISR em notícias) e passa `comments`
 * iniciais + `onCommentsChange` para manter esse hook em sincronia.
 */
export function useCommentsController({
  apiBasePath,
  auraLookupPath,
  comments,
  onCommentsChange,
  authUser,
}: {
  apiBasePath: string
  /** Endpoint bulk de "o que eu já dei aura" (`/api/forum/aura` ou `/api/blog/aura`). */
  auraLookupPath: string
  comments: CommentItem[]
  onCommentsChange: (comments: CommentItem[]) => void
  authUser: CommentsAuthUser
}) {
  const [commentAuraGiven, setCommentAuraGiven] = useState<Set<string>>(new Set())

  const [formExpanded, setFormExpanded] = useState(false)
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState("")
  const [replySaving, setReplySaving] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)

  useEffect(() => {
    if (!authUser) setCommentAuraGiven(new Set())
  }, [authUser])

  // Aura dada pelo usuário atual nos comentários visíveis.
  useEffect(() => {
    if (!authUser || comments.length === 0) return
    const commentIds = comments.map((c) => c.id)
    const query = new URLSearchParams({ commentIds: commentIds.join(",") })
    fetch(`${auraLookupPath}?${query}`)
      .then((res) => res.json())
      .then((data) => setCommentAuraGiven(new Set(data?.commentsGiven ?? [])))
      .catch(() => setCommentAuraGiven(new Set()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, comments.length, auraLookupPath])

  async function toggleCommentAura(comment: CommentItem) {
    if (!authUser) return
    const wasGiven = commentAuraGiven.has(comment.id)
    const prevCount = comment.aura_count

    setCommentAuraGiven((prev) => {
      const next = new Set(prev)
      if (wasGiven) next.delete(comment.id)
      else next.add(comment.id)
      return next
    })
    onCommentsChange(
      comments.map((c) => (c.id === comment.id ? { ...c, aura_count: c.aura_count + (wasGiven ? -10 : 10) } : c))
    )

    const res = await fetch(`${apiBasePath}/comments/${comment.id}/aura`, { method: "POST" })

    if (!res.ok) {
      setCommentAuraGiven((prev) => {
        const next = new Set(prev)
        if (wasGiven) next.add(comment.id)
        else next.delete(comment.id)
        return next
      })
      onCommentsChange(comments.map((c) => (c.id === comment.id ? { ...c, aura_count: prevCount } : c)))
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? "Erro ao dar aura")
    } else {
      const data = await res.json().catch(() => null)
      if (data?.aura_count !== undefined) {
        onCommentsChange(comments.map((c) => (c.id === comment.id ? { ...c, aura_count: data.aura_count } : c)))
      }
    }
  }

  async function submitComment(onPosted: () => Promise<void> | void) {
    if (!authUser) return
    try {
      setSaving(true)
      setFormError(null)
      const res = await fetch(`${apiBasePath}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao enviar comentário")
      setBody("")
      setFormExpanded(false)
      await onPosted()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao enviar comentário")
    } finally {
      setSaving(false)
    }
  }

  async function submitReply(parentCommentId: string, onPosted: () => Promise<void> | void) {
    if (!authUser) return
    try {
      setReplySaving(true)
      setReplyError(null)
      const res = await fetch(`${apiBasePath}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody, parentCommentId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao enviar resposta")
      setReplyBody("")
      setReplyingTo(null)
      await onPosted()
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

  function cancelComment() {
    setFormExpanded(false)
    setBody("")
    setFormError(null)
  }

  function cancelReply(commentId: string) {
    setReplyingTo((current) => (current === commentId ? null : current))
    setReplyBody("")
    setReplyError(null)
  }

  return {
    commentAuraGiven,
    toggleCommentAura,
    formExpanded,
    setFormExpanded,
    body,
    setBody,
    saving,
    formError,
    submitComment,
    cancelComment,
    replyingTo,
    replyBody,
    setReplyBody,
    replySaving,
    replyError,
    submitReply,
    startReply,
    cancelReply,
  }
}
