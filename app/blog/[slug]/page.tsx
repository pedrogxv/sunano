"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import BoxLoader from "@/components/ui/box-loader"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  video_url: string | null
  content: string
  created_at: string
  admin_profiles?: { display_name: string | null; avatar_url: string | null; email: string | null } | null
  peripherals?: { name: string; brand: string }[] | null
}

function getDefaultAuthorName(email: string | null | undefined) {
  if (!email) return "Sunano"
  const [localPart] = email.split("@")
  return localPart || "Sunano"
}

function getVideoEmbedUrl(url: string | null) {
  if (!url) return null

  try {
    const parsed = new URL(url)

    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v")
      return id ? `https://www.youtube.com/embed/${id}` : null
    }

    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace("/", "")
      return id ? `https://www.youtube.com/embed/${id}` : null
    }

    if (parsed.hostname.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop()
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
  } catch {
    return null
  }

  return null
}

export default function BlogPostPage() {
  const { locale } = useLocale()
  const t = useT()
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    async function loadPost(postSlug: string) {
      setLoading(true)

      try {
        // O artigo vem do endpoint /api/blog/[slug] (delega ao repositório).
        const res = await fetch(`/api/blog/${encodeURIComponent(postSlug)}`)
        const data = await res.json().catch(() => null)

        if (!res.ok || !data?.post) {
          setPost(null)
          return
        }

        const loaded = data.post as Partial<BlogPost>
        setPost({ ...loaded, cover_thumbnail_url: loaded.cover_thumbnail_url ?? null } as BlogPost)
      } catch (err) {
        console.error("Error loading blog post:", err)
        setPost(null)
      } finally {
        setLoading(false)
      }
    }

    loadPost(slug)
  }, [slug])

  const embedUrl = useMemo(() => getVideoEmbedUrl(post?.video_url ?? null), [post?.video_url])
  const relatedPeripheral = Array.isArray(post?.peripherals) ? post.peripherals[0] : null
  const authorName = post?.admin_profiles?.display_name?.trim() || getDefaultAuthorName(post?.admin_profiles?.email)
  const authorAvatar = post?.admin_profiles?.avatar_url || "https://github.com/shadcn.png"

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background p-8 text-muted-foreground">
        <p>{t.blog.articleNotFound}</p>
        <Link href="/blog" className="mt-4 inline-block">
          <Button variant="outline">{t.blog.backToBlog}</Button>
        </Link>
      </div>
    )
  }

  return (

    <div className="mx-auto max-w-4xl p-4 md:p-5 lg:p-6">
      <Card className="overflow-hidden border-border bg-card/90 shadow-2xl shadow-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getBlogImageWithFallback(post.cover_image_url, post.cover_thumbnail_url, "header")}
          alt={post.title}
          className="h-72 w-full object-cover"
        />

        <CardHeader className="space-y-3 border-b border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)] p-6">
          <div className="flex flex-wrap items-center gap-2">
            {post.peripherals ? (
              <Badge variant="secondary" className="bg-primary/15 text-primary">
                {relatedPeripheral ? `${relatedPeripheral.brand} • ${relatedPeripheral.name}` : t.blog.noPeripheral}
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
              {new Date(post.created_at).toLocaleDateString(locale)}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <Avatar className="h-9 w-9 border border-border">
              <AvatarImage src={authorAvatar} alt={authorName} />
              <AvatarFallback>{authorName.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <p className="text-sm">
              {t.blog.by} <span className="font-semibold text-foreground">{authorName}</span>
            </p>
          </div>
          <CardTitle className="text-3xl text-foreground md:text-4xl">{post.title}</CardTitle>
          {post.excerpt ? <p className="max-w-2xl text-muted-foreground">{post.excerpt}</p> : null}
        </CardHeader>

        <CardContent className="space-y-6 p-6 md:p-7">
          {embedUrl ? (
            <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
              <iframe
                title={t.blog.relatedVideo}
                src={embedUrl}
                className="h-[360px] w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : post.video_url ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              {t.blog.externalVideo} <a className="text-primary underline" href={post.video_url} target="_blank" rel="noreferrer">{post.video_url}</a>
            </div>
          ) : null}

          <article className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-7 text-foreground">
            {post.content}
          </article>

          <div className="flex flex-wrap gap-3">
            <Link href="/blog">
              <Button variant="outline">{t.blog.backToBlog}</Button>
            </Link>
            <Link href="/">
              <Button>{t.blog.viewTierlist}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
