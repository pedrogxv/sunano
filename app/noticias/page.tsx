"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { Clock, MessageCircle, TrendingUp } from "lucide-react"
import { getBlogImageWithFallback } from "@/lib/blog-images"
import BoxLoader from "@/components/ui/box-loader"

type NewsPost = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  cover_thumbnail_url: string | null
  read_time_minutes: number | null
  created_at: string
  admin_profiles?: { display_name: string | null; avatar_url: string | null; email: string | null } | null
  peripherals?: { id: string; name: string; brand: string }[] | null
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img}
        alt={post.title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img}
          alt={post.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
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
        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground/70">
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
        </div>
      </div>
    </Link>
  )
}

function NoticiasPageContent() {
  const [posts, setPosts] = useState<NewsPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/blog")
      .then((r) => r.json())
      .then((d) => setPosts((d.posts ?? []) as NewsPost[]))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [])

  const trending = posts.slice(0, 5)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Notícias
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Atualizações, anúncios e novidades da Sunano em um só lugar.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <BoxLoader />
        </div>
      ) : posts.length === 0 ? (
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

export default function NoticiasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
            <span>Carregando notícias...</span>
          </div>
        </div>
      }
    >
      <NoticiasPageContent />
    </Suspense>
  )
}
