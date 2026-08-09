import type { ReactNode } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Clock, MessageCircle, Newspaper } from "lucide-react"

import { getBlogImageWithFallback } from "@/lib/blog-images"
import { truncateExcerpt } from "@/lib/blog-excerpt"
import { extractFirstUrl } from "@/lib/extract-link"
import { getVideoEmbedUrl } from "@/lib/video-embed"
import { listPublishedPosts, type BlogListPost } from "@/lib/server/repositories/blog-repository"
import { PersonAvatar } from "@/components/people/PersonAvatar"
import { RoleBadge } from "@/components/people/RoleBadge"
import { NewNewsButton } from "./new-news-button"

// ISR: renderizado no servidor e revalidado em background, sem o fetch
// client-side que exibia um spinner a cada acesso.
export const revalidate = 30

// Quantas notícias entram no header de manchetes — controlado manualmente
// pelo toggle "Destacar no header" em /admin/blog.
const MAX_HEADLINES = 3

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d atrás`
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function getAuthorName(post: BlogListPost) {
  const name = post.admin_profiles?.display_name?.trim()
  if (name) return name
  const email = post.admin_profiles?.email
  if (email) return email.split("@")[0]
  return "Sunano"
}

/** Para onde o clique no card deve levar: o link citado no texto, se houver, senão a própria notícia. */
function getHeadlineHref(post: BlogListPost) {
  const linkInText = extractFirstUrl(post.excerpt)
  if (linkInText) return { href: linkInText, external: true as const }
  return { href: `/noticias/${post.slug}`, external: false as const }
}

/**
 * Autor com foto de perfil real. O avatar/GIF VIP vem do perfil público
 * (`author_profile`, ligado a `user_profiles`) quando existe; o cargo
 * (Admin/Moderador/WEB Master) vem sempre de `admin_profiles.role`.
 */
function AuthorByline({ post, size = "sm" }: { post: BlogListPost; size?: "xs" | "sm" | "md" }) {
  const name = getAuthorName(post)
  const avatarProfile = {
    display_name: name,
    avatar_url: post.author_profile?.avatar_url ?? post.admin_profiles?.avatar_url ?? null,
    account_tier: post.author_profile?.account_tier ?? ("common" as const),
    display_slug: post.author_profile?.display_slug ?? null,
  }
  const role = post.admin_profiles?.role

  return (
    <div className="flex items-center gap-2 min-w-0">
      <PersonAvatar profile={avatarProfile} size={size} />
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
        <span className="text-xs font-medium text-foreground truncate">{name}</span>
        {role && <RoleBadge role={role} className="h-4 px-1.5 text-[9px]" />}
      </div>
    </div>
  )
}

function HeadlineCard({ post }: { post: BlogListPost }) {
  const img = getBlogImageWithFallback(post.cover_image_url, post.cover_thumbnail_url, "header")
  const embedUrl = getVideoEmbedUrl(post.video_url)
  const { href, external } = getHeadlineHref(post)
  const excerpt = post.excerpt ? truncateExcerpt(post.excerpt) : null

  const media = embedUrl ? (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      <iframe
        src={embedUrl}
        title={post.title}
        className="size-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  ) : (
    <div className="relative aspect-video w-full overflow-hidden bg-muted/30">
      <Image
        src={img}
        alt={post.title}
        fill
        sizes="(min-width: 768px) 768px, 100vw"
        priority
        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
    </div>
  )

  const body = (
    <div className="space-y-3 p-4 sm:p-5">
      <h2 className="font-display text-xl font-bold leading-tight text-foreground transition-colors group-hover:text-primary sm:text-2xl">
        {post.title}
      </h2>
      {excerpt && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{excerpt.text}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <AuthorByline post={post} size="md" />
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground/70">
          <span>{timeAgo(post.created_at)}</span>
          <span className="flex items-center gap-1">
            <MessageCircle className="size-3" />
            {post.comment_count ?? 0}
          </span>
        </div>
      </div>
    </div>
  )

  const cardClass =
    "group overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-colors hover:border-primary/30 hover:bg-card"

  const linkWrap = (children: ReactNode) =>
    external ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {children}
      </a>
    ) : (
      <Link href={href} className="block">
        {children}
      </Link>
    )

  return (
    <div className={cardClass}>
      {/* O player de vídeo é interativo — fica fora do link pra tocar sem navegar. */}
      {embedUrl && media}
      {linkWrap(
        <>
          {!embedUrl && media}
          {body}
        </>
      )}
      {/* "Ler mais" fica fora do link do card: quando o texto cita uma URL o card
          leva pra ela, mas a notícia completa continua acessível aqui. */}
      {excerpt?.truncated && (
        <div className="border-t border-border/40 px-4 py-3 sm:px-5">
          <Link
            href={`/noticias/${post.slug}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
          >
            Ler mais
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  )
}

function NewsListItem({ post }: { post: BlogListPost }) {
  const img = getBlogImageWithFallback(post.cover_thumbnail_url, post.cover_image_url, "thumbnail")
  const tag = post.peripherals?.[0]?.brand ?? null

  return (
    <Link
      href={`/noticias/${post.slug}`}
      className="group flex gap-3 rounded-xl border border-border/50 bg-card/50 p-3 transition-colors hover:border-primary/30 hover:bg-card"
    >
      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-32 h-20 rounded-lg overflow-hidden bg-muted/30">
        <Image
          src={img}
          alt={post.title}
          fill
          sizes="128px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          {tag && (
            <span className="inline-block mb-1 text-[10px] font-bold uppercase tracking-wide text-primary/70">
              {tag}
            </span>
          )}
          <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
            {post.title}
          </h3>
          {post.excerpt && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{post.excerpt}</p>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/70">
          <AuthorByline post={post} size="xs" />
          <span>•</span>
          <span>{timeAgo(post.created_at)}</span>
          {post.read_time_minutes && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {post.read_time_minutes} min
              </span>
            </>
          )}
          <span>•</span>
          <span className="flex items-center gap-1">
            <MessageCircle className="size-3" />
            {post.comment_count ?? 0}
          </span>
        </div>
      </div>
    </Link>
  )
}

export default async function NoticiasPage() {
  const posts = await listPublishedPosts(null)

  // Manchetes: escolhidas manualmente no admin (toggle "Destacar no
  // header"), limitadas a 3 — as mais recentes primeiro em caso de empate.
  const headlines = posts.filter((p) => p.is_featured).slice(0, MAX_HEADLINES)
  const headlineIds = new Set(headlines.map((p) => p.id))
  // Evita repetir na lista de baixo a mesma notícia já exibida como manchete.
  const rest = posts.filter((p) => !headlineIds.has(p.id))

  return (
    <div className="mx-auto max-w-3xl px-2 py-8 sm:px-4 md:px-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Notícias
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Atualizações, anúncios e novidades da Sunano em um só lugar.
          </p>
        </div>
        <NewNewsButton />
      </div>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-muted-foreground">Nenhuma notícia encontrada.</p>
        </div>
      ) : (
        <>
          {/* Manchetes */}
          {headlines.length > 0 && (
            <section className="space-y-4">
              {headlines.map((post) => (
                <HeadlineCard key={post.id} post={post} />
              ))}
            </section>
          )}

          {/* Notícias */}
          {rest.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Newspaper className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Notícias
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                {rest.map((post) => (
                  <NewsListItem key={post.id} post={post} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
