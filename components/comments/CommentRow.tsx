import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { AuraButton, type AuraBlockReason, type Reaction } from "@/components/forum/AuraButton"
import { ImageLightbox } from "@/components/forum/ImageLightbox"
import { AuthorSpecialTagBadge, AuthorTierBadge } from "@/components/forum/PostCard"
import { ReportMenu } from "@/components/forum/ReportMenu"
import { TextFormatToolbar } from "@/components/forum/TextFormatToolbar"
import { SCROLL_TO_COMMENT_EVENT } from "@/components/notifications/notification-row"
import { AuthorAvatarLink, AuthorNameLink } from "@/components/profile/AuthorLink"
import { StreakBadge } from "@/components/profile/StreakBadge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { canEditComment, commentEditDeadline } from "@/lib/comment-edit"
import { cn } from "@/lib/utils"
import { CommentBody } from "./CommentBody"
import { CommentImagesField } from "./CommentImagesField"
import { MentionTextarea } from "./MentionTextarea"
import type { CommentItem, CommentMention } from "./types"

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

/** Duração do destaque visual ao chegar num comentário via link de notificação. */
const HIGHLIGHT_MS = 2600

/**
 * Escuta o pedido de rolagem disparado por um clique em notificação
 * (`requestScrollToCommentHash`) e, se for deste comentário, rola até ele e
 * acende um destaque temporário — tanto pra quem chega numa página nova
 * quanto pra quem clica numa notificação de um post que já está aberto.
 */
function useScrollHighlight(commentId: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [highlighted, setHighlighted] = useState(false)

  useEffect(() => {
    const scrollAndHighlight = () => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlighted(true)
      window.setTimeout(() => setHighlighted(false), HIGHLIGHT_MS)
    }

    // Primeira carga: a página já abre com `#comment-<id>` na URL.
    if (typeof window !== "undefined" && window.location.hash === `#comment-${commentId}`) {
      const timer = window.setTimeout(scrollAndHighlight, 150)
      return () => window.clearTimeout(timer)
    }
  }, [commentId])

  useEffect(() => {
    const handler = (event: Event) => {
      const targetId = (event as CustomEvent<string>).detail
      if (targetId !== commentId) return
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlighted(true)
      window.setTimeout(() => setHighlighted(false), HIGHLIGHT_MS)
    }
    window.addEventListener(SCROLL_TO_COMMENT_EVENT, handler)
    return () => window.removeEventListener(SCROLL_TO_COMMENT_EVENT, handler)
  }, [commentId])

  return { ref, highlighted }
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
  canReply = true,
  compactAvatar = false,
  canEdit = false,
  editing = false,
  editValue = "",
  onEditChange,
  editImageUrls = [],
  onEditImagesChange,
  editMentionedUsers = [],
  onEditMentionedUsersChange,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  editSaving = false,
  editError = null,
  reportPostSlug,
  canDelete = false,
  deleting = false,
  onDelete,
}: {
  comment: CommentItem
  auraReaction: Reaction
  authDisabled: boolean
  /** Motivo pra travar o botão de Aura antes de tentar (comentário próprio, limite diário). */
  auraBlockReason?: AuraBlockReason
  onReactAura: (kind: "like" | "dislike") => void
  onReply: () => void
  replying: boolean
  /** Falso quando o post está oculto/bloqueado — esconde o botão "Responder". */
  canReply?: boolean
  compactAvatar?: boolean
  /** O usuário logado é o autor deste comentário (a janela de 15min é conferida aqui). */
  canEdit?: boolean
  editing?: boolean
  editValue?: string
  onEditChange?: (value: string) => void
  editImageUrls?: string[]
  onEditImagesChange?: (urls: string[]) => void
  editMentionedUsers?: CommentMention[]
  onEditMentionedUsersChange?: (users: CommentMention[]) => void
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onSubmitEdit?: () => void
  editSaving?: boolean
  editError?: string | null
  /** Slug do post do fórum, para habilitar "Denunciar" — ausente no blog (ainda sem denúncia). */
  reportPostSlug?: string
  /** O usuário logado é o autor deste comentário — excluir não tem janela de tempo, ao contrário de editar. */
  canDelete?: boolean
  deleting?: boolean
  onDelete?: () => void
}) {
  const withinEditWindow = useWithinEditWindow(comment.created_at)
  const showEditButton = canEdit && withinEditWindow && !editing
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const { ref: highlightRef, highlighted } = useScrollHighlight(comment.id)

  return (
    <div
      id={`comment-${comment.id}`}
      ref={highlightRef}
      className={cn(
        "flex gap-3 rounded-xl transition-colors duration-700 ease-out",
        highlighted && "bg-primary/10 ring-1 ring-primary/30"
      )}
    >
      <AuthorAvatarLink
        author={{ userId: comment.user_id, displayName: comment.author_display_name, displaySlug: comment.author_display_slug }}
        avatarUrl={comment.author_avatar_url}
        size={compactAvatar ? 7 : 8}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <AuthorNameLink
            author={{ userId: comment.user_id, displayName: comment.author_display_name, displaySlug: comment.author_display_slug }}
          />
          <AuthorTierBadge tier={comment.author_account_tier} />
          <AuthorSpecialTagBadge slug={comment.author_display_slug} />
          <StreakBadge days={comment.author_streak} size="sm" />
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
            <TextFormatToolbar
              textareaRef={editTextareaRef}
              value={editValue}
              onChange={(value) => onEditChange?.(value)}
            />
            <MentionTextarea
              autoFocus
              textareaRef={editTextareaRef}
              value={editValue}
              onChange={(value) => onEditChange?.(value)}
              mentionedUsers={editMentionedUsers}
              onMentionedUsersChange={(users) => onEditMentionedUsersChange?.(users)}
              className="min-h-[72px] border-border bg-background text-sm"
              placeholder="Escreva seu comentário... (@ para mencionar)"
            />
            <CommentImagesField
              imageUrls={editImageUrls}
              onImagesChange={(urls) => onEditImagesChange?.(urls)}
              disabled={editSaving}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={onSubmitEdit}
                disabled={editSaving || (editValue.trim().length < 4 && editImageUrls.length === 0)}
              >
                {editSaving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <CommentBody body={comment.body} mentions={comment.mentions} className="mt-1.5" />
            {comment.image_urls.length > 0 && (
              <div className="mt-1.5 flex max-w-xs gap-2">
                <ImageLightbox srcs={comment.image_urls} alt="Imagem do comentário" />
              </div>
            )}
          </>
        )}

        {!editing && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <AuraButton
              auraCount={comment.aura_count}
              reaction={auraReaction}
              disabled={authDisabled}
              blockReason={auraBlockReason}
              onReact={onReactAura}
            />
            {canReply && (
              <button
                type="button"
                onClick={onReply}
                className={`text-xs font-medium transition-colors ${
                  replying ? "text-primary" : "text-muted-foreground hover:text-primary"
                }`}
              >
                Responder
              </button>
            )}
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
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    disabled={deleting}
                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-60"
                  >
                    {deleting ? "Excluindo…" : "Excluir"}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir este comentário?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Essa ação é definitiva e não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      className="bg-red-600 text-white hover:bg-red-500"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
