import Link from "next/link"
import Image from "next/image"
import { Clock, MessageCircle, TrendingUp } from "lucide-react"

import { getBlogImageWithFallback } from "@/lib/blog-images"
import { listPublishedPosts } from "@/lib/server/repositories/blog-repository"
import { NewNewsButton } from "./new-news-button"

// ISR: renderizado no servidor e revalidado em background, sem o fetch
// client-side que exibia um spinner a cada acesso.
export const revalidate = 30

type NewsPost = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  cover_thumbnail_url: string | null
  read_time_minutes: number | null
  created_at: string
  comment_count?: number
  admin_profiles?: { display_name: string | null; avatar_url: string | null; email: string | null } | null
  peripherals?: { id?: string; name: string; brand: string }[] | null
}

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

function getAuthorName(post: NewsPost) {
  const name = post.admin_profiles?.display_name?.trim()
  if (name) return name
  const email = post.admin_profiles?.email
  if (email) return email.split("@")[0]
  return "Sunano"
}

function TrendingCard({ post }: { post: NewsPost }) {
  const img = getBlogImageWithFallback(post.cover_thumbnail_url, post.cover_image_url, "header")
  return (
    <Link
      href={`/noticias/${post.slug}`}
      className="group relative flex-shrink-0 w-44 h-28 rounded-xl overflow-hidden border border-border/50 block"
    >
      <Image
        src={img}
        alt={post.title}
        fill
        sizes="176px"
        className="object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-white text-[11px] font-semibold leading-tight line-clamp-2">{post.title}</p>
      </div>
    </Link>
  )
}

function NewsListItem({ post }: { post: NewsPost }) {
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
          <span>{getAuthorName(post)}</span>
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
  const posts = (await listPublishedPosts(null)) as NewsPost[]

  // "Em Alta": prioriza engajamento (mais comentadas), com a recência como
  // critério de desempate.
  const trending = [...posts]
    .sort((a, b) => {
      const byComments = (b.comment_count ?? 0) - (a.comment_count ?? 0)
      if (byComments !== 0) return byComments
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    .slice(0, 5)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 space-y-8">
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
          {/* Em Alta */}
          {trending.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="size-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Em Alta
                </h2>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
                {trending.map((post) => (
                  <TrendingCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          )}

          {/* News feed */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Notícias
              </h2>
            </div>
            <div className="flex flex-col gap-2">
              {posts.map((post) => (
                <NewsListItem key={post.id} post={post} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
