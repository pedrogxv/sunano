"use client"

import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Crown, EyeOff, Flame, Lock, MessageCircle, Pin, Sparkles } from "lucide-react"

import { CategoryBadge } from "@/components/forum/CategoryBadge"
import { PostVisibilityButton } from "@/components/forum/PostVisibilityButton"
import { PostDeleteButton } from "@/components/forum/PostDeleteButton"
import { ImageLightbox } from "@/components/forum/ImageLightbox"
import { ReportMenu } from "@/components/forum/ReportMenu"
import { ShareMenu } from "@/components/forum/ShareMenu"
import { MiniProfileHoverCard } from "@/components/profile/MiniProfileHoverCard"
import { CommentBody } from "@/components/comments/CommentBody"
import { UserAvatar } from "@/components/ui/user-avatar"
import { TIER_CAPABILITIES, type AccountTier } from "@/lib/account-tier"
import { getSpecialTag } from "@/lib/special-tag"
import type { ForumCategoryInfo } from "@/lib/server/repositories/forum-repository"

export type PostCardData = {
  id: string
  slug: string
  title: string
  body: string | null
  user_id: string | null
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  author_display_slug: string | null
  category: ForumCategoryInfo | null
  media_image_urls: string[]
  media_video_url: string | null
  created_at: string
  is_locked: boolean
  is_pinned: boolean
  /** `true` só é relevante na aba "Meus Posts" — nas demais listagens públicas o post oculto nem chega aqui. */
  is_hidden?: boolean
  comment_count: number
  /** Somatório da aura de todos os comentários do post (denormalizado). */
  aura_count: number
}

/** Selo de VIP/VIP+ ao lado do nome do autor — mesmo rótulo do tier usado no perfil. */
export function AuthorTierBadge({ tier }: { tier: AccountTier }) {
  if (tier === "common") return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${
        tier === "vip_plus" ? "bg-fuchsia-400/15 text-fuchsia-400" : "bg-amber-400/15 text-amber-400"
      }`}
    >
      <Crown className="size-2.5" />
      {TIER_CAPABILITIES[tier].label}
    </span>
  )
}

/** Selo de tag especial (ex: SUNANO) — aglutina com `AuthorTierBadge` ao lado do nome. */
export function AuthorSpecialTagBadge({ slug }: { slug: string | null }) {
  const tag = getSpecialTag(slug)
  if (!tag) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium bg-cyan-400/15 text-cyan-400`}>
      <Sparkles className="size-2.5" />
      {tag.label}
    </span>
  )
}

function extractYoutubeId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1) || null
    return parsed.searchParams.get("v")
  } catch {
    return null
  }
}

/**
 * Card de post no estilo Reddit/Twitter: avatar + autor + tempo, texto
 * corrido (sem título separado), mídia opcional, rodapé com Comentários /
 * Compartilhar. Usado tanto na listagem quanto no cabeçalho da página de
 * post individual.
 *
 * Post não tem like/dislike: a aura de postar (+10, 1x/dia) é creditada na
 * criação e independe de reação — a ideia é incentivar quem posta, não
 * julgar o post. Reagir só existe em comentário (ver `AuraButton`).
 */
export function PostCard({
  post,
  clickable = true,
  compact = true,
  currentUserId = null,
  onOwnPostVisibilityChange,
  onOwnPostDeleted,
}: {
  post: PostCardData
  clickable?: boolean
  compact?: boolean
  /** Id do usuário logado — quando bate com `post.user_id`, mostra os botões de ocultar/excluir. */
  currentUserId?: string | null
  /** Quando definido, o botão de ocultar não navega — deixa o chamador atualizar a lista. */
  onOwnPostVisibilityChange?: (slug: string, hidden: boolean) => void
  /** Quando definido, o botão de excluir não navega — deixa o chamador remover o post da lista. */
  onOwnPostDeleted?: (slug: string) => void
}) {
  const isOwner = Boolean(currentUserId) && post.user_id === currentUserId
  const youtubeId = post.media_video_url ? extractYoutubeId(post.media_video_url) : null

  return (
    <div
      className={`group relative rounded-xl border bg-card transition-all ${
        clickable ? "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20" : ""
      } ${post.is_hidden ? "opacity-60" : ""} ${
        post.is_pinned
          ? "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/15 hover:border-primary/60"
          : "border-border hover:border-border/70"
      }`}
    >
      {clickable && (
        <Link href={`/forum/${post.slug}`} aria-label="Ver post" className="absolute inset-0 z-0 rounded-xl" />
      )}

      <div className={`relative z-10 flex items-start gap-3 p-4 ${clickable ? "pointer-events-none" : ""}`}>
        {/* `pointer-events-auto` reabre o hover: quando o card inteiro é
            clicável, a camada acima o desliga para o link de fundo receber o
            clique — mas a foto do autor precisa continuar reagindo ao cursor
            para abrir o Mini Perfil. */}
        <MiniProfileHoverCard slug={post.author_display_slug} side="right" align="start">
          <span className="pointer-events-auto shrink-0">
            <UserAvatar name={post.author_display_name} avatarUrl={post.author_avatar_url} size={9} />
          </span>
        </MiniProfileHoverCard>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{post.author_display_name}</span>
            <AuthorTierBadge tier={post.author_account_tier} />
            <AuthorSpecialTagBadge slug={post.author_display_slug} />
            <span>·</span>
            <span>{format(new Date(post.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
            {post.is_pinned && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Pin className="size-2.5" />
                Fixado
              </span>
            )}
            {post.is_hidden && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <EyeOff className="size-2.5" />
                Oculto
              </span>
            )}
            {post.is_locked && <Lock className="size-3 text-amber-500" />}
            <CategoryBadge category={post.category} linked={!clickable} />
          </div>

          <p className={`mt-2 font-semibold text-foreground ${compact ? "line-clamp-2" : ""}`}>
            {post.title}
          </p>

          {!compact && post.body && (
            <CommentBody body={post.body} className="mt-1 text-muted-foreground" />
          )}

          {post.media_image_urls.length > 0 && (
            <ImageLightbox
              srcs={post.media_image_urls}
              alt={`Imagem do post de ${post.author_display_name}${post.category ? ` sobre ${post.category.name}` : ""}`}
            />
          )}

          {youtubeId && (
            <div className="relative z-10 mt-3 aspect-video overflow-hidden rounded-lg border border-border/50 pointer-events-auto">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}`}
                title="Vídeo do post"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="size-full"
              />
            </div>
          )}

          <div className="relative z-10 mt-3 flex items-center gap-2 pointer-events-auto">
            <span
              title="Aura acumulada nos comentários deste post"
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-orange-500"
            >
              <span className="aura-stat-icon-holder inline-flex">
                <Flame className="aura-stat-icon size-4 text-orange-500" fill="currentColor" strokeWidth={1.5} />
              </span>
              {post.aura_count}
            </span>
            <Link
              href={clickable ? `/forum/${post.slug}#comments` : "#comments"}
              onClick={(event) => event.stopPropagation()}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <MessageCircle className="size-3.5" />
              {post.comment_count}
            </Link>
            <ShareMenu slug={post.slug} title={post.title} />
            {isOwner ? (
              <>
                <PostVisibilityButton
                  postSlug={post.slug}
                  isHidden={Boolean(post.is_hidden)}
                  onChanged={onOwnPostVisibilityChange}
                />
                <PostDeleteButton postSlug={post.slug} onDeleted={onOwnPostDeleted} />
              </>
            ) : (
              <ReportMenu postSlug={post.slug} targetType="post" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
