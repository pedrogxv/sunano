"use client"

import Link from "next/link"
import { Lock, MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/ui/user-avatar"
import { CommentFormatHint } from "./CommentBody"
import { CommentRow } from "./CommentRow"
import { ReplyForm } from "./ReplyForm"
import { useCommentsController } from "./useCommentsController"
import type { CommentItem, CommentsAuthUser } from "./types"

// Atraso crescente pra comentários entrarem em sequência (stagger) em vez de
// todos de uma vez só; a partir do 5º comentário, satura no maior atraso.
const COMMENT_STAGGER_DELAYS = ["", "delay-75", "delay-150", "delay-200", "delay-300"] as const
function commentStaggerDelay(index: number) {
  return COMMENT_STAGGER_DELAYS[Math.min(index, COMMENT_STAGGER_DELAYS.length - 1)]
}

/**
 * Seção completa de comentários (form de novo comentário + lista com thread
 * de 1 nível + Aura) — mesma lógica/visual usada pelo fórum, reaproveitada
 * por notícias e por qualquer feature futura via `apiBasePath`/`auraLookupPath`.
 */
export function CommentsSection({
  apiBasePath,
  auraLookupPath,
  comments,
  onCommentsChange,
  reloadComments,
  authUser,
  authLoading,
  isLocked = false,
}: {
  /** Ex.: `/api/forum/posts/[slug]` ou `/api/blog/[slug]`. */
  apiBasePath: string
  /** Ex.: `/api/forum/aura` ou `/api/blog/aura`. */
  auraLookupPath: string
  comments: CommentItem[]
  onCommentsChange: (comments: CommentItem[]) => void
  /** Refetch (silencioso) da lista completa após postar comentário/resposta. */
  reloadComments: () => Promise<void> | void
  authUser: CommentsAuthUser
  authLoading: boolean
  isLocked?: boolean
}) {
  const {
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
  } = useCommentsController({ apiBasePath, auraLookupPath, comments, onCommentsChange, authUser })

  /**
   * Só o autor vê "Editar". O prazo de 15 minutos é conferido dentro do
   * `CommentRow` (que também o faz expirar sozinho) e, de novo, no servidor
   * antes de gravar.
   */
  const isAuthor = (comment: CommentItem) =>
    !!authUser && !!comment.user_id && comment.user_id === authUser.id

  const editProps = (comment: CommentItem) => ({
    canEdit: isAuthor(comment),
    editing: editingId === comment.id,
    editValue: editBody,
    onEditChange: setEditBody,
    onStartEdit: () => startEdit(comment),
    onCancelEdit: cancelEdit,
    onSubmitEdit: () => submitEdit(comment.id, reloadComments),
    editSaving,
    editError,
  })

  return (
    <div className="space-y-6">
      {!isLocked && (
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

              <CommentFormatHint />

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={cancelComment}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => submitComment(reloadComments)}
                  disabled={saving || body.trim().length < 4}
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

      {isLocked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
          <Lock className="size-4 shrink-0" />
          Este tópico está bloqueado para novos comentários.
        </div>
      )}

      <div
        id="comments"
        className="scroll-mt-20 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150 motion-reduce:animate-none"
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <MessageCircle className="size-4 text-primary" />
          {comments.length} comentário{comments.length !== 1 ? "s" : ""}
        </div>

        {comments.length > 0 ? (
          <div className="space-y-4">
            {comments
              .filter((comment) => !comment.parent_comment_id)
              .map((comment, index) => {
                const replies = comments.filter((c) => c.parent_comment_id === comment.id)
                return (
                  <div
                    key={comment.id}
                    className={`animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none ${commentStaggerDelay(index)}`}
                  >
                    <CommentRow
                      comment={comment}
                      auraReaction={commentReactions.get(comment.id) ?? null}
                      authDisabled={!authUser}
                      onReactAura={(kind) => reactToComment(comment, kind)}
                      onReply={() => startReply(comment.id)}
                      replying={replyingTo === comment.id}
                      {...editProps(comment)}
                    />

                    {replies.length > 0 && (
                      <div className="ml-11 mt-3 space-y-3 border-l-2 border-border/40 pl-4">
                        {replies.map((reply, replyIndex) => (
                          <div
                            key={reply.id}
                            className={`animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none ${commentStaggerDelay(index + replyIndex + 1)}`}
                          >
                            <CommentRow
                              comment={reply}
                              auraReaction={commentReactions.get(reply.id) ?? null}
                              authDisabled={!authUser}
                              onReactAura={(kind) => reactToComment(reply, kind)}
                              onReply={() => startReply(comment.id)}
                              replying={replyingTo === comment.id}
                              compactAvatar
                              {...editProps(reply)}
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
                          onCancel={() => cancelReply(comment.id)}
                          onSubmit={() => submitReply(comment.id, reloadComments)}
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
  )
}
