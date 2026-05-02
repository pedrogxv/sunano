"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

import { SearchComponent, type SearchItem } from "@/components/ui/search-bar"
import { GlassBlogCard } from "@/components/ui/glass-blog-card-shadcnui"
import { supabase } from "@/lib/supabase"
import { PublicSidebar } from "@/components/layout/PublicSidebar"
import { getBlogImageWithFallback } from "@/lib/blog-images"
import { useLocale } from "@/lib/locale-context"

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

function getArticleMeta(post: BlogPost, locale: "pt-BR" | "en-US") {
  const relatedPeripheral = Array.isArray(post.peripherals) ? post.peripherals[0] ?? null : null
  const isEnglish = locale === "en-US"

  return {
    title: post.title,
    excerpt: post.excerpt ?? relatedPeripheral?.name ?? (isEnglish ? "Article published on the blog" : "Artigo publicado no blog"),
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
    readTime: `${Math.max(1, post.read_time_minutes ?? 1)} min read`,
    tags: [relatedPeripheral?.brand ?? "Blog"].filter(Boolean),
  }
}

function BlogPageContent() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
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

  // Load author data for posts that don't have it
  useEffect(() => {
    const postsNeedingAuthors = posts.filter((p) => p.author_id && !p.admin_profiles)

    if (postsNeedingAuthors.length === 0) return

    async function loadAuthors() {
      const authorIds = [...new Set(postsNeedingAuthors.map((p) => p.author_id).filter(Boolean))]

      const { data: authorsData } = await supabase
        .from("admin_profiles")
        .select("id, display_name, avatar_url, email")
        .in("id", authorIds)

      if (authorsData) {
        const authorsMap = new Map(authorsData.map((a) => [a.id, a]))

        setPosts((prevPosts) =>
          prevPosts.map((post) =>
            post.author_id && !post.admin_profiles
              ? { ...post, admin_profiles: authorsMap.get(post.author_id) || null }
              : post
          )
        )
      }
    }

    loadAuthors()
  }, [posts])

  async function loadPosts() {
    setLoading(true)

    // Build base query
    let baseQuery = supabase
      .from("blog_posts")
      .select(
        "id, title, slug, author_id, excerpt, cover_image_url, cover_thumbnail_url, read_time_minutes, created_at, peripherals(id, name, brand)"
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false })

    if (peripheralFilter) {
      baseQuery = baseQuery.eq("peripheral_id", peripheralFilter)
    }

    const { data, error } = await baseQuery

    if (error) {
      console.error("Error loading blog posts:", error)
      setPosts([])
      setLoading(false)
      return
    }

    const normalizedPosts = ((data ?? []) as Array<Partial<BlogPost>>).map((post) => ({
      ...post,
      cover_thumbnail_url: post.cover_thumbnail_url ?? null,
      read_time_minutes: post.read_time_minutes ?? null,
    }))

    setPosts(normalizedPosts as BlogPost[])
    setLoading(false)
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
        description: post.excerpt ?? relatedPeripheral?.name ?? (isEnglish ? "Article published on the blog" : "Artigo publicado no blog"),
        tags: [relatedPeripheral?.brand ?? "Blog"].filter(Boolean),
        creator: relatedPeripheral?.brand ?? "Blog",
      }
    })
  }, [posts])

  const currentPosts = filteredPosts

  return (
    <div className="min-h-screen bg-background text-foreground flex pt-16">
      {/* Sidebar */}
      <div className="hidden md:flex md:sticky md:top-16 md:h-[calc(100vh-64px)] md:shrink-0">
        <PublicSidebar />
      </div>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 lg:px-8 space-y-6">
          {/* Header */}
          <div className="space-y-4">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Reviews
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isEnglish
                  ? "Articles, full reviews, and detailed analysis of tierlist peripherals."
                  : "Artigos, reviews completos e analises detalhadas dos periféricos da tierlist."}
              </p>
            </div>
          </div>

          <SearchComponent
            data={searchData}
            placeholder={isEnglish ? "Search blog..." : "Buscar no blog..."}
            label="Sort by"
            onFilteredDataChange={handleFilteredDataChange}
          />

          {/* Posts Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
                <span>{isEnglish ? "Loading articles..." : "Carregando artigos..."}</span>
              </div>
            </div>
          ) : currentPosts.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <p className="text-muted-foreground">{isEnglish ? "No articles found." : "Nenhum artigo encontrado."}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {isEnglish ? "New reviews and analysis will be published soon." : "Novos reviews e analises serao publicados em breve."}
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {currentPosts.map((post) => {
                const meta = getArticleMeta(post, locale)

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
      </main>

      {/* Mobile Sidebar */}
      <div className="md:hidden">
        <PublicSidebar />
      </div>
    </div>
  )
}

export default function BlogPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
            <span>Loading blog...</span>
          </div>
        </div>
      }
    >
      <BlogPageContent />
    </Suspense>
  )
}
