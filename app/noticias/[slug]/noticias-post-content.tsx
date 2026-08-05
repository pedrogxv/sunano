"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Clock, MessageCircle, Newspaper } from "lucide-react"

import { CommentsSection } from "@/components/comments/CommentsSection"
import type { CommentItem } from "@/components/comments/types"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useAuthUser } from "@/components/providers/auth-context"
import { getBlogImageWithFallback } from "@/lib/blog-images"

// ─── Types ────────────────────────────────────────────────────────────────────

type PeripheralRef = { id?: string; name: string; brand: string; category?: string | null }

export type NewsPost = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  cover_thumbnail_url: string | null
  video_url: string | null
  content: string
  read_time_minutes: number | null
  created_at: string
  comment_count?: number
  admin_profiles?: { display_name: string | null; avatar_url: string | null; email: string | null } | null
  peripherals?: PeripheralRef[] | null
}

export type RelatedPost = {
  id: string
  title: string
  slug: string
  cover_thumbnail_url: string | null
  cover_image_url: string | null
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  keyboard: "Teclado",
  mouse: "Mouse",
  mousepad: "Mousepad",
  glasspad: "Glasspad",
  iem: "IEM",
  headset: "Headset",
  feet: "Skates",
  chairs: "Cadeiras",
  monitors: "Monitores",
  switches: "Switches",
  dac_amp: "DAC/Amp",
}

function getAuthorName(post: NewsPost) {
  const name = post.admin_profiles?.display_name?.trim()
  if (name) return name
  const email = post.admin_profiles?.email
  if (email) return email.split("@")[0]
  return "Sunano"
}

/** Tags da matéria, derivadas do periférico vinculado. */
function buildTags(post: NewsPost): string[] {
  const p = post.peripherals?.[0]
  if (!p) return []
  const tags: string[] = []
  if (p.brand) tags.push(p.brand)
  if (p.category && CATEGORY_LABEL[p.category]) tags.push(CATEGORY_LABEL[p.category])
  if (p.name) tags.push(p.name)
  return [...new Set(tags)]
}

// ─── Small components ─────────────────────────────────────────────────────────

function TagBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
      #{label}
    </span>
  )
}

// ─── Related news ─────────────────────────────────────────────────────────────

function RelatedNews({ posts }: { posts: RelatedPost[] }) {
  if (posts.length === 0) return null
  return (
    <section className="mt-10 pt-6 border-t border-border/40">
      <div className="mb-4 flex items-center gap-2">
        <Newspaper className="size-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Notícias relacionadas
        </h2>
      </div>
      <div className="flex flex-col divide-y divide-border/40">
        {posts.map((p) => {
          const img = getBlogImageWithFallback(p.cover_thumbnail_url, p.cover_image_url, "thumbnail")
          return (
            <Link
              key={p.id}
              href={`/noticias/${p.slug}`}
              className="group flex items-center gap-3 py-2.5"
            >
              <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-muted/30">
                <Image src={img} alt={p.title} fill sizes="64px" className="object-cover transition-transform duration-300 group-hover:scale-105" />
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] text-muted-foreground/60">
                  {new Date(p.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
                <h3 className="text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary line-clamp-2">
                  {p.title}
                </h3>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// ─── Main content ─────────────────────────────────────────────────────────────

export function NoticiasPostContent({
  post: initialPost,
  related,
  initialComments,
}: {
  post: NewsPost | null
  related: RelatedPost[]
  initialComments: CommentItem[]
}) {
  // A notícia em si vem pronta do servidor e não muda no cliente (sem
  // reação no post) — só os comentários têm estado local.
  const post = initialPost
  const [comments, setComments] = useState<CommentItem[]>(initialComments)
  const { user: contextUser, loading: authLoading } = useAuthUser()
  const authUser = useMemo(
    () =>
      contextUser
        ? { id: contextUser.id, display_name: contextUser.displayName, avatar_url: contextUser.avatarUrl }
        : null,
    [contextUser]
  )
  const loadComments = useCallback(async () => {
    if (!post) return
    try {
      const res = await fetch(`/api/blog/${encodeURIComponent(post.slug)}/comments`)
      const data = await res.json().catch(() => null)
      setComments((data?.comments ?? []) as CommentItem[])
    } catch {
      // mantém os comentários já carregados
    }
  }, [post])

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-muted-foreground">Artigo não encontrado.</p>
        <Link href="/noticias" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Voltar para notícias
        </Link>
      </div>
    )
  }

  const coverImg = getBlogImageWithFallback(post.cover_image_url, post.cover_thumbnail_url, "header")
  const authorName = getAuthorName(post)
  const brandName = post.peripherals?.[0]?.brand ?? null
  const tags = buildTags(post)
  const commentCount = comments.length || post.comment_count || 0

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      {/* Back */}
      <Link
        href="/noticias"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Notícias
      </Link>

      {/* Cover image */}
      <div className="relative mb-8 w-full overflow-hidden rounded-2xl bg-muted/30" style={{ aspectRatio: "16/9" }}>
        <Image
          src={coverImg}
          alt={post.title}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
        />
      </div>

      {/* Brand */}
      {brandName && (
        <div className="mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-primary/70">{brandName}</span>
        </div>
      )}

      {/* Title */}
      <h1 className="mb-4 text-2xl md:text-3xl font-bold leading-snug tracking-tight text-foreground">
        {post.title}
      </h1>

      {/* Author / meta row */}
      <div className="mb-6 flex items-center gap-3 border-b border-border/40 pb-6">
        <UserAvatar name={authorName} avatarUrl={post.admin_profiles?.avatar_url} size={8} />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{authorName}</span>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/70">
            <span>
              {new Date(post.created_at).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
            {post.read_time_minutes && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {post.read_time_minutes} min de leitura
                </span>
              </>
            )}
            <span>•</span>
            <a href="#comments" className="flex items-center gap-1 transition-colors hover:text-primary">
              <MessageCircle className="size-3" />
              {commentCount} {commentCount === 1 ? "comentário" : "comentários"}
            </a>
          </div>
        </div>
      </div>

      {/* Excerpt */}
      {post.excerpt && (
        <p className="mb-6 border-l-2 border-primary/30 pl-4 text-base italic leading-relaxed text-muted-foreground">
          {post.excerpt}
        </p>
      )}

      {/* Content */}
      <div className="mb-8 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
        {post.content}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="border-t border-border/40 pt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <TagBadge key={t} label={t} />
            ))}
          </div>
        </div>
      )}

      {/* Related news (via tags) */}
      <RelatedNews posts={related} />

      {/* Comments — mesma lógica/visual do fórum (thread de 1 nível, Aura, badges de autor). */}
      <section className="mt-10 pt-6 border-t border-border/40">
        <CommentsSection
          apiBasePath={`/api/blog/${encodeURIComponent(post.slug)}`}
          auraLookupPath="/api/blog/aura"
          comments={comments}
          onCommentsChange={setComments}
          reloadComments={loadComments}
          authUser={authUser}
          authLoading={authLoading}
        />
      </section>
    </article>
  )
}
