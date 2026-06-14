"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

import BoxLoader from "@/components/ui/box-loader"
import { SearchComponent, type SearchItem } from "@/components/ui/search-bar"
import { GlassBlogCard } from "@/components/ui/glass-blog-card-shadcnui"
import { getBlogImageWithFallback } from "@/lib/blog-images"
import { useLocale } from "@/components/providers/locale-context"
import { useT } from "@/lib/use-t"

type BlogPost = {
  id: string
  title: string
  slug: string
  author_id?: string | null
  excerpt: string | null
  cover_image_url: string | null
  cover_thumbnail_url: string | null
  read_time_minutes: number | null
  created_at: string
  admin_profiles?: { display_name: string | null; avatar_url: string | null; email: string | null } | null
  peripherals?: { id: string; name: string; brand: string }[] | null
}

function getDefaultAuthorName(email: string | null | undefined) {
  if (!email) return null
  const [localPart] = email.split("@")
  return localPart || null
}

function getArticleMeta(
  post: BlogPost,
  locale: "pt-BR" | "en-US",
  articleOnBlog: string,
  tagBlog: string,
  minRead: (count: number) => string,
) {
  const relatedPeripheral = Array.isArray(post.peripherals) ? post.peripherals[0] ?? null : null

  return {
    title: post.title,
    excerpt: post.excerpt ?? relatedPeripheral?.name ?? articleOnBlog,
    image: getBlogImageWithFallback(post.cover_thumbnail_url, post.cover_image_url, "thumbnail"),
    author: {
      name:
        post.admin_profiles?.display_name?.trim() ||
        getDefaultAuthorName(post.admin_profiles?.email) ||
        "Sunano",
      avatar: post.admin_profiles?.avatar_url || "https://github.com/shadcn.png",
    },
    date: new Date(post.created_at).toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    readTime: minRead(Math.max(1, post.read_time_minutes ?? 1)),
    tags: [relatedPeripheral?.brand ?? tagBlog].filter(Boolean),
  }
}

function BlogPageContent() {
  const { locale } = useLocale()
  const t = useT()
  const searchParams = useSearchParams()
  const peripheralFilter = searchParams.get("peripheral")

  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [filteredPosts, setFilteredPosts] = useState<BlogPost[]>([])

  useEffect(() => {
    loadPosts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peripheralFilter])

  useEffect(() => {
    setFilteredPosts(posts)
  }, [posts])

  async function loadPosts() {
    setLoading(true)

    try {
      // Os dados vêm do endpoint /api/blog (que delega ao repositório).
      // Nenhuma consulta ao Supabase é feita a partir do navegador.
      const query = peripheralFilter
        ? `?peripheral=${encodeURIComponent(peripheralFilter)}`
        : ""
      const res = await fetch(`/api/blog${query}`)
      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.posts) {
        throw new Error(data?.error ?? t.blog.failedToLoad)
      }

      const normalizedPosts = (data.posts as Array<Partial<BlogPost>>).map((post) => ({
        ...post,
        cover_thumbnail_url: post.cover_thumbnail_url ?? null,
        read_time_minutes: post.read_time_minutes ?? null,
      }))

      setPosts(normalizedPosts as BlogPost[])
    } catch (err) {
      console.error("Error loading blog posts:", err)
      setPosts([])
    } finally {
      setLoading(false)
    }
  }

  const handleFilteredDataChange = useCallback(
    (items: SearchItem[]) => {
      const nextPosts = items
        .map((item) => posts.find((post) => post.id === item.id))
        .filter((post): post is BlogPost => Boolean(post))

      setFilteredPosts(nextPosts)
    },
    [posts]
  )

  const searchData: SearchItem[] = useMemo(() => {
    return posts.map((post) => {
      const relatedPeripheral = Array.isArray(post.peripherals) ? post.peripherals[0] ?? null : null

      return {
        id: post.id,
        title: post.title,
        description: post.excerpt ?? relatedPeripheral?.name ?? t.blog.articleOnBlog,
        tags: [relatedPeripheral?.brand ?? t.blog.tagBlog].filter(Boolean),
        creator: relatedPeripheral?.brand ?? t.blog.tagBlog,
      }
    })
  }, [posts, t.blog.articleOnBlog, t.blog.tagBlog])

  const currentPosts = filteredPosts

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t.blog.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.blog.subtitle}
          </p>
        </div>
      </div>

      <SearchComponent
        data={searchData}
        placeholder={t.blog.searchPlaceholder}
        label={t.blog.sortLabel}
        onFilteredDataChange={handleFilteredDataChange}
      />

      {/* Posts Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-14">
          <BoxLoader />
        </div>
      ) :currentPosts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-muted-foreground">{t.blog.noArticles}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t.blog.comingSoon}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {currentPosts.map((post) => {
            const meta = getArticleMeta(post, locale, t.blog.articleOnBlog, t.blog.tagBlog, t.blog.minRead)

            return (
              <Link key={post.id} href={`/blog/${post.slug}`} className="block">
                <GlassBlogCard
                  className="max-w-none"
                  title={meta.title}
                  excerpt={meta.excerpt}
                  image={meta.image}
                  author={meta.author}
                  date={meta.date}
                  readTime={meta.readTime}
                  tags={meta.tags}
                />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function BlogPage() {
  const t = useT()

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
            <span>{t.blog.loading}</span>
          </div>
        </div>
      }
    >
      <BlogPageContent />
    </Suspense>
  )
}
