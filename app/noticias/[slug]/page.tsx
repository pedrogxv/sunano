"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  MessageCircle,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react"
import { getBlogImageWithFallback } from "@/lib/blog-images"
import BoxLoader from "@/components/ui/box-loader"

// ─── Types ────────────────────────────────────────────────────────────────────

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
  admin_profiles?: { display_name: string | null; avatar_url: string | null; email: string | null } | null
  peripherals?: { name: string; brand: string }[] | null
}

type Comment = {
  id: string
  author: string
  text: string
  createdAt: number
  votes: number
  userVote: 0 | 1 | -1
  replies: Reply[]
  collapsed: boolean
}

type Reply = {
  id: string
  author: string
  text: string
  createdAt: number
  votes: number
  userVote: 0 | 1 | -1
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

const CATEGORY_TAGS = [
  { key: "mouse", label: "Mouse" },
  { key: "teclado", label: "Teclado" },
  { key: "mousepad", label: "Mousepad" },
  { key: "glasspad", label: "Glasspad" },
  { key: "iem", label: "Fone IEM" },
  { key: "headset", label: "Headset" },
  { key: "gpu", label: "GPU" },
  { key: "cpu", label: "CPU" },
  { key: "fonte", label: "Fonte" },
  { key: "overclock", label: "Overclock" },
  { key: "custom", label: "Custom" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return "agora"
  if (m < 60) return `${m}m atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d atrás`
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function getAuthorName(post: NewsPost) {
  const name = post.admin_profiles?.display_name?.trim()
  if (name) return name
  const email = post.admin_profiles?.email
  if (email) return email.split("@")[0]
  return "Sunano"
}

function getStorageKey(slug: string) {
  return `sunano_news_comments_${slug}`
}

function getUserId(): string {
  const key = "sunano_user_id"
  let id = localStorage.getItem(key)
  if (!id) {
    id = Math.random().toString(36).slice(2, 10).toUpperCase()
    localStorage.setItem(key, id)
  }
  return id
}

function loadComments(slug: string): Comment[] {
  try {
    const raw = localStorage.getItem(getStorageKey(slug))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveComments(slug: string, comments: Comment[]) {
  localStorage.setItem(getStorageKey(slug), JSON.stringify(comments))
}

// ─── Small components ─────────────────────────────────────────────────────────

function UserAvatar({ name, size = 8 }: { name: string; size?: number }) {
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <div
      className={`size-${size} shrink-0 flex items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary`}
    >
      {initials}
    </div>
  )
}

function TagBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors cursor-default">
      #{label}
    </span>
  )
}

// ─── Comments section ─────────────────────────────────────────────────────────

function VoteButtons({
  votes,
  userVote,
  onVote,
  size = "sm",
}: {
  votes: number
  userVote: 0 | 1 | -1
  onVote: (v: 1 | -1) => void
  size?: "sm" | "xs"
}) {
  const cls = size === "xs" ? "size-3.5" : "size-4"
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onVote(1)}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors ${
          userVote === 1
            ? "text-primary bg-primary/10"
            : "text-muted-foreground hover:text-primary hover:bg-primary/5"
        }`}
      >
        <ThumbsUp className={cls} />
        <span className="tabular-nums">{votes > 0 ? votes : ""}</span>
      </button>
      <button
        onClick={() => onVote(-1)}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors ${
          userVote === -1
            ? "text-red-400 bg-red-400/10"
            : "text-muted-foreground hover:text-red-400 hover:bg-red-400/5"
        }`}
      >
        <ThumbsDown className={cls} />
      </button>
    </div>
  )
}

function ReplyItem({
  reply,
  onVote,
}: {
  reply: Reply
  onVote: (v: 1 | -1) => void
}) {
  return (
    <div className="flex gap-2.5 pt-3">
      <div className="flex flex-col items-center">
        <UserAvatar name={reply.author} size={6} />
        <div className="w-px flex-1 mt-1.5 bg-border/30" />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground">{reply.author}</span>
          <span className="text-[10px] text-muted-foreground/60">{timeAgo(reply.createdAt)}</span>
        </div>
        <p className="mt-1 text-sm text-foreground/90 leading-relaxed">{reply.text}</p>
        <div className="mt-2">
          <VoteButtons votes={reply.votes} userVote={reply.userVote} onVote={onVote} size="xs" />
        </div>
      </div>
    </div>
  )
}

function CommentItem({
  comment,
  currentUser,
  onVote,
  onReplyVote,
  onReply,
  onToggle,
}: {
  comment: Comment
  currentUser: string
  onVote: (v: 1 | -1) => void
  onReplyVote: (replyId: string, v: 1 | -1) => void
  onReply: (text: string) => void
  onToggle: () => void
}) {
  const [showReply, setShowReply] = useState(false)
  const [replyText, setReplyText] = useState("")

  function submitReply() {
    const trimmed = replyText.trim()
    if (!trimmed) return
    onReply(trimmed)
    setReplyText("")
    setShowReply(false)
  }

  return (
    <div className="flex gap-3">
      {/* Thread line */}
      <div className="flex flex-col items-center">
        <UserAvatar name={comment.author} size={8} />
        {!comment.collapsed && (comment.replies.length > 0 || showReply) && (
          <button
            onClick={onToggle}
            className="w-px flex-1 mt-1.5 bg-border/40 hover:bg-primary/40 transition-colors cursor-pointer"
            title="Recolher thread"
          />
        )}
      </div>

      <div className="flex-1 min-w-0 pb-1">
        {/* Header */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{comment.author}</span>
          <span className="text-xs text-muted-foreground/60">{timeAgo(comment.createdAt)}</span>
          {comment.collapsed && (
            <button
              onClick={onToggle}
              className="text-xs text-primary/60 hover:text-primary ml-1"
            >
              [expandir]
            </button>
          )}
        </div>

        {!comment.collapsed && (
          <>
            <p className="mt-1 text-sm text-foreground/90 leading-relaxed">{comment.text}</p>

            {/* Actions */}
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <VoteButtons votes={comment.votes} userVote={comment.userVote} onVote={onVote} />
              <button
                onClick={() => setShowReply((v) => !v)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
              >
                Responder
              </button>
              {comment.replies.length > 0 && (
                <button
                  onClick={onToggle}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  {comment.collapsed ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronUp className="size-3" />
                  )}
                  {comment.replies.length}{" "}
                  {comment.replies.length === 1 ? "resposta" : "respostas"}
                </button>
              )}
            </div>

            {/* Reply input */}
            {showReply && (
              <div className="mt-3 flex gap-2.5">
                <UserAvatar name={currentUser} size={6} />
                <div className="flex-1">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escreva uma resposta..."
                    className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitReply()
                    }}
                  />
                  <div className="mt-1.5 flex gap-2 justify-end">
                    <button
                      onClick={() => { setShowReply(false); setReplyText("") }}
                      className="px-3 py-1 text-xs rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={submitReply}
                      disabled={!replyText.trim()}
                      className="px-3 py-1 text-xs rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Responder
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Replies */}
            {comment.replies.length > 0 && (
              <div className="mt-1 border-l-2 border-border/30 pl-3 space-y-0">
                {comment.replies.map((reply) => (
                  <ReplyItem
                    key={reply.id}
                    reply={reply}
                    onVote={(v) => onReplyVote(reply.id, v)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CommentsSection({ slug, postId }: { slug: string; postId: string }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newText, setNewText] = useState("")
  const [userName, setUserName] = useState("")
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [pendingText, setPendingText] = useState("")
  const [currentUser, setCurrentUser] = useState("Você")
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const loaded = loadComments(slug)
    setComments(loaded)
    const storedName = localStorage.getItem("sunano_display_name")
    if (storedName) setCurrentUser(storedName)
  }, [slug])

  function persist(next: Comment[]) {
    setComments(next)
    saveComments(slug, next)
  }

  function submitComment(text: string, authorName: string) {
    const uid = getUserId()
    const c: Comment = {
      id: `${Date.now()}-${uid}`,
      author: authorName || `Anon#${uid.slice(0, 4)}`,
      text,
      createdAt: Date.now(),
      votes: 0,
      userVote: 0,
      replies: [],
      collapsed: false,
    }
    persist([c, ...comments])
    setNewText("")
  }

  function handleSubmit() {
    const trimmed = newText.trim()
    if (!trimmed) return
    const storedName = localStorage.getItem("sunano_display_name")
    if (!storedName) {
      setPendingText(trimmed)
      setShowNamePrompt(true)
      setTimeout(() => nameInputRef.current?.focus(), 50)
      return
    }
    submitComment(trimmed, storedName)
  }

  function confirmName() {
    const name = userName.trim() || `Anon#${getUserId().slice(0, 4)}`
    localStorage.setItem("sunano_display_name", name)
    setCurrentUser(name)
    setShowNamePrompt(false)
    setUserName("")
    submitComment(pendingText, name)
    setPendingText("")
  }

  function voteComment(id: string, v: 1 | -1) {
    persist(
      comments.map((c) => {
        if (c.id !== id) return c
        const prev = c.userVote
        const delta = prev === v ? -v : prev === 0 ? v : v - prev
        return { ...c, votes: c.votes + delta, userVote: prev === v ? 0 : v }
      })
    )
  }

  function voteReply(commentId: string, replyId: string, v: 1 | -1) {
    persist(
      comments.map((c) => {
        if (c.id !== commentId) return c
        return {
          ...c,
          replies: c.replies.map((r) => {
            if (r.id !== replyId) return r
            const prev = r.userVote
            const delta = prev === v ? -v : prev === 0 ? v : v - prev
            return { ...r, votes: r.votes + delta, userVote: prev === v ? 0 : v }
          }),
        }
      })
    )
  }

  function addReply(commentId: string, text: string) {
    const uid = getUserId()
    const author = localStorage.getItem("sunano_display_name") || `Anon#${uid.slice(0, 4)}`
    const reply: Reply = {
      id: `${Date.now()}-${uid}`,
      author,
      text,
      createdAt: Date.now(),
      votes: 0,
      userVote: 0,
    }
    persist(
      comments.map((c) =>
        c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c
      )
    )
  }

  function toggleCollapse(id: string) {
    persist(comments.map((c) => (c.id === id ? { ...c, collapsed: !c.collapsed } : c)))
  }

  return (
    <section className="mt-10">
      <div className="flex items-center gap-2 mb-6">
        <MessageCircle className="size-5 text-foreground" />
        <h2 className="text-lg font-bold text-foreground">
          {comments.length} {comments.length === 1 ? "Comentário" : "Comentários"}
        </h2>
      </div>

      {/* New comment input */}
      <div className="flex gap-3 mb-8">
        <UserAvatar name={currentUser} size={9} />
        <div className="flex-1">
          {showNamePrompt ? (
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <p className="text-sm text-muted-foreground">Como você quer ser chamado?</p>
              <input
                ref={nameInputRef}
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Seu nome (ou deixe em branco para anônimo)"
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                onKeyDown={(e) => e.key === "Enter" && confirmName()}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowNamePrompt(false); setPendingText("") }}
                  className="px-3 py-1.5 text-sm rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmName}
                  className="px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                >
                  Continuar
                </button>
              </div>
            </div>
          ) : (
            <>
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Adicione um comentário..."
                className="w-full rounded-xl border-b border-border bg-transparent px-0 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 resize-none transition-colors"
                rows={1}
                onFocus={(e) => {
                  e.currentTarget.rows = 3
                }}
                onBlur={(e) => {
                  if (!newText) e.currentTarget.rows = 1
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit()
                }}
              />
              {newText && (
                <div className="mt-2 flex gap-2 justify-end">
                  <button
                    onClick={() => setNewText("")}
                    className="px-3 py-1.5 text-sm rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!newText.trim()}
                    className="px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Comentar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Comments list */}
      {comments.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Seja o primeiro a comentar.
        </div>
      ) : (
        <div className="space-y-6">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              currentUser={currentUser}
              onVote={(v) => voteComment(c.id, v)}
              onReplyVote={(rid, v) => voteReply(c.id, rid, v)}
              onReply={(text) => addReply(c.id, text)}
              onToggle={() => toggleCollapse(c.id)}
            />
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    fetch(`/api/blog/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setPost((d.post ?? null) as NewsPost | null))
      .catch(() => setPost(null))
      .finally(() => setLoading(false))
  }, [slug])

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
  const authorName = post.admin_profiles?.display_name?.trim() ||
    post.admin_profiles?.email?.split("@")[0] || "Sunano"

  const brandName = post.peripherals?.[0]?.brand ?? null

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      {/* Back */}
      <Link
        href="/noticias"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="size-4" />
        Notícias
      </Link>

      {/* Cover image */}
      <div className="relative w-full rounded-2xl overflow-hidden bg-muted/30 mb-8" style={{ aspectRatio: "16/9" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverImg} alt={post.title} className="w-full h-full object-cover" />
      </div>

      {/* Meta */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {brandName && (
          <span className="text-xs font-bold uppercase tracking-wider text-primary/70">{brandName}</span>
        )}
      </div>

      {/* Title */}
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-snug mb-4">
        {post.title}
      </h1>

      {/* Author / meta row */}
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border/40">
        <div className="size-8 flex items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary shrink-0">
          {authorName.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{authorName}</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
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
          </div>
        </div>
      </div>

      {/* Excerpt */}
      {post.excerpt && (
        <p className="text-base text-muted-foreground leading-relaxed mb-6 italic border-l-2 border-primary/30 pl-4">
          {post.excerpt}
        </p>
      )}

      {/* Content */}
      <div className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap mb-8">
        {post.content}
      </div>

      {/* Tags */}
      <div className="pt-6 border-t border-border/40">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Tags</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_TAGS.map((t) => (
            <TagBadge key={t.key} label={t.label} />
          ))}
          {brandName && <TagBadge label={brandName} />}
        </div>
      </div>

      {/* Comments */}
      <CommentsSection slug={post.slug} postId={post.id} />
    </article>
  )
}
