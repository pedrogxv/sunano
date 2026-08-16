import Link from "next/link"

import { MiniProfileHoverCard } from "@/components/profile/MiniProfileHoverCard"
import { UserAvatar } from "@/components/ui/user-avatar"
import { profilePath } from "@/lib/profile-name"
import { cn } from "@/lib/utils"

/**
 * Identidade mínima de um autor (comentário, post, review) — o mesmo formato
 * já existe repetido em `CommentRow`, `PostCard`, `PeripheralReviewsList`.
 * `userId`/`displaySlug` juntos permitem distinguir os 3 estados possíveis:
 *
 * - conta ativa (`displaySlug` presente): avatar/nome viram link + Mini Perfil;
 * - convidado, nunca teve conta (`userId` nulo): nome plano, sem link;
 * - conta removida (`userId` presente mas `displaySlug` nulo — o perfil sumiu
 *   do `profileMap` em `forum-repository`/`blog-repository`): tratamento
 *   visual próprio (fundo vermelho + ícone), pra não parecer um convidado comum.
 */
export type AuthorIdentity = {
  userId: string | null
  displayName: string
  displaySlug: string | null
}

export function isRemovedAuthor(author: AuthorIdentity): boolean {
  return author.userId !== null && !author.displaySlug
}

export function AuthorAvatarLink({
  author,
  avatarUrl,
  size = 8,
  side = "right",
  align = "start",
  className,
  onClick,
}: {
  author: AuthorIdentity
  avatarUrl: string | null
  size?: number
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  className?: string
  onClick?: (event: React.MouseEvent) => void
}) {
  const removed = isRemovedAuthor(author)
  const avatar = <UserAvatar name={author.displayName} avatarUrl={avatarUrl} size={size} removed={removed} />

  return (
    <MiniProfileHoverCard slug={author.displaySlug} side={side} align={align}>
      {author.displaySlug ? (
        <Link href={profilePath(author.displaySlug)} onClick={onClick} className={cn("shrink-0", className)}>
          {avatar}
        </Link>
      ) : (
        <span onClick={onClick} className={cn("shrink-0", className)}>
          {avatar}
        </span>
      )}
    </MiniProfileHoverCard>
  )
}

export function AuthorNameLink({
  author,
  side = "right",
  align = "start",
  className,
  onClick,
}: {
  author: AuthorIdentity
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  className?: string
  onClick?: (event: React.MouseEvent) => void
}) {
  const removed = isRemovedAuthor(author)
  const label = removed ? "Usuário removido" : author.displayName

  return (
    <MiniProfileHoverCard slug={author.displaySlug} side={side} align={align}>
      {author.displaySlug ? (
        <Link
          href={profilePath(author.displaySlug)}
          onClick={onClick}
          className={cn("font-medium text-foreground hover:underline", className)}
        >
          {label}
        </Link>
      ) : (
        <span
          onClick={onClick}
          className={cn(
            "font-medium",
            removed ? "text-destructive/90 italic" : "text-foreground",
            className
          )}
        >
          {label}
        </span>
      )}
    </MiniProfileHoverCard>
  )
}
