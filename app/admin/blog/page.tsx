"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { Plus, Pencil, Trash2, Search, Eye, FileText, BookOpen, Newspaper, Mouse } from "lucide-react"
import { toast } from "sonner"

import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/use-t"

type BlogPost = {
  id: string
  title: string
  slug: string
  post_type?: "news" | "review"
  excerpt: string | null
  cover_thumbnail_url: string | null
  cover_image_url: string | null
  is_published: boolean
  created_at: string
  peripherals?: { name: string; brand: string }[] | null
}

type FilterTab = "all" | "published" | "draft"
type TypeTab = "all" | "news" | "review"

export default function AdminBlogPage() {
  const t = useT()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<FilterTab>("all")
  const [typeTab, setTypeTab] = useState<TypeTab>("all")

  useEffect(() => {
    loadPosts()
  }, [])

  async function loadPosts() {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch("/api/admin/blog/posts", { cache: "no-store" })
      const data = (await res.json().catch(() => null)) as { posts?: BlogPost[]; error?: string } | null
      if (!res.ok || !data?.posts) {
        throw new Error(data?.error ?? t.admin.blog.failedToLoad)
      }
      setPosts(data.posts)
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.blog.failedToLoad
      setError(message)
      toast.error(t.admin.blog.failedToLoad, { description: message })
    } finally {
      setLoading(false)
    }
  }

  async function removePost(id: string) {
    if (!confirm(t.admin.blog.confirmDelete)) return

    const target = posts.find((p) => p.id === id)
    const res = await fetch(`/api/admin/blog/posts/${id}`, { method: "DELETE" })
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    if (!res.ok) {
      const message = data?.error ?? t.admin.blog.failedToDelete
      setError(message)
      toast.error(t.admin.blog.failedToDelete, { description: message })
      return
    }

    setPosts((prev) => prev.filter((post) => post.id !== id))
    toast.success(t.admin.blog.articleDeleted, {
      description: target?.title,
    })
  }

  const stats = useMemo(() => ({
    total: posts.length,
    published: posts.filter((p) => p.is_published).length,
    drafts: posts.filter((p) => !p.is_published).length,
    news: posts.filter((p) => p.post_type === "news").length,
    reviews: posts.filter((p) => p.post_type !== "news").length,
  }), [posts])

  const filtered = useMemo(() => {
    let result = posts
    if (typeTab === "news") result = result.filter((p) => p.post_type === "news")
    if (typeTab === "review") result = result.filter((p) => p.post_type !== "news")
    if (activeTab === "published") result = result.filter((p) => p.is_published)
    if (activeTab === "draft") result = result.filter((p) => !p.is_published)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (Array.isArray(p.peripherals) && p.peripherals[0] && `${p.peripherals[0].brand} ${p.peripherals[0].name}`.toLowerCase().includes(q))
      )
    }
    return result
  }, [posts, activeTab, typeTab, search])

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: t.common.all, count: stats.total },
    { key: "published", label: t.admin.blog.published, count: stats.published },
    { key: "draft", label: t.admin.blog.drafts, count: stats.drafts },
  ]

  const typeTabs: { key: TypeTab; label: string; count: number }[] = [
    { key: "all", label: t.common.all, count: stats.total },
    { key: "news", label: t.admin.blog.news, count: stats.news },
    { key: "review", label: t.admin.blog.reviews, count: stats.reviews },
  ]

  usePageHeader(t.admin.blog.pageTitle, t.admin.blog.pageDescription)

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Link href="/admin/blog/new?type=news">
          <Button variant="outline" className="gap-2">
            <Plus className="size-4" />
            {t.admin.blog.newNews}
          </Button>
        </Link>
        <Link href="/admin/blog/new?type=review">
          <Button className="gap-2">
            <Plus className="size-4" />
            {t.admin.blog.newReview}
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <BookOpen className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <Newspaper className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.news}</p>
              <p className="text-xs text-muted-foreground">{t.admin.blog.news}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <Mouse className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.reviews}</p>
              <p className="text-xs text-muted-foreground">{t.admin.blog.reviews}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {error ? (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      ) : null}

      {/* Type filter */}
      <div className="flex rounded-lg border border-border bg-card p-1">
        {typeTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setTypeTab(tab.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              typeTab === tab.key
                ? "bg-accent text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.key === "news" && <Newspaper className="size-3.5" />}
            {tab.key === "review" && <Mouse className="size-3.5" />}
            {tab.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              typeTab === tab.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search + Status tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-lg border border-border bg-card p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                activeTab === tab.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full pl-9 sm:w-64 border-border bg-card"
            placeholder={t.common.search + "..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <BoxLoader />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <FileText className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">
            {search ? t.admin.blog.nothingFound : t.admin.blog.nothingYet}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search ? t.admin.blog.differentSearch : t.admin.blog.createFirst}
          </p>
          {!search && (
            <div className="mt-4 flex gap-2">
              <Link href="/admin/blog/new?type=news">
                <Button size="sm" variant="outline" className="gap-2">
                  <Plus className="size-3.5" />
                  {t.admin.blog.newNews}
                </Button>
              </Link>
              <Link href="/admin/blog/new?type=review">
                <Button size="sm" className="gap-2">
                  <Plus className="size-3.5" />
                  {t.admin.blog.newReview}
                </Button>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => {
            const relatedPeripheral = Array.isArray(post.peripherals) ? post.peripherals[0] : null
            const thumb = post.cover_thumbnail_url || post.cover_image_url
            const date = new Date(post.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })

            return (
              <Card key={post.id} className="group overflow-hidden border-border bg-card transition-all hover:border-border/80 hover:shadow-md">
                {/* Thumbnail */}
                <div className="relative aspect-video w-full overflow-hidden bg-muted/30">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={post.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <FileText className="size-10 text-muted-foreground/20" />
                    </div>
                  )}
                  <div className="absolute right-2 top-2">
                    <Badge
                      variant={post.is_published ? "default" : "secondary"}
                      className={post.is_published ? "bg-emerald-500/90 text-white hover:bg-emerald-500" : ""}
                    >
                      {post.is_published ? t.admin.blog.postPublished : t.admin.blog.draft}
                    </Badge>
                  </div>
                  <div className="absolute left-2 top-2">
                    <Badge variant="secondary" className="bg-background/80 backdrop-blur">
                      {post.post_type === "news" ? t.admin.blog.newsType : "Review"}
                    </Badge>
                  </div>
                </div>

                <CardContent className="p-4">
                  {/* Peripheral tag */}
                  {relatedPeripheral && (
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {relatedPeripheral.brand} · {relatedPeripheral.name}
                    </p>
                  )}

                  {/* Title */}
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                    {post.title}
                  </h3>

                  {/* Excerpt */}
                  {post.excerpt && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                      {post.excerpt}
                    </p>
                  )}

                  {/* Footer */}
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                    <span className="text-[10px] text-muted-foreground">{date}</span>
                    <div className="flex items-center gap-1">
                      <Link href={`/blog/${post.slug}`} target="_blank">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                          <Eye className="size-3.5" />
                        </Button>
                      </Link>
                      <Link href={`/admin/blog/${post.id}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                          <Pencil className="size-3.5" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-400"
                        onClick={() => removePost(post.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {t.admin.blog.items(filtered.length, Boolean(search))}
        </p>
      )}
    </div>
  )
}
