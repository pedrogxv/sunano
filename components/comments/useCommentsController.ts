import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { nextReaction, nextReactionDelta, type Reaction } from "@/components/forum/AuraButton"
import { notifyAuraChanged } from "@/lib/client/aura-events"
import type { CommentItem, CommentMention, CommentsAuthUser } from "./types"

export type CommentSort = "recent" | "aura"

/**
 * Estado e handlers de comentários (listagem paginada, novo comentário,
 * resposta em thread de 1 nível, Aura e edição na janela de 15min) — mesma
 * lógica do fórum, parametrizada só pelo prefixo de API (`/api/forum/posts/[slug]`
 * ou `/api/blog/[slug]`) para ser reaproveitada por notícias e futuras features.
 *
 * A página inicial (SSR) já busca a 1ª leva de comentários — este hook só
 * assume o controle a partir daí: troca de ordenação e "carregar mais" pedem
 * uma página por vez em vez de trazer o post inteiro de novo, minimizando
 * consulta ao banco.
 */
export function useCommentsController({
  apiBasePath,
  auraLookupPath,
  comments,
  onCommentsChange,
  authUser,
  initialHasMore = false,
}: {
  apiBasePath: string
  /** Endpoint bulk de "o que eu já dei aura" (`/api/forum/aura` ou `/api/blog/aura`). */
  auraLookupPath: string
  comments: CommentItem[]
  onCommentsChange: (comments: CommentItem[]) => void
  authUser: CommentsAuthUser
  /** Se a 1ª página (carregada via SSR) já indica que há mais comentários-raiz. */
  initialHasMore?: boolean
}) {
  const [commentReactions, setCommentReactions] = useState<Map<string, Reaction>>(new Map())
  const [sort, setSort] = useState<CommentSort>("recent")
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  // Setado quando o servidor responde `code: "daily_limit"` — trava o botão
  // de Aura no cliente pro resto da sessão (é um rolling window de 24h, não
  // dá pra saber com certeza quando libera de novo sem reconsultar).
  const [dailyAuraLimitReached, setDailyAuraLimitReached] = useState(false)

  const [formExpanded, setFormExpanded] = useState(false)
  const [body, setBody] = useState("")
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [mentionedUsers, setMentionedUsers] = useState<CommentMention[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState("")
  const [replyImageUrls, setReplyImageUrls] = useState<string[]>([])
  const [replyMentionedUsers, setReplyMentionedUsers] = useState<CommentMention[]>([])
  const [replySaving, setReplySaving] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")
  const [editImageUrls, setEditImageUrls] = useState<string[]>([])
  const [editMentionedUsers, setEditMentionedUsers] = useState<CommentMention[]>([])
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchCommentsPage = useCallback(
    async (targetPage: number, targetSort: CommentSort) => {
      const query = new URLSearchParams({ page: String(targetPage), sort: targetSort })
      const res = await fetch(`${apiBasePath}/comments?${query}`, { cache: "no-store" })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao carregar comentários")
      return data as { comments: CommentItem[]; hasMore: boolean }
    },
    [apiBasePath]
  )

  /** Busca a próxima página de comentários-raiz (+ replies) e concatena ao final da lista. */
  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const data = await fetchCommentsPage(nextPage, sort)
      onCommentsChange([...comments, ...data.comments])
      setPage(nextPage)
      setHasMore(data.hasMore)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar comentários")
    } finally {
      setLoadingMore(false)
    }
  }

  /** Troca "Mais Recente"/"Mais Aura" — recomeça da página 1 substituindo a lista. */
  async function changeSort(nextSort: CommentSort) {
    if (nextSort === sort || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await fetchCommentsPage(1, nextSort)
      onCommentsChange(data.comments)
      setSort(nextSort)
      setPage(1)
      setHasMore(data.hasMore)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar comentários")
    } finally {
      setLoadingMore(false)
    }
  }

  /** Após postar comentário/resposta: recarrega só a página 1 na ordenação atual (barato). */
  async function reloadFirstPage() {
    try {
      const data = await fetchCommentsPage(1, sort)
      onCommentsChange(data.comments)
      setPage(1)
      setHasMore(data.hasMore)
    } catch {
      // mantém os comentários já carregados
    }
  }

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
      // "Próprio comentário" e "limite diário" já aparecem como estado visual
      // do botão (opacidade + tooltip) — um toast em cima seria redundante.
      // Só o inesperado (rate limit genérico, erro de rede, etc.) vira toast.
      if (data?.code === "daily_limit") {
        setDailyAuraLimitReached(true)
      } else if (data?.code !== "self_reaction") {
        toast.error(data?.error ?? "Erro ao reagir")
      }
    } else {
      const data = await res.json().catch(() => null)
      if (data?.aura_count !== undefined) {
        setCommentReactions((prev) => new Map(prev).set(comment.id, data.reaction ?? null))
        onCommentsChange(comments.map((c) => (c.id === comment.id ? { ...c, aura_count: data.aura_count } : c)))
        notifyAuraChanged()
      }
    }
  }

  async function submitComment() {
    if (!authUser) return
    try {
      setSaving(true)
      setFormError(null)
      const res = await fetch(`${apiBasePath}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          imageUrls,
          mentionedUserIds: mentionedUsers.map((u) => u.id),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao enviar comentário")
      setBody("")
      setImageUrls([])
      setMentionedUsers([])
      setFormExpanded(false)
      await reloadFirstPage()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao enviar comentário")
    } finally {
      setSaving(false)
    }
  }

  async function submitReply(parentCommentId: string) {
    if (!authUser) return
    try {
      setReplySaving(true)
      setReplyError(null)
      const res = await fetch(`${apiBasePath}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: replyBody,
          parentCommentId,
          imageUrls: replyImageUrls,
          mentionedUserIds: replyMentionedUsers.map((u) => u.id),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao enviar resposta")
      setReplyBody("")
      setReplyImageUrls([])
      setReplyMentionedUsers([])
      setReplyingTo(null)
      await reloadFirstPage()
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Erro ao enviar resposta")
    } finally {
      setReplySaving(false)
    }
  }

  async function submitEdit(commentId: string) {
    if (!authUser) return
    try {
      setEditSaving(true)
      setEditError(null)
      const res = await fetch(`${apiBasePath}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: editBody,
          imageUrls: editImageUrls,
          mentionedUserIds: editMentionedUsers.map((u) => u.id),
        }),
      })
      const data = await res.json().catch(() => null)
      // Inclui o 403 de janela expirada: o servidor é quem decide o prazo, então
      // a mensagem dele é a que aparece — o formulário fica aberto com o texto
      // digitado em vez de sumir levando a edição junto.
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao editar comentário")
      const newBody = editBody
      const newImageUrls = editImageUrls
      const newMentions = editMentionedUsers
      setEditingId(null)
      setEditBody("")
      setEditImageUrls([])
      setEditMentionedUsers([])
      // Edição não muda a ordenação (recente ou aura) nem a posição na
      // página — atualiza só o corpo/flag/mídia localmente, sem refetch.
      onCommentsChange(
        comments.map((c) =>
          c.id === commentId
            ? { ...c, body: newBody, is_edited: true, image_urls: newImageUrls, mentions: newMentions }
            : c
        )
      )
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Erro ao editar comentário")
    } finally {
      setEditSaving(false)
    }
  }

  function startEdit(comment: CommentItem) {
    // Abre com o texto cru (com os `**`), que é o que está no banco — o
    // negrito é aplicado só na exibição. Imagens e menções já confirmadas
    // entram como estado inicial, exatamente como no formulário de criação.
    setEditingId(comment.id)
    setEditBody(comment.body)
    setEditImageUrls(comment.image_urls)
    setEditMentionedUsers(comment.mentions)
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditBody("")
    setEditImageUrls([])
    setEditMentionedUsers([])
    setEditError(null)
  }

  /**
   * Exclui o próprio comentário. Remove localmente também as respostas dele
   * (a listagem já não as devolveria mais na próxima página), sem refetch.
   */
  async function deleteComment(commentId: string) {
    if (!authUser) return
    try {
      setDeletingId(commentId)
      const res = await fetch(`${apiBasePath}/comments/${commentId}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao excluir comentário")
      onCommentsChange(
        comments.filter((c) => c.id !== commentId && c.parent_comment_id !== commentId)
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir comentário")
    } finally {
      setDeletingId(null)
    }
  }

  function startReply(comment: CommentItem) {
    setReplyingTo((current) => {
      if (current === comment.id) return null
      // Pré-preenche a resposta com o autor já mencionado, como em qualquer
      // rede social — só quando o comentário tem autor de conta (perfis
      // deletados/anônimos não têm user_id pra montar a menção).
      if (comment.user_id) {
        setReplyBody(`@${comment.author_display_name} `)
        setReplyMentionedUsers([
          {
            id: comment.user_id,
            display_name: comment.author_display_name,
            display_slug: comment.author_display_slug,
            avatar_url: comment.author_avatar_url,
          },
        ])
      } else {
        setReplyBody("")
        setReplyMentionedUsers([])
      }
      return comment.id
    })
    setReplyImageUrls([])
    setReplyError(null)
  }

  function cancelComment() {
    setFormExpanded(false)
    setBody("")
    setImageUrls([])
    setMentionedUsers([])
    setFormError(null)
  }

  function cancelReply(commentId: string) {
    setReplyingTo((current) => (current === commentId ? null : current))
    setReplyBody("")
    setReplyImageUrls([])
    setReplyMentionedUsers([])
    setReplyError(null)
  }

  return {
    commentReactions,
    dailyAuraLimitReached,
    reactToComment,
    sort,
    changeSort,
    hasMore,
    loadingMore,
    loadMore,
    formExpanded,
    setFormExpanded,
    body,
    setBody,
    imageUrls,
    setImageUrls,
    mentionedUsers,
    setMentionedUsers,
    saving,
    formError,
    submitComment,
    cancelComment,
    replyingTo,
    replyBody,
    setReplyBody,
    replyImageUrls,
    setReplyImageUrls,
    replyMentionedUsers,
    setReplyMentionedUsers,
    replySaving,
    replyError,
    submitReply,
    startReply,
    cancelReply,
    editingId,
    editBody,
    setEditBody,
    editImageUrls,
    setEditImageUrls,
    editMentionedUsers,
    setEditMentionedUsers,
    editSaving,
    editError,
    submitEdit,
    startEdit,
    cancelEdit,
    deletingId,
    deleteComment,
  }
}
