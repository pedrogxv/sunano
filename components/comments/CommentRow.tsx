import { useEffect, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { AuraButton, type AuraBlockReason, type Reaction } from "@/components/forum/AuraButton"
import { AuthorSpecialTagBadge, AuthorTierBadge } from "@/components/forum/PostCard"
import { ReportMenu } from "@/components/forum/ReportMenu"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/ui/user-avatar"
import { canEditComment, commentEditDeadline } from "@/lib/comment-edit"
import { CommentBody, CommentFormatHint } from "./CommentBody"
import type { CommentItem } from "./types"

/**
 * `true` enquanto o comentário está dentro da janela de edição, virando
 * `false` sozinho no instante em que ela fecha — sem reload.
 *
 * Cada comentário agenda um único `setTimeout` para o próprio prazo, em vez de
 * um relógio global re-renderizando a lista inteira a cada segundo: comentário
 * fora da janela (a maioria da página) não agenda nada.
 */
function useWithinEditWindow(createdAt: string) {
  // O estado guarda só o "já fechou", escrito uma única vez pelo timer; se a
  // janela já tinha passado na primeira renderização, `canEditComment` resolve
  // sozinho e nem chega a existir timer.
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const remaining = commentEditDeadline(createdAt) - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0) return
    const timer = setTimeout(() => setExpired(true), remaining)
    return () => clearTimeout(timer)
  }, [createdAt])

  return !expired && canEditComment(createdAt)
}

/** Uma linha de comentário (raiz ou resposta) com avatar, autor, corpo e ações. */
export function CommentRow({
  comment,
  auraReaction,
  authDisabled,
  auraBlockReason = null,
  onReactAura,
  onReply,
  replying,
  compactAvatar = false,
  canEdit = false,
  editing = false,
  editValue = "",
  onEditChange,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  editSaving = false,
  editError = null,
  reportPostSlug,
}: {
  comment: CommentItem
  auraReaction: Reaction
  authDisabled: boolean
  /** Motivo pra travar o botão de Aura antes de tentar (comentário próprio, limite diário). */
  auraBlockReason?: AuraBlockReason
  onReactAura: (kind: "like" | "dislike") => void
  onReply: () => void
  replying: boolean
  compactAvatar?: boolean
  /** O usuário logado é o autor deste comentário (a janela de 15min é conferida aqui). */
  canEdit?: boolean
  editing?: boolean
  editValue?: string
  onEditChange?: (value: string) => void
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onSubmitEdit?: () => void
  editSaving?: boolean
  editError?: string | null
  /** Slug do post do fórum, para habilitar "Denunciar" — ausente no blog (ainda sem denúncia). */
  reportPostSlug?: string
}) {
  const withinEditWindow = useWithinEditWindow(comment.created_at)
  const showEditButton = canEdit && withinEditWindow && !editing

  return (
    <div className="flex gap-3">
      <UserAvatar name={comment.author_display_name} avatarUrl={comment.author_avatar_url} size={compactAvatar ? 7 : 8} />
      <div className="flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{comment.author_display_name}</span>
          <AuthorTierBadge tier={comment.author_account_tier} />
          <AuthorSpecialTagBadge slug={comment.author_display_slug} />
          <span>·</span>
          <span>{format(new Date(comment.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
          {comment.is_edited && <span className="italic opacity-70">(editado)</span>}
        </p>

        {editing ? (
          <div className="mt-1.5 space-y-2">
            {editError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {editError}
              </div>
            )}
            <Textarea
              autoFocus
              value={editValue}
              onChange={(e) => onEditChange?.(e.target.value)}
              className="min-h-[72px] border-border bg-background text-sm"
            />
            <CommentFormatHint />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={onSubmitEdit}
                disabled={editSaving || editValue.trim().length < 4}
              >
                {editSaving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        ) : (
          <CommentBody body={comment.body} className="mt-1.5" />
        )}

        {!editing && (
          <div className="mt-2 flex items-center gap-3">
            <AuraButton
              auraCount={comment.aura_count}
              reaction={auraReaction}
              disabled={authDisabled}
              blockReason={auraBlockReason}
              onReact={onReactAura}
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
            {showEditButton && (
              <button
                type="button"
                onClick={onStartEdit}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                Editar
              </button>
            )}
            {reportPostSlug && (
              <ReportMenu postSlug={reportPostSlug} targetType="comment" commentId={comment.id} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
