import Link from "next/link"

import { MiniProfileHoverCard } from "@/components/profile/MiniProfileHoverCard"
import { ProfileAvatar, type ProfileAvatarSize } from "@/components/ui/ProfileAvatar"
import { profileFrameOf } from "@/lib/profile-frames"
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
  /** Tier da conta — desenha a moldura VIP no avatar. Ausente = conta comum. */
  accountTier?: string | null
  /** Expiração do VIP; junto com `accountTier` decide se a moldura ainda vale. */
  vipExpiresAt?: string | null
  /** Moldura cosmética equipada, quando a consulta do autor a traz. */
  frameUrl?: string | null
  /** Slug do item equipado — identifica moldura de arte em código (sem asset). */
  frameSlug?: string | null
  /** Se o autor é Fundador. Permanente: não se deriva de `accountTier`. */
  isFounder?: boolean | null
  /** Recorde de ofensiva — decide a moldura de marco. Nunca a ofensiva atual. */
  longestStreak?: number | null
  /** O autor escolheu não exibir moldura nenhuma. */
  frameOptOut?: boolean | null
}

/**
 * Monta a identidade do autor a partir das colunas `author_*` que posts,
 * comentários e reviews já carregam.
 *
 * **Use sempre isto em vez de montar o objeto inline.** Cada tela que
 * escrevia `author={{ userId, displayName, displaySlug }}` à mão deixava
 * tier e moldura de fora — e o avatar do fórum saía sem a moldura que a
 * pessoa equipou, enquanto o perfil dela a mostrava. Com um mapper só, um
 * campo novo (como a Moldura de Fundador) chega a todas as telas de uma vez.
 */
export function authorFrom(row: {
  user_id: string | null
  author_display_name: string
  author_display_slug: string | null
  author_account_tier?: string | null
  author_vip_expires_at?: string | null
  author_equipped_frame_slug?: string | null
  author_equipped_frame_url?: string | null
  author_is_founder?: boolean | null
  author_longest_streak?: number | null
  author_frame_opt_out?: boolean | null
}): AuthorIdentity {
  return {
    userId: row.user_id,
    displayName: row.author_display_name,
    displaySlug: row.author_display_slug,
    accountTier: row.author_account_tier ?? null,
    vipExpiresAt: row.author_vip_expires_at ?? null,
    frameSlug: row.author_equipped_frame_slug ?? null,
    frameUrl: row.author_equipped_frame_url ?? null,
    isFounder: row.author_is_founder ?? false,
    longestStreak: row.author_longest_streak ?? 0,
    frameOptOut: row.author_frame_opt_out ?? false,
  }
}

export function isRemovedAuthor(author: AuthorIdentity): boolean {
  return author.userId !== null && !author.displaySlug
}

export function AuthorAvatarLink({
  author,
  avatarUrl,
  size = "sm",
  side = "right",
  align = "start",
  className,
  onClick,
}: {
  author: AuthorIdentity
  avatarUrl: string | null
  size?: ProfileAvatarSize
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  className?: string
  onClick?: (event: React.MouseEvent) => void
}) {
  // Sem prop de VIP aqui: o sinal de VIP no avatar é a MOLDURA (`frame`), e
  // AGENTS.md pede um sinal só por avatar — um anel extra dobraria o sinal e
  // não seguiria a precedência (Fundador/equipada ganham do VIP).
  const removed = isRemovedAuthor(author)
  const avatar = (
    <ProfileAvatar
      name={author.displayName}
      avatarUrl={avatarUrl}
      size={size}
      removed={removed}
      frame={profileFrameOf({
        equippedFrameSlug: author.frameSlug,
        equippedFrameUrl: author.frameUrl,
        accountTier: author.accountTier,
        vipExpiresAt: author.vipExpiresAt,
        isFounder: author.isFounder,
        longestStreak: author.longestStreak,
        frameOptOut: author.frameOptOut,
      })}
    />
  )

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
  /** Flair de VIP no fórum: nome com o mesmo gradiente animado usado no título "Vantagens do VIP", em vez do texto padrão. */
  isVip = false,
}: {
  author: AuthorIdentity
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  className?: string
  onClick?: (event: React.MouseEvent) => void
  isVip?: boolean
}) {
  const removed = isRemovedAuthor(author)
  const label = removed ? "Usuário removido" : author.displayName

  return (
    <MiniProfileHoverCard slug={author.displaySlug} side={side} align={align}>
      {author.displaySlug ? (
        <Link
          href={profilePath(author.displaySlug)}
          onClick={onClick}
          className={cn("font-medium hover:underline", isVip ? "vip-badge-text" : "text-foreground", className)}
        >
          {label}
        </Link>
      ) : (
        <span
          onClick={onClick}
          className={cn(
            "font-medium",
            removed ? "text-destructive/90 italic" : isVip ? "vip-badge-text" : "text-foreground",
            className
          )}
        >
          {label}
        </span>
      )}
    </MiniProfileHoverCard>
  )
}
