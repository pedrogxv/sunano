"use client"

import Image from "next/image"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Lock, MessageCircle, Pin, Share2 } from "lucide-react"

import { AuraButton } from "@/components/forum/AuraButton"
import { CategoryBadge } from "@/components/forum/CategoryBadge"
import { UserAvatar } from "@/components/ui/user-avatar"
import type { ForumCategoryInfo } from "@/lib/server/repositories/forum-repository"

export type PostCardData = {
  id: string
  slug: string
  body: string
  author_display_name: string
  author_avatar_url: string | null
  category: ForumCategoryInfo | null
  media_image_url: string | null
  media_video_url: string | null
  created_at: string
  is_locked: boolean
  is_pinned: boolean
  aura_count: number
  comment_count: number
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

async function shareLink(slug: string) {
  const url = `${window.location.origin}/forum/${slug}`
  if (navigator.share) {
    try {
      await navigator.share({ url })
    } catch {
      // usuário cancelou o compartilhamento — nada a fazer
    }
  } else {
    await navigator.clipboard.writeText(url)
  }
}

/**
 * Card de post no estilo Reddit/Twitter: avatar + autor + tempo, texto
 * corrido (sem título separado), mídia opcional, rodapé com Aura /
 * Comentários / Compartilhar. Usado tanto na listagem quanto no cabeçalho
 * da página de post individual.
 */
export function PostCard({
  post,
  auraGiven,
  auraDisabled,
  onToggleAura,
  clickable = true,
  compact = true,
}: {
  post: PostCardData
  auraGiven: boolean
  auraDisabled: boolean
  onToggleAura: () => void
  clickable?: boolean
  compact?: boolean
}) {
  const youtubeId = post.media_video_url ? extractYoutubeId(post.media_video_url) : null

  return (
    <div
      className={`group relative rounded-xl border bg-card transition-all ${
        clickable ? "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20" : ""
      } ${
        post.is_pinned
          ? "border-primary/30 bg-primary/[0.03] hover:border-primary/50"
          : "border-border hover:border-border/70"
      }`}
    >
      {post.is_pinned && (
        <div className="absolute -top-px left-0 right-0 h-px rounded-t-xl bg-gradient-to-r from-primary/60 via-primary/30 to-transparent" />
      )}

      {clickable && (
        <Link href={`/forum/${post.slug}`} aria-label="Ver post" className="absolute inset-0 z-0 rounded-xl" />
      )}

      <div className={`relative z-10 flex items-start gap-3 p-4 ${clickable ? "pointer-events-none" : ""}`}>
        {/* Coluna de Aura — lateralizada à esquerda, no lugar da antiga coluna de voto */}
        <div className="relative z-10 pointer-events-auto">
          <AuraButton
            auraCount={post.aura_count}
            given={auraGiven}
            disabled={auraDisabled}
            onToggle={onToggleAura}
            orientation="vertical"
          />
        </div>

        <UserAvatar name={post.author_display_name} avatarUrl={post.author_avatar_url} size={9} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{post.author_display_name}</span>
            <span>·</span>
            <span>{format(new Date(post.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
            {post.is_pinned && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Pin className="size-2.5" />
                Fixado
              </span>
            )}
            {post.is_locked && <Lock className="size-3 text-amber-500" />}
            <CategoryBadge category={post.category} />
          </div>

          <p
            className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground ${
              compact ? "line-clamp-4" : ""
            }`}
          >
            {post.body}
          </p>

          {post.media_image_url && (
            <div className="relative z-10 mt-3 overflow-hidden rounded-lg border border-border/50">
              <Image
                src={post.media_image_url}
                alt=""
                width={640}
                height={400}
                unoptimized
                className="max-h-[420px] w-full object-cover"
              />
            </div>
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
            <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
              <MessageCircle className="size-3.5" />
              {post.comment_count}
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                shareLink(post.slug)
              }}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Share2 className="size-3.5" />
              Compartilhar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
