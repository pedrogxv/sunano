"use client"

import { useRef } from "react"
import Link from "next/link"
import { Clock, Flame, Lock, MessageCircle } from "lucide-react"

import type { AuraBlockReason, Reaction } from "@/components/forum/AuraButton"
import { TextFormatToolbar } from "@/components/forum/TextFormatToolbar"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { CommentFormatHint } from "./CommentBody"
import { CommentImagesField } from "./CommentImagesField"
import { CommentRow } from "./CommentRow"
import { MentionTextarea } from "./MentionTextarea"
import { ReplyForm } from "./ReplyForm"
import { useCommentsController, type CommentSort } from "./useCommentsController"
import type { CommentItem, CommentMention, CommentsAuthUser } from "./types"

const SORT_OPTIONS: { value: CommentSort; label: string; icon: typeof Clock }[] = [
  { value: "recent", label: "Mais Recente", icon: Clock },
  { value: "aura", label: "Mais Aura", icon: Flame },
]

// Atraso crescente pra comentários entrarem em sequência (stagger) em vez de
// todos de uma vez só; a partir do 5º comentário, satura no maior atraso.
const COMMENT_STAGGER_DELAYS = ["", "delay-75", "delay-150", "delay-200", "delay-300"] as const
function commentStaggerDelay(index: number) {
  return COMMENT_STAGGER_DELAYS[Math.min(index, COMMENT_STAGGER_DELAYS.length - 1)]
}

/**
 * Recuo à esquerda por nível de thread (raiz = nível 0). Decrescente em vez
 * de somar sempre o mesmo valor — como no Twitter/X — pra thread de 4
 * níveis não "afunilar" o texto em telas estreitas.
 */
const REPLY_INDENT_CLASSES = [
  "",
  "ml-3 pl-2 sm:ml-11 sm:pl-4",
  "ml-3 pl-2 sm:ml-8 sm:pl-3",
  "ml-2 pl-2 sm:ml-6 sm:pl-3",
  "ml-2 pl-2 sm:ml-5 sm:pl-2",
] as const

/**
 * Seção completa de comentários (form de novo comentário + lista com thread
 * de até 4 níveis + Aura) — mesma lógica/visual usada pelo fórum, reaproveitada
 * por notícias e por qualquer feature futura via `apiBasePath`/`auraLookupPath`.
 */
export function CommentsSection({
  apiBasePath,
  auraLookupPath,
  comments,
  onCommentsChange,
  initialHasMore = false,
  totalCount,
  authUser,
  authLoading,
  isLocked = false,
  isHidden = false,
  reportPostSlug,
}: {
  /** Ex.: `/api/forum/posts/[slug]` ou `/api/blog/[slug]`. */
  apiBasePath: string
  /** Ex.: `/api/forum/aura` ou `/api/blog/aura`. */
  auraLookupPath: string
  comments: CommentItem[]
  onCommentsChange: (comments: CommentItem[]) => void
  /** Se a 1ª página (SSR) já indica que há mais comentários-raiz pra paginar. */
  initialHasMore?: boolean
  /** Total real (raiz + respostas) pro cabeçalho — `comments` só tem as páginas já carregadas. */
  totalCount: number
  authUser: CommentsAuthUser
  authLoading: boolean
  isLocked?: boolean
  /** Post oculto/inativo — esconde o formulário de novo comentário (o backend também recusa). */
  isHidden?: boolean
  /** Slug do post do fórum — habilita "Denunciar" nos comentários. Ausente no blog. */
  reportPostSlug?: string
}) {
  const {
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
  } = useCommentsController({
    apiBasePath,
    auraLookupPath,
    comments,
    onCommentsChange,
    authUser,
    initialHasMore,
  })

  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Só o autor vê "Editar". O prazo de 15 minutos é conferido dentro do
   * `CommentRow` (que também o faz expirar sozinho) e, de novo, no servidor
   * antes de gravar.
   */
  const isAuthor = (comment: CommentItem) =>
    !!authUser && !!comment.user_id && comment.user_id === authUser.id

  /** Motivo de bloqueio do botão de Aura, resolvido no cliente antes de tentar a requisição. */
  const auraBlockReason = (comment: CommentItem) =>
    isAuthor(comment) ? "own-comment" : dailyAuraLimitReached ? "daily-limit" : null

  const editProps = (comment: CommentItem) => ({
    canEdit: isAuthor(comment),
    editing: editingId === comment.id,
    editValue: editBody,
    onEditChange: setEditBody,
    editImageUrls,
    onEditImagesChange: setEditImageUrls,
    editMentionedUsers,
    onEditMentionedUsersChange: setEditMentionedUsers,
    onStartEdit: () => startEdit(comment),
    onCancelEdit: cancelEdit,
    onSubmitEdit: () => submitEdit(comment.id),
    editSaving,
    editError,
  })

  const deleteProps = (comment: CommentItem) => ({
    canDelete: isAuthor(comment),
    deleting: deletingId === comment.id,
    onDelete: () => deleteComment(comment.id),
  })

  return (
    <div className="space-y-6">
      {!isLocked && !isHidden && (
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

              <TextFormatToolbar textareaRef={bodyTextareaRef} value={body} onChange={setBody} />
              <MentionTextarea
                autoFocus
                textareaRef={bodyTextareaRef}
                value={body}
                onChange={setBody}
                mentionedUsers={mentionedUsers}
                onMentionedUsersChange={setMentionedUsers}
                className="min-h-[100px] border-border bg-muted/20"
                placeholder="Escreva seu comentário... (@ para mencionar)"
              />

              <CommentImagesField imageUrls={imageUrls} onImagesChange={setImageUrls} disabled={saving} />

              <CommentFormatHint />

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={cancelComment}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => submitComment()}
                  disabled={saving || (body.trim().length < 4 && imageUrls.length === 0)}
                >
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

      {isHidden ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
          <Lock className="size-4 shrink-0" />
          Este conteúdo está oculto e não aceita novos comentários.
        </div>
      ) : isLocked ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
          <Lock className="size-4 shrink-0" />
          Este tópico está bloqueado para novos comentários.
        </div>
      ) : null}

      <div
        id="comments"
        className="scroll-mt-20 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150 motion-reduce:animate-none"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <MessageCircle className="size-4 text-primary" />
            {totalCount} comentário{totalCount !== 1 ? "s" : ""}
          </div>

          {totalCount > 0 && (
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeSort(value)}
                  disabled={loadingMore}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                    sort === value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {comments.length > 0 ? (
          <div className="space-y-4">
            {comments
              .filter((comment) => !comment.parent_comment_id)
              .map((comment, index) => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  allComments={comments}
                  depth={0}
                  staggerIndex={index}
                  commentReactions={commentReactions}
                  authUser={authUser}
                  reactToComment={reactToComment}
                  auraBlockReason={auraBlockReason}
                  isAuthor={isAuthor}
                  canReply={!isLocked && !isHidden}
                  reportPostSlug={reportPostSlug}
                  editProps={editProps}
                  deleteProps={deleteProps}
                  replyingTo={replyingTo}
                  startReply={startReply}
                  cancelReply={cancelReply}
                  replyBody={replyBody}
                  setReplyBody={setReplyBody}
                  replyImageUrls={replyImageUrls}
                  setReplyImageUrls={setReplyImageUrls}
                  replyMentionedUsers={replyMentionedUsers}
                  setReplyMentionedUsers={setReplyMentionedUsers}
                  replySaving={replySaving}
                  replyError={replyError}
                  submitReply={submitReply}
                />
              ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não há comentários.</p>
        )}

        {hasMore && (
          <div className="mt-5 flex justify-center">
            <Button variant="outline" size="sm" className="border-border" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Carregando…" : "Carregar mais comentários"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Um comentário e sua subárvore de respostas (até o nível 4), renderizados
 * recursivamente — cada nível recua um pouco menos que o anterior e ganha
 * uma linha vertical conectando ao pai, estilo Twitter/X.
 */
function CommentThread({
  comment,
  allComments,
  depth,
  staggerIndex,
  commentReactions,
  authUser,
  reactToComment,
  auraBlockReason,
  isAuthor,
  canReply,
  reportPostSlug,
  editProps,
  deleteProps,
  replyingTo,
  startReply,
  cancelReply,
  replyBody,
  setReplyBody,
  replyImageUrls,
  setReplyImageUrls,
  replyMentionedUsers,
  setReplyMentionedUsers,
  replySaving,
  replyError,
  submitReply,
}: {
  comment: CommentItem
  allComments: CommentItem[]
  depth: number
  staggerIndex: number
  commentReactions: Map<string, Reaction>
  authUser: CommentsAuthUser
  reactToComment: (comment: CommentItem, kind: "like" | "dislike") => void
  auraBlockReason: (comment: CommentItem) => AuraBlockReason
  isAuthor: (comment: CommentItem) => boolean
  /** Falso quando o post está oculto/bloqueado — some com "Responder" em toda a thread. */
  canReply: boolean
  reportPostSlug?: string
  editProps: (comment: CommentItem) => Record<string, unknown>
  deleteProps: (comment: CommentItem) => Record<string, unknown>
  replyingTo: string | null
  startReply: (comment: CommentItem) => void
  cancelReply: (commentId: string) => void
  replyBody: string
  setReplyBody: (value: string) => void
  replyImageUrls: string[]
  setReplyImageUrls: (urls: string[]) => void
  replyMentionedUsers: CommentMention[]
  setReplyMentionedUsers: (users: CommentMention[]) => void
  replySaving: boolean
  replyError: string | null
  submitReply: (parentCommentId: string) => void
}) {
  const replies = allComments.filter((c) => c.parent_comment_id === comment.id)
  const indentClass = REPLY_INDENT_CLASSES[Math.min(depth + 1, REPLY_INDENT_CLASSES.length - 1)]

  return (
    <div className={`animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none ${commentStaggerDelay(staggerIndex)}`}>
      <CommentRow
        comment={comment}
        auraReaction={commentReactions.get(comment.id) ?? null}
        authDisabled={!authUser}
        auraBlockReason={auraBlockReason(comment)}
        onReactAura={(kind) => reactToComment(comment, kind)}
        onReply={() => startReply(comment)}
        replying={replyingTo === comment.id}
        canReply={canReply}
        compactAvatar={depth > 0}
        reportPostSlug={isAuthor(comment) ? undefined : reportPostSlug}
        {...editProps(comment)}
        {...deleteProps(comment)}
      />

      {replyingTo === comment.id && (
        <div className={`mt-3 ${REPLY_INDENT_CLASSES[Math.min(depth + 1, REPLY_INDENT_CLASSES.length - 1)]}`}>
          <ReplyForm
            authUser={authUser}
            value={replyBody}
            onChange={setReplyBody}
            imageUrls={replyImageUrls}
            onImagesChange={setReplyImageUrls}
            mentionedUsers={replyMentionedUsers}
            onMentionedUsersChange={setReplyMentionedUsers}
            onCancel={() => cancelReply(comment.id)}
            onSubmit={() => submitReply(comment.id)}
            saving={replySaving}
            error={replyError}
          />
        </div>
      )}

      {replies.length > 0 && (
        <div className={`mt-3 space-y-3 border-l-2 border-border/40 ${indentClass}`}>
          {replies.map((reply, replyIndex) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              allComments={allComments}
              depth={depth + 1}
              staggerIndex={staggerIndex + replyIndex + 1}
              commentReactions={commentReactions}
              authUser={authUser}
              reactToComment={reactToComment}
              auraBlockReason={auraBlockReason}
              isAuthor={isAuthor}
              canReply={canReply}
              reportPostSlug={reportPostSlug}
              editProps={editProps}
              deleteProps={deleteProps}
              replyingTo={replyingTo}
              startReply={startReply}
              cancelReply={cancelReply}
              replyBody={replyBody}
              setReplyBody={setReplyBody}
              replyImageUrls={replyImageUrls}
              setReplyImageUrls={setReplyImageUrls}
              replyMentionedUsers={replyMentionedUsers}
              setReplyMentionedUsers={setReplyMentionedUsers}
              replySaving={replySaving}
              replyError={replyError}
              submitReply={submitReply}
            />
          ))}
        </div>
      )}
    </div>
  )
}
