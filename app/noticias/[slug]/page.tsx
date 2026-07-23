"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useParams } from "next/navigation"
import { ArrowLeft, Clock, MessageCircle, Newspaper } from "lucide-react"
import { getBlogImageWithFallback } from "@/lib/blog-images"
import BoxLoader from "@/components/ui/box-loader"
import { supabaseAuth } from "@/lib/client/supabase-auth"

// ─── Types ────────────────────────────────────────────────────────────────────

type PeripheralRef = { id?: string; name: string; brand: string; category?: string | null }

type NewsPost = {
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

type RelatedPost = {
  id: string
  title: string
  slug: string
  cover_thumbnail_url: string | null
  cover_image_url: string | null
  created_at: string
}

type NewsComment = {
  id: string
  body: string
  author_name: string
  user_id: string | null
  created_at: string
  author_display_name: string
  author_avatar_url: string | null
}

type AuthUser = { id: string; display_name: string; avatar_url: string | null } | null

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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "agora"
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

function UserAvatar({ name, avatarUrl, size = 8 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
  const sizeClass = `size-${size}`
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt={name} className={`${sizeClass} rounded-full object-cover border border-border`} />
    )
  }
  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary`}>
      {initials}
    </div>
  )
}

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

// ─── Comments (account-based) ─────────────────────────────────────────────────

function CommentsSection({
  slug,
  comments,
  authUser,
  authLoading,
  onPosted,
}: {
  slug: string
  comments: NewsComment[]
  authUser: AuthUser
  authLoading: boolean
  onPosted: () => Promise<void> | void
}) {
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!authUser || body.trim().length < 2) return
    try {
      setSaving(true)
      setError(null)
      const res = await fetch(`/api/blog/${encodeURIComponent(slug)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao enviar comentário.")
      setBody("")
      await onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar comentário.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="comentarios" className="mt-10 pt-6 border-t border-border/40 scroll-mt-24">
      <div className="mb-6 flex items-center gap-2">
        <MessageCircle className="size-5 text-foreground" />
        <h2 className="text-lg font-bold text-foreground">
          {comments.length} {comments.length === 1 ? "Comentário" : "Comentários"}
        </h2>
      </div>

      {/* New comment / login gate */}
      {authLoading ? (
        <div className="mb-8 h-24 rounded-xl border border-border bg-card/40 animate-pulse" />
      ) : authUser ? (
        <div className="mb-8 rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserAvatar name={authUser.display_name} avatarUrl={authUser.avatar_url} size={6} />
            Comentando como <span className="font-medium text-foreground">{authUser.display_name}</span>
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva seu comentário..."
            className="min-h-[90px] w-full resize-none rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit()
            }}
          />
          <div className="flex justify-end gap-2">
            {body && (
              <button
                onClick={() => setBody("")}
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={submit}
              disabled={saving || body.trim().length < 2}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Enviando…" : "Comentar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-8 rounded-xl border border-border bg-card/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Entre na sua conta
            </Link>{" "}
            para deixar um comentário.
          </p>
        </div>
      )}

      {/* Comments list */}
      {comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Seja o primeiro a comentar.</p>
      ) : (
        <div className="space-y-5">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <UserAvatar name={c.author_display_name} avatarUrl={c.author_avatar_url} size={8} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-foreground">{c.author_display_name}</span>
                  <span className="text-[11px] text-muted-foreground/60">{timeAgo(c.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NoticiasSlugPage() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<NewsPost | null>(null)
  const [related, setRelated] = useState<RelatedPost[]>([])
  const [comments, setComments] = useState<NewsComment[]>([])
  const [loading, setLoading] = useState(true)
  const [authUser, setAuthUser] = useState<AuthUser>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Sessão do usuário (conta) — perfil enriquecido via /api/auth/me.
  useEffect(() => {
    // Em alguns navegadores mobile (webviews como o do Telegram) o evento
    // inicial do onAuthStateChange pode nunca disparar, travando a caixa de
    // comentário num skeleton eterno. Depois de alguns segundos, assume-se
    // deslogado — se o evento chegar depois, o estado ainda é atualizado.
    const timeout = setTimeout(() => setAuthLoading(false), 4000)

    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange(async (_event, session) => {
      clearTimeout(timeout)
      if (session?.user) {
        let displayName = session.user.email?.split("@")[0] || "Usuário"
        let avatarUrl: string | null = null
        try {
          const res = await fetch("/api/auth/me")
          const data = await res.json()
          if (data?.userProfile) {
            displayName = data.userProfile.display_name || displayName
            avatarUrl = data.userProfile.avatar_url || null
          }
        } catch {
          // mantém os fallbacks derivados do e-mail
        }
        setAuthUser({ id: session.user.id, display_name: displayName, avatar_url: avatarUrl })
      } else {
        setAuthUser(null)
      }
      setAuthLoading(false)
    })
    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const loadComments = useCallback(async () => {
    if (!slug) return
    try {
      const res = await fetch(`/api/blog/${encodeURIComponent(slug)}/comments`)
      const data = await res.json().catch(() => null)
      setComments((data?.comments ?? []) as NewsComment[])
    } catch {
      setComments([])
    }
  }, [slug])

  const loadPost = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      const res = await fetch(`/api/blog/${encodeURIComponent(slug)}`)
      const data = await res.json().catch(() => null)
      setPost((data?.post ?? null) as NewsPost | null)
      setRelated((data?.related ?? []) as RelatedPost[])
    } catch {
      setPost(null)
      setRelated([])
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    loadPost()
    loadComments()
  }, [loadPost, loadComments])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <BoxLoader />
      </div>
    )
  }

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
            <a href="#comentarios" className="flex items-center gap-1 transition-colors hover:text-primary">
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

      {/* Comments */}
      <CommentsSection
        slug={post.slug}
        comments={comments}
        authUser={authUser}
        authLoading={authLoading}
        onPosted={loadComments}
      />
    </article>
  )
}
