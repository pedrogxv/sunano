import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { Clock, MessageCircle, Newspaper } from "lucide-react"

import { getBlogImageWithFallback } from "@/lib/blog-images"
import { extractFirstUrl } from "@/lib/extract-link"
import { getVideoEmbedUrl } from "@/lib/video-embed"
import { listPublishedPosts, type BlogListPost } from "@/lib/server/repositories/blog-repository"
import { PersonAvatar } from "@/components/people/PersonAvatar"
import { RoleBadge } from "@/components/people/RoleBadge"
import { MiniProfileHoverCard } from "@/components/profile/MiniProfileHoverCard"
import { profilePath } from "@/lib/profile-name"
import { NewNewsButton } from "./new-news-button"

// ISR: renderizado no servidor e revalidado em background, sem o fetch
// client-side que exibia um spinner a cada acesso.
export const revalidate = 120

// Sem isto a página herdava título e canonical da home, então o Google via
// duas URLs distintas se declarando a mesma página e indexava só uma.
export const metadata: Metadata = {
  title: "Notícias",
  description:
    "As últimas notícias do mundo dos periféricos gamers: lançamentos, novidades de marcas e o que está movimentando a comunidade.",
  alternates: { canonical: "/noticias" },
  openGraph: {
    title: "Notícias Sunano",
    description:
      "As últimas notícias do mundo dos periféricos gamers: lançamentos, novidades de marcas e o que está movimentando a comunidade.",
    url: "/noticias",
    type: "website",
  },
}

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
  const slug = avatarProfile.display_slug

  return (
    <div className="flex items-center gap-2 min-w-0">
      <MiniProfileHoverCard slug={slug} side="right" align="start">
        {slug ? (
          <Link href={profilePath(slug)} className="relative z-20 shrink-0">
            <PersonAvatar profile={avatarProfile} size={size} />
          </Link>
        ) : (
          <PersonAvatar profile={avatarProfile} size={size} />
        )}
      </MiniProfileHoverCard>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
        <MiniProfileHoverCard slug={slug} side="right" align="start">
          {slug ? (
            <Link
              href={profilePath(slug)}
              className="relative z-20 text-xs font-medium text-foreground truncate hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="text-xs font-medium text-foreground truncate">{name}</span>
          )}
        </MiniProfileHoverCard>
        {role && <RoleBadge role={role} className="h-4 px-1.5 text-[9px]" />}
      </div>
    </div>
  )
}

function HeadlineCard({ post }: { post: BlogListPost }) {
  const img = getBlogImageWithFallback(post.cover_image_url, post.cover_thumbnail_url, "header")
  const embedUrl = getVideoEmbedUrl(post.video_url)
  const { href, external } = getHeadlineHref(post)

  const media = embedUrl ? (
    // z-20: fica acima do link "esticado" do card pra continuar interativo (tocar sem navegar).
    <div className="relative z-20 aspect-video w-full overflow-hidden bg-black">
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

  const cardClass =
    "group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-colors hover:border-primary/30 hover:bg-card"

  // Link "esticado" cobrindo o card inteiro (evita <a> aninhado dentro do
  // link de comentários). z-10: fica abaixo do vídeo e do link de comentários,
  // que têm z-20 e continuam clicáveis separadamente por cima.
  const cardLink = external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute inset-0 z-10"
      aria-label={post.title}
    />
  ) : (
    <Link href={href} className="absolute inset-0 z-10" aria-label={post.title} />
  )

  return (
    <div className={cardClass}>
      {/* O card inteiro é clicável e leva pro post (ou pro link externo
          configurado na notícia). Comentários e vídeo ficam por cima
          (z-20) pra continuarem clicáveis/interativos sem conflitar. */}
      {cardLink}
      {media}
      <div className="space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-bold leading-tight sm:text-2xl text-foreground transition-colors group-hover:text-primary">
          {post.title}
        </h2>
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{post.content}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <AuthorByline post={post} size="md" />
          {/* Sempre leva pros comentários, mesmo quando o resto do card leva
              pro link externo configurado na notícia. Área de toque maior
              (padding + ícone/texto maiores) pra facilitar o clique no mobile. */}
          <Link
            href={`/noticias/${post.slug}#comments`}
            className="relative z-20 -m-2 flex shrink-0 items-center gap-3 rounded-full px-3 py-2 text-xs text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-primary"
          >
            <span>{timeAgo(post.created_at)}</span>
            <span className="flex items-center gap-1.5">
              <MessageCircle className="size-4" />
              {post.comment_count ?? 0}
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function NewsListItem({ post }: { post: BlogListPost }) {
  const img = getBlogImageWithFallback(post.cover_thumbnail_url, post.cover_image_url, "thumbnail")
  const tag = post.peripherals?.[0]?.brand ?? null

  return (
    <div className="group relative flex gap-3 rounded-xl border border-border/50 bg-card/50 p-3 transition-colors hover:border-primary/30 hover:bg-card">
      {/* Link "esticado" cobrindo o item inteiro — o autor precisa de z-20 por
          cima pra continuar levando pro perfil em vez do post (mesmo padrão do HeadlineCard). */}
      <Link href={`/noticias/${post.slug}`} className="absolute inset-0 z-10" aria-label={post.title} />

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
    </div>
  )
}

export default async function NoticiasPage() {
  // Só posts do tipo "news" — reviews (post_type "review") pertencem a /blog.
  const posts = await listPublishedPosts(null, "news")

  // Manchetes: escolhidas manualmente no admin (toggle "Destacar no
  // header"), limitadas a 3 — as mais recentes primeiro em caso de empate.
  // Sem nenhuma marcada, cai pra manchete automática com as mais recentes —
  // assim a página nunca fica presa no formato compacto por padrão.
  const featured = posts.filter((p) => p.is_featured).slice(0, MAX_HEADLINES)
  const headlines = featured.length > 0 ? featured : posts.slice(0, MAX_HEADLINES)
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
