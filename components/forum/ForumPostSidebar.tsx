import Image from "next/image"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Award, Eye, Flame, MessageCircle, MessagesSquare, Tag, User, Users } from "lucide-react"

import { UserAvatar } from "@/components/ui/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TIER_CAPABILITIES, type AccountTier } from "@/lib/account-tier"
import { getSpecialTag } from "@/lib/special-tag"
import { MEDAL_RARITY_STYLES } from "@/lib/profile-showcase"
import type { ProfileShowcase } from "@/lib/profile-showcase"
import type { ForumCategoryInfo, ForumSidebarData } from "@/lib/server/repositories/forum-repository"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"

function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(value)
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1).trimEnd() + "…"
}

/**
 * Sidebar estilo Reddit (card "r/comunidade") na página do post: mostra a
 * categoria do tópico, estatísticas gerais do fórum, o autor e outros
 * tópicos recentes da mesma categoria — tudo já resolvido no servidor,
 * sem fetch adicional no cliente.
 */
export function ForumPostSidebar({
  category,
  author,
  authorProfile,
  stats,
}: {
  category: ForumCategoryInfo | null
  author: {
    display_name: string
    avatar_url: string | null
    account_tier: AccountTier
    display_slug: string | null
  }
  /** Vitrine completa do autor (aura, seguidores, medalhas) — `null` em posts de convidado. */
  authorProfile: ProfileShowcase | null
  stats: ForumSidebarData
}) {
  const specialTag = getSpecialTag(author.display_slug)
  const categoryLabel = category ? (category.parent ? `${category.parent.name} / ${category.name}` : category.name) : null

  return (
    <aside className="lg:sticky lg:top-[var(--sticky-header-h)] lg:max-h-[calc(100vh-var(--sticky-header-h)-1rem)] lg:self-start lg:overflow-y-auto">
      <div className="space-y-4 pb-1">
      {/* Card da categoria — equivalente ao "r/keyboards" do Reddit */}
      <div className={cn("rounded-xl p-4", CARD_SURFACE)}>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Tag className="size-4 text-primary" />
          {categoryLabel ?? "Fórum Sunano"}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {categoryLabel
            ? `Discussões da comunidade sobre ${categoryLabel.toLowerCase()}.`
            : "Compartilhe dicas, tire dúvidas e discuta periféricos."}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-center">
          <div>
            <p className="text-lg font-bold text-foreground">{stats.totalPosts}</p>
            <p className="text-[11px] text-muted-foreground">Tópicos no fórum</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{stats.totalComments}</p>
            <p className="text-[11px] text-muted-foreground">Comentários</p>
          </div>
        </div>

        {category && (
          <Link
            href={`/forum/categoria/${category.slug}`}
            className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            Ver {stats.categoryPostCount} tópicos em {category.name}
          </Link>
        )}
      </div>

      {/* Autor — equivalente ao "USER FLAIR" do Reddit, com aura/seguidores/medalhas */}
      <div className={cn("rounded-xl p-4", CARD_SURFACE)}>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Autor</p>

        <Link
          href={author.display_slug ? `/perfil/${author.display_slug}` : "#"}
          className="mt-3 flex items-center gap-2.5 group"
        >
          <UserAvatar name={author.display_name} avatarUrl={author.avatar_url} size={9} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
              {author.display_name}
            </p>
            {(author.account_tier !== "common" || specialTag) && (
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                {author.account_tier !== "common" && (
                  <Badge variant="secondary" className="bg-amber-400/15 text-[10px] text-amber-400">
                    {TIER_CAPABILITIES[author.account_tier].label}
                  </Badge>
                )}
                {specialTag && (
                  <Badge variant="secondary" className="bg-cyan-400/15 text-[10px] text-cyan-400">
                    {specialTag.label}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </Link>

        {authorProfile && (
          <>
            {authorProfile.bio && (
              <p className="mt-3 line-clamp-2 text-xs leading-snug text-muted-foreground">{authorProfile.bio}</p>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
              <div>
                <p className="flex items-center justify-center gap-1 text-sm font-bold text-orange-400">
                  <span className="aura-stat-icon-holder inline-flex">
                    <Flame className="aura-stat-icon size-3" fill="currentColor" strokeWidth={1.5} />
                  </span>
                  {formatCount(authorProfile.aura)}
                </p>
                <p className="text-[10px] text-muted-foreground">Aura</p>
              </div>
              <div>
                <p className="flex items-center justify-center gap-1 text-sm font-bold text-foreground">
                  <Users className="size-3" />
                  {formatCount(authorProfile.followers)}
                </p>
                <p className="text-[10px] text-muted-foreground">Seguidores</p>
              </div>
              <div>
                <p className="flex items-center justify-center gap-1 text-sm font-bold text-foreground">
                  <Eye className="size-3" />
                  {formatCount(authorProfile.profile_views)}
                </p>
                <p className="text-[10px] text-muted-foreground">Visitas</p>
              </div>
            </div>

            {authorProfile.medals.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <Award className="size-3" />
                  {authorProfile.medals_total} medalha{authorProfile.medals_total === 1 ? "" : "s"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {authorProfile.medals.map((medal) => (
                    <Tooltip key={medal.id}>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex size-8 items-center justify-center rounded-lg border transition-transform hover:-translate-y-0.5 ${MEDAL_RARITY_STYLES[medal.rarity]}`}
                        >
                          {medal.icon_url ? (
                            <Image src={medal.icon_url} alt={medal.name} width={20} height={20} className="size-5 object-contain" />
                          ) : (
                            <Award className="size-4" />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold">{medal.name}</p>
                        {medal.description && (
                          <p className="text-xs text-muted-foreground">{medal.description}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {author.display_slug && (
          <Button asChild size="sm" variant="outline" className="mt-4 w-full gap-1.5 border-border">
            <Link href={`/perfil/${author.display_slug}`}>
              <User className="size-3.5" />
              Ver perfil
            </Link>
          </Button>
        )}
      </div>

      {/* Tópicos recentes da mesma categoria */}
      {stats.relatedPosts.length > 0 && (
        <div className={cn("rounded-xl p-4", CARD_SURFACE)}>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <MessagesSquare className="size-3.5" />
            Tópicos relacionados
          </div>
          <ul className="mt-3 space-y-3">
            {stats.relatedPosts.map((post) => (
              <li key={post.slug}>
                <Link href={`/forum/${post.slug}`} className="block group">
                  <p className="line-clamp-2 text-xs leading-snug text-foreground group-hover:text-primary">
                    {truncate(post.title, 90)}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{format(new Date(post.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
                    <span className="flex items-center gap-0.5">
                      <MessageCircle className="size-2.5" />
                      {post.comment_count}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href="/forum"
        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Users className="size-3.5" />
        Ver todo o fórum
      </Link>
      </div>
    </aside>
  )
}
