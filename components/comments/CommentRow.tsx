import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { AuraButton } from "@/components/forum/AuraButton"
import { AuthorSpecialTagBadge, AuthorTierBadge } from "@/components/forum/PostCard"
import { UserAvatar } from "@/components/ui/user-avatar"
import type { CommentItem } from "./types"

/** Uma linha de comentário (raiz ou resposta) com avatar, autor, corpo e ações. */
export function CommentRow({
  comment,
  auraGiven,
  authDisabled,
  onToggleAura,
  onReply,
  replying,
  compactAvatar = false,
}: {
  comment: CommentItem
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
          <AuthorSpecialTagBadge slug={comment.author_display_slug} />
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
