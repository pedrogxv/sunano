import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { AuraButton, type AuraBlockReason, type Reaction } from "@/components/forum/AuraButton"
import { ImageLightbox } from "@/components/forum/ImageLightbox"
import { AuthorSpecialTagBadge, AuthorTierBadge } from "@/components/forum/PostCard"
import { ReportMenu } from "@/components/forum/ReportMenu"
import { MiniProfileHoverCard } from "@/components/profile/MiniProfileHoverCard"
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
import { UserAvatar } from "@/components/ui/user-avatar"
import { canEditComment, commentEditDeadline } from "@/lib/comment-edit"
import { profilePath } from "@/lib/profile-name"
import { CommentBody, CommentFormatHint } from "./CommentBody"
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

  return (
    <div className="flex gap-3">
      <MiniProfileHoverCard slug={comment.author_display_slug} side="right" align="start">
        {comment.author_display_slug ? (
          <Link href={profilePath(comment.author_display_slug)} className="shrink-0">
            <UserAvatar name={comment.author_display_name} avatarUrl={comment.author_avatar_url} size={compactAvatar ? 7 : 8} />
          </Link>
        ) : (
          <UserAvatar name={comment.author_display_name} avatarUrl={comment.author_avatar_url} size={compactAvatar ? 7 : 8} />
        )}
      </MiniProfileHoverCard>
      <div className="flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <MiniProfileHoverCard slug={comment.author_display_slug} side="right" align="start">
            {comment.author_display_slug ? (
              <Link
                href={profilePath(comment.author_display_slug)}
                className="font-medium text-foreground hover:underline"
              >
                {comment.author_display_name}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{comment.author_display_name}</span>
            )}
          </MiniProfileHoverCard>
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
            <MentionTextarea
              autoFocus
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
