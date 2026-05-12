"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowLeft, ChevronDown, ChevronUp, Lock, MessageCircle, Pin, X } from "lucide-react"

import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"

type PeripheralRef = { id: string; name: string; brand: string; category: string; image_url: string | null }

type ForumPost = {
  id: string
  slug: string
  title: string
  body: string
  author_name: string
  author_display_name: string
  author_avatar_url: string | null
  peripheral_refs: string[]
  peripherals: PeripheralRef[]
  created_at: string
  is_locked: boolean
  is_pinned: boolean
  vote_score: number
}

type ForumComment = {
  id: string
  body: string
  author_name: string
  author_display_name: string
  author_avatar_url: string | null
  peripheral_refs: string[]
  peripherals: PeripheralRef[]
  created_at: string
}

type AuthUser = { id: string; display_name: string; avatar_url: string | null } | null
type Peripheral = { id: string; name: string; brand: string; category: string; image_url?: string | null }

const CATEGORY_LABEL: Record<string, string> = {
  mouse: "Mouse", keyboard: "Teclado", mousepad: "Mousepad",
  glasspad: "Glasspad", iem: "IEM", headset: "Headset",
}

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
    <div className={`${sizeClass} flex items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary`}>
      {initials}
    </div>
  )
}

function PeripheralCard({ p }: { p: PeripheralRef }) {
  return (
    <Link
      href={`/perifericos/${p.id}`}
      className="group flex items-center gap-2.5 rounded-xl border border-border/50 bg-card px-2.5 py-2 transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm"
    >
      <div className="size-9 shrink-0 overflow-hidden rounded-lg bg-muted/50 flex items-center justify-center">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt={p.name} className="size-9 object-contain p-0.5" />
        ) : (
          <span className="text-[11px] font-bold text-muted-foreground">
            {p.brand.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-tight text-foreground group-hover:text-primary transition-colors truncate max-w-[180px]">
          {p.brand} {p.name}
        </p>
        <p className="mt-0.5 text-[10px] font-medium text-primary/60 leading-none">
          {CATEGORY_LABEL[p.category] ?? p.category}
        </p>
      </div>
    </Link>
  )
}

export default function ForumPostPage() {
  const params = useParams<{ slug: string }>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [post, setPost] = useState<ForumPost | null>(null)
  const [comments, setComments] = useState<ForumComment[]>([])
  const [authUser, setAuthUser] = useState<AuthUser>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userVote, setUserVote] = useState(0)

  // Comment form
  const [body, setBody] = useState("")
  const [selectedPeripherals, setSelectedPeripherals] = useState<Peripheral[]>([])
  const [peripheralSearch, setPeripheralSearch] = useState("")
  const [peripheralResults, setPeripheralResults] = useState<Peripheral[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from("user_profiles").select("display_name, avatar_url")
          .eq("id", session.user.id).maybeSingle()
        setAuthUser({
          id: session.user.id,
          display_name: profile?.display_name || session.user.email?.split("@")[0] || "Usuário",
          avatar_url: profile?.avatar_url || null,
        })
      } else {
        setAuthUser(null)
        setUserVote(0)
      }
      setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadPost = useCallback(async () => {
    if (!params.slug) return
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/forum/posts/${params.slug}`)
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.post) throw new Error(data?.error ?? "Erro ao carregar post")
      setPost(data.post)
      setComments(data.comments ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar post")
    } finally {
      setLoading(false)
    }
  }, [params.slug])

  useEffect(() => { loadPost() }, [loadPost])

  // Load user's vote for this post
  useEffect(() => {
    if (!authUser || !post) return
    ;(supabase as any).from("forum_votes")
      .select("value").eq("post_id", post.id).maybeSingle()
      .then(({ data }: any) => setUserVote(data?.value ?? 0))
  }, [authUser, post])

  async function handleVote(value: 1 | -1 | 0) {
    if (!authUser || !post) return
    const prevVote = userVote
    const prevScore = post.vote_score
    const delta = value - prevVote

    setUserVote(value)
    setPost((p) => p ? { ...p, vote_score: p.vote_score + delta } : p)

    const res = await fetch(`/api/forum/posts/${post.slug}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    })

    if (!res.ok) {
      setUserVote(prevVote)
      setPost((p) => p ? { ...p, vote_score: prevScore } : p)
    } else {
      const data = await res.json().catch(() => null)
      if (data?.vote_score !== undefined) {
        setPost((p) => p ? { ...p, vote_score: data.vote_score } : p)
      }
    }
  }

  useEffect(() => {
    if (peripheralSearch.trim().length < 2) { setPeripheralResults([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("peripherals").select("id, name, brand, category")
        .ilike("name", `%${peripheralSearch.trim()}%`).limit(8)
      setPeripheralResults((data ?? []) as Peripheral[])
    }, 300)
    return () => clearTimeout(timer)
  }, [peripheralSearch])

  function addPeripheral(p: Peripheral) {
    if (selectedPeripherals.length >= 3 || selectedPeripherals.find((s) => s.id === p.id)) return
    setSelectedPeripherals((prev) => [...prev, p])
    setPeripheralSearch("")
    setPeripheralResults([])
  }

  async function submitComment() {
    if (!post || !authUser) return
    try {
      setSaving(true)
      setFormError(null)
      const res = await fetch(`/api/forum/posts/${post.slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, peripheral_refs: selectedPeripherals.map((p) => p.id) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao enviar comentário")
      setBody("")
      setSelectedPeripherals([])
      await loadPost()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao enviar comentário")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar ao fórum
      </Link>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <BoxLoader />
        </div>
      ) : post ? (
        <>
          {/* Post card */}
          <div className={`rounded-xl border bg-card ${post.is_pinned ? "border-primary/30 bg-primary/[0.03]" : "border-border"}`}>
            {post.is_pinned && (
              <div className="h-px rounded-t-xl bg-gradient-to-r from-primary/60 via-primary/30 to-transparent" />
            )}

            <div className="flex gap-4 p-6">
              {/* Vertical vote column */}
              <div className="flex flex-col items-center gap-0.5 shrink-0 w-8 pt-1">
                <button
                  type="button"
                  onClick={() => handleVote(userVote === 1 ? 0 : 1)}
                  disabled={!authUser}
                  title={!authUser ? "Entre para votar" : userVote === 1 ? "Remover voto" : "Voto positivo"}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                    userVote === 1
                      ? "text-primary bg-primary/15 hover:bg-primary/20"
                      : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <ChevronUp className="size-5" />
                </button>
                <span className={`text-sm font-bold tabular-nums leading-none ${
                  (post.vote_score ?? 0) > 0 ? "text-primary" : (post.vote_score ?? 0) < 0 ? "text-destructive" : "text-muted-foreground"
                }`}>
                  {post.vote_score ?? 0}
                </span>
                <button
                  type="button"
                  onClick={() => handleVote(userVote === -1 ? 0 : -1)}
                  disabled={!authUser}
                  title={!authUser ? "Entre para votar" : userVote === -1 ? "Remover voto" : "Voto negativo"}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                    userVote === -1
                      ? "text-destructive bg-destructive/15 hover:bg-destructive/20"
                      : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <ChevronDown className="size-5" />
                </button>
              </div>

              {/* Post content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3">
                  <UserAvatar name={post.author_display_name} avatarUrl={post.author_avatar_url} size={9} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {post.is_pinned && (
                          <span className="mb-1 inline-flex items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            <Pin className="size-2.5" />
                            Fixado
                          </span>
                        )}
                        <h1 className="font-display text-xl font-bold tracking-tight text-foreground md:text-2xl">
                          {post.title}
                        </h1>
                      </div>
                      {post.is_locked && (
                        <div className="flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-400">
                          <Lock className="size-3" />
                          Bloqueado
                        </div>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {post.author_display_name} · {format(new Date(post.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground">{post.body}</p>

                {post.peripherals.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <span className="text-xs text-muted-foreground">Referências:</span>
                    {post.peripherals.map((p) => <PeripheralCard key={p.id} p={p} />)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Comments */}
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <MessageCircle className="size-4 text-primary" />
              {comments.length} comentário{comments.length !== 1 ? "s" : ""}
            </div>

            {comments.length > 0 ? (
              <div className="space-y-3">
                {comments.map((comment, idx) => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <UserAvatar name={comment.author_display_name} avatarUrl={comment.author_avatar_url} size={8} />
                      {idx < comments.length - 1 && (
                        <div className="mt-2 w-px flex-1 bg-border/40" />
                      )}
                    </div>
                    <div className="flex-1 pb-3">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{comment.author_display_name}</span>
                        {" · "}{format(new Date(comment.created_at), "dd MMM yyyy", { locale: ptBR })}
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {comment.body}
                      </p>
                      {comment.peripherals.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {comment.peripherals.map((p) => <PeripheralCard key={p.id} p={p} />)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Ainda não há comentários.</p>
            )}
          </div>

          {/* Comment form */}
          {!post.is_locked && (
            <div>
              {!authLoading && !authUser ? (
                <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    <Link href="/login" className="font-medium text-primary hover:underline">Entre na sua conta</Link>
                    {" "}para deixar um comentário.
                  </p>
                </div>
              ) : authUser ? (
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <UserAvatar name={authUser.display_name} avatarUrl={authUser.avatar_url} size={6} />
                    Comentando como <span className="font-medium text-foreground">{authUser.display_name}</span>
                  </div>

                  {formError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {formError}
                    </div>
                  )}

                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-[100px] border-border bg-muted/20"
                    placeholder="Escreva seu comentário..."
                  />

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Periféricos relacionados <span className="normal-case font-normal">(até 3)</span>
                    </label>
                    {selectedPeripherals.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {selectedPeripherals.map((p) => (
                          <span key={p.id} className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">
                            {p.brand} {p.name}
                            <button type="button" onClick={() => setSelectedPeripherals((prev) => prev.filter((s) => s.id !== p.id))}>
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {selectedPeripherals.length < 3 && (
                      <div className="relative">
                        <Input
                          value={peripheralSearch}
                          onChange={(e) => setPeripheralSearch(e.target.value)}
                          className="border-border bg-muted/20 text-sm"
                          placeholder="Buscar periférico..."
                        />
                        {peripheralResults.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-card shadow-xl">
                            {peripheralResults.map((p) => (
                              <button key={p.id} type="button" onClick={() => addPeripheral(p)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40">
                                <span className="font-medium text-foreground">{p.name}</span>
                                <span className="text-xs text-muted-foreground">{p.brand}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button size="sm" onClick={submitComment} disabled={saving || body.trim().length < 4}>
                      {saving ? "Enviando…" : "Comentar"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {post.is_locked && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
              <Lock className="size-4 shrink-0" />
              Este tópico está bloqueado para novos comentários.
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
