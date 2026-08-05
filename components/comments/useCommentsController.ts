import { useEffect, useState } from "react"
import { toast } from "sonner"

import { nextReaction, nextReactionDelta, type Reaction } from "@/components/forum/AuraButton"
import type { CommentItem, CommentsAuthUser } from "./types"

/**
 * Estado e handlers de comentários (listagem, novo comentário, resposta em
 * thread de 1 nível, Aura e edição na janela de 15min) — mesma lógica do fórum,
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
  const [commentReactions, setCommentReactions] = useState<Map<string, Reaction>>(new Map())

  const [formExpanded, setFormExpanded] = useState(false)
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState("")
  const [replySaving, setReplySaving] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    if (!authUser) setCommentReactions(new Map())
  }, [authUser])

  // Reação do usuário atual nos comentários visíveis.
  useEffect(() => {
    if (!authUser || comments.length === 0) return
    const commentIds = comments.map((c) => c.id)
    const query = new URLSearchParams({ commentIds: commentIds.join(",") })
    fetch(`${auraLookupPath}?${query}`)
      .then((res) => res.json())
      .then((data) => {
        const next = new Map<string, Reaction>()
        for (const id of data?.comments?.liked ?? []) next.set(id, "like")
        for (const id of data?.comments?.disliked ?? []) next.set(id, "dislike")
        setCommentReactions(next)
      })
      .catch(() => setCommentReactions(new Map()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, comments.length, auraLookupPath])

  async function reactToComment(comment: CommentItem, kind: "like" | "dislike") {
    if (!authUser) return
    const prevReaction = commentReactions.get(comment.id) ?? null
    const prevCount = comment.aura_count
    const delta = nextReactionDelta(prevReaction, kind)
    const optimisticReaction = nextReaction(prevReaction, kind)

    setCommentReactions((prev) => new Map(prev).set(comment.id, optimisticReaction))
    onCommentsChange(
      comments.map((c) => (c.id === comment.id ? { ...c, aura_count: c.aura_count + delta } : c))
    )

    const res = await fetch(`${apiBasePath}/comments/${comment.id}/aura`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    })

    if (!res.ok) {
      setCommentReactions((prev) => new Map(prev).set(comment.id, prevReaction))
      onCommentsChange(comments.map((c) => (c.id === comment.id ? { ...c, aura_count: prevCount } : c)))
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? "Erro ao reagir")
    } else {
      const data = await res.json().catch(() => null)
      if (data?.aura_count !== undefined) {
        setCommentReactions((prev) => new Map(prev).set(comment.id, data.reaction ?? null))
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

  async function submitEdit(commentId: string, onSaved: () => Promise<void> | void) {
    if (!authUser) return
    try {
      setEditSaving(true)
      setEditError(null)
      const res = await fetch(`${apiBasePath}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody }),
      })
      const data = await res.json().catch(() => null)
      // Inclui o 403 de janela expirada: o servidor é quem decide o prazo, então
      // a mensagem dele é a que aparece — o formulário fica aberto com o texto
      // digitado em vez de sumir levando a edição junto.
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao editar comentário")
      setEditingId(null)
      setEditBody("")
      await onSaved()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Erro ao editar comentário")
    } finally {
      setEditSaving(false)
    }
  }

  function startEdit(comment: CommentItem) {
    // Abre com o texto cru (com os `**`), que é o que está no banco — o
    // negrito é aplicado só na exibição.
    setEditingId(comment.id)
    setEditBody(comment.body)
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditBody("")
    setEditError(null)
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
    commentReactions,
    reactToComment,
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
    editingId,
    editBody,
    setEditBody,
    editSaving,
    editError,
    submitEdit,
    startEdit,
    cancelEdit,
  }
}
