"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronDown, ChevronUp, Clock, Flame, Lock, MessageCircle, Pin, Plus, Tag, X } from "lucide-react"

import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { supabaseAuth } from "@/lib/client/supabase-auth"

type ForumPost = {
  id: string
  slug: string
  title: string
  body: string
  author_name: string
  author_display_name: string
  author_avatar_url: string | null
  peripheral_refs: string[]
  peripherals?: { id: string; name: string; brand: string; category: string; image_url: string | null }[]
  created_at: string
  is_locked: boolean
  is_pinned: boolean
  vote_score: number
  comment_count: number
}

type Peripheral = { id: string; name: string; brand: string; category: string; image_url?: string | null }
type AuthUser = { id: string; display_name: string; avatar_url: string | null } | null
type Tab = "recent" | "hot" | "peripheral"

const CATEGORIES = [
  { value: "mouse",     label: "Mouse" },
  { value: "keyboard",  label: "Teclado" },
  { value: "mousepad",  label: "Mousepad" },
  { value: "glasspad",  label: "Glasspad" },
  { value: "iem",       label: "IEM" },
  { value: "headset",   label: "Headset" },
]

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]))

function UserAvatar({ name, avatarUrl, size = 8 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
  const sizeClass = `size-${size}`
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt={name} loading="lazy" decoding="async" className={`${sizeClass} rounded-full object-cover border border-border`} />
    )
  }
  return (
    <div className={`${sizeClass} flex items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary`}>
      {initials}
    </div>
  )
}

function PeripheralCard({ peripheral }: { peripheral: { id: string; name: string; brand: string; category: string; image_url?: string | null } }) {
  return (
    <Link
      href={`/perifericos/${peripheral.id}`}
      onClick={(e) => e.stopPropagation()}
      className="group flex items-center gap-2.5 rounded-xl border border-border/50 bg-card px-2.5 py-2 transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm"
    >
      <div className="size-9 shrink-0 overflow-hidden rounded-lg bg-muted/50 flex items-center justify-center">
        {peripheral.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={peripheral.image_url} alt={peripheral.name} loading="lazy" decoding="async" className="size-9 object-contain p-0.5" />
        ) : (
          <span className="text-[11px] font-bold text-muted-foreground">
            {peripheral.brand.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-tight text-foreground group-hover:text-primary transition-colors truncate max-w-[160px]">
          {peripheral.brand} {peripheral.name}
        </p>
        <p className="mt-0.5 text-[10px] font-medium text-primary/60 leading-none">
          {CATEGORY_LABEL[peripheral.category] ?? peripheral.category}
        </p>
      </div>
    </Link>
  )
}

function VoteColumn({
  post,
  userVote,
  onVote,
  disabled,
}: {
  post: ForumPost
  userVote: number
  onVote: (v: 1 | -1 | 0) => void
  disabled: boolean
}) {
  const score = post.vote_score ?? 0
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0 w-8 pt-0.5">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onVote(userVote === 1 ? 0 : 1) }}
        disabled={disabled}
        title={disabled ? "Entre para votar" : userVote === 1 ? "Remover voto" : "Voto positivo"}
        className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
          userVote === 1
            ? "text-primary bg-primary/15 hover:bg-primary/20"
            : "text-muted-foreground hover:text-primary hover:bg-primary/10"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <ChevronUp className="size-4" />
      </button>
      <span className={`text-xs font-bold tabular-nums leading-none ${
        score > 0 ? "text-primary" : score < 0 ? "text-destructive" : "text-muted-foreground"
      }`}>
        {score}
      </span>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onVote(userVote === -1 ? 0 : -1) }}
        disabled={disabled}
        title={disabled ? "Entre para votar" : userVote === -1 ? "Remover voto" : "Voto negativo"}
        className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
          userVote === -1
            ? "text-destructive bg-destructive/15 hover:bg-destructive/20"
            : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <ChevronDown className="size-4" />
      </button>
    </div>
  )
}

export default function ForumPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [authUser, setAuthUser] = useState<AuthUser>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userVotes, setUserVotes] = useState<Record<string, number>>({})

  const [activeTab, setActiveTab] = useState<Tab>("recent")
  const [activeCategory, setActiveCategory] = useState("")

  // New post form
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [selectedPeripherals, setSelectedPeripherals] = useState<Peripheral[]>([])
  const [peripheralSearch, setPeripheralSearch] = useState("")
  const [peripheralResults, setPeripheralResults] = useState<Peripheral[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    // A sessão vem do cliente de autenticação; o perfil vem de /api/auth/me.
    // Em alguns navegadores mobile (webviews como o do Telegram) o evento
    // inicial do onAuthStateChange pode nunca disparar, travando a UI de
    // votos/comentários num skeleton eterno. Depois de alguns segundos,
    // assume-se deslogado — se o evento chegar depois, o estado é atualizado.
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
        setUserVotes({})
      }
      setAuthLoading(false)
    })
    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const loadUserVotes = useCallback(async (postIds: string[]) => {
    if (!postIds.length) return
    try {
      const res = await fetch(`/api/forum/votes?postIds=${postIds.join(",")}`)
      const data = await res.json().catch(() => null)
      setUserVotes(data?.votes ?? {})
    } catch {
      setUserVotes({})
    }
  }, [])

  const loadPosts = useCallback(async (tab: Tab, category: string, withVotes: boolean) => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ tab })
      if (tab === "peripheral" && category) params.set("category", category)
      const res = await fetch(`/api/forum/posts?${params}`)
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.posts) throw new Error(data?.error ?? "Erro ao carregar posts")
      const loaded = data.posts as ForumPost[]
      setPosts(loaded)
      if (withVotes && loaded.length > 0) {
        await loadUserVotes(loaded.map((p) => p.id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar posts")
    } finally {
      setLoading(false)
    }
  }, [loadUserVotes])

  useEffect(() => {
    loadPosts(activeTab, activeCategory, !!authUser)
  }, [activeTab, activeCategory, authUser, loadPosts])

  async function handleVote(post: ForumPost, value: 1 | -1 | 0) {
    if (!authUser) return
    const prevVote = userVotes[post.id] ?? 0
    const prevScore = post.vote_score
    const delta = value - prevVote

    setUserVotes((prev) => ({ ...prev, [post.id]: value }))
    setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, vote_score: p.vote_score + delta } : p))

    const res = await fetch(`/api/forum/posts/${post.slug}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    })

    if (!res.ok) {
      setUserVotes((prev) => ({ ...prev, [post.id]: prevVote }))
      setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, vote_score: prevScore } : p))
    } else {
      const data = await res.json().catch(() => null)
      if (data?.vote_score !== undefined) {
        setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, vote_score: data.vote_score } : p))
      }
    }
  }

  useEffect(() => {
    if (peripheralSearch.trim().length < 2) { setPeripheralResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/peripherals?search=${encodeURIComponent(peripheralSearch.trim())}&limit=8`
        )
        const data = await res.json().catch(() => null)
        setPeripheralResults((data?.peripherals ?? []) as Peripheral[])
      } catch {
        setPeripheralResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [peripheralSearch])

  function addPeripheral(p: Peripheral) {
    if (selectedPeripherals.length >= 3 || selectedPeripherals.find((s) => s.id === p.id)) return
    setSelectedPeripherals((prev) => [...prev, p])
    setPeripheralSearch("")
    setPeripheralResults([])
  }

  function removePeripheral(id: string) {
    setSelectedPeripherals((prev) => prev.filter((p) => p.id !== id))
  }

  async function submitPost() {
    if (!authUser) return
    try {
      setSaving(true)
      setFormError(null)
      const res = await fetch("/api/forum/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, peripheral_refs: selectedPeripherals.map((p) => p.id) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok || !data.slug) throw new Error(data?.error ?? "Erro ao criar post")
      setTitle("")
      setBody("")
      setSelectedPeripherals([])
      setShowForm(false)
      await loadPosts(activeTab, activeCategory, !!authUser)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao criar post")
    } finally {
      setSaving(false)
    }
  }

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    if (tab !== "peripheral") setActiveCategory("")
  }

  const canSubmit = title.trim().length >= 4 && body.trim().length >= 20

  const emptyMessage =
    activeTab === "hot" ? "Nenhum tópico em destaque no momento." :
    activeTab === "peripheral" && activeCategory ? `Nenhum tópico sobre ${CATEGORY_LABEL[activeCategory] ?? activeCategory} ainda.` :
    activeTab === "peripheral" ? "Nenhum tópico com periféricos ainda." :
    "Nenhum tópico ainda. Seja o primeiro!"

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Fórum
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compartilhe dicas, tire dúvidas e discuta periféricos.
          </p>
        </div>

        {!authLoading && (
          authUser ? (
            <Button size="sm" className="shrink-0 gap-2" onClick={() => setShowForm((v) => !v)}>
              {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
              {showForm ? "Cancelar" : "Novo tópico"}
            </Button>
          ) : (
            <Link href="/login">
              <Button size="sm" variant="outline" className="shrink-0 gap-2 border-border">
                Entrar para postar
              </Button>
            </Link>
          )
        )}
      </div>

      {/* Tab bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          {(
            [
              { value: "recent" as Tab,     label: "Recente",        icon: Clock  },
              { value: "hot" as Tab,        label: "Em Alta",        icon: Flame  },
              { value: "peripheral" as Tab, label: "Por Periférico", icon: Tag    },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => switchTab(value)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "peripheral" && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveCategory("")}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                !activeCategory
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              Todos
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setActiveCategory(c.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  activeCategory === c.value
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New post form */}
      {showForm && authUser && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <UserAvatar name={authUser.display_name} avatarUrl={authUser.avatar_url} size={6} />
            Postando como <span className="text-primary">{authUser.display_name}</span>
          </div>

          {formError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Título</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-border bg-muted/20" placeholder="Ex: Melhor mouse sem fio até R$500?" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mensagem</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[120px] border-border bg-muted/20" placeholder="Descreva sua dúvida ou dica..." />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Periféricos relacionados <span className="normal-case font-normal">(até 3)</span>
            </label>
            {selectedPeripherals.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedPeripherals.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">
                    {p.brand} {p.name}
                    <button type="button" onClick={() => removePeripheral(p.id)} className="hover:text-destructive">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {selectedPeripherals.length < 3 && (
              <div className="relative">
                <Input value={peripheralSearch} onChange={(e) => setPeripheralSearch(e.target.value)} className="border-border bg-muted/20 text-sm" placeholder="Buscar periférico por nome..." />
                {peripheralResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-card shadow-xl">
                    {peripheralResults.map((p) => (
                      <button key={p.id} type="button" onClick={() => addPeripheral(p)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40">
                        <span className="font-medium text-foreground">{p.name}</span>
                        <span className="text-muted-foreground">{p.brand}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={submitPost} disabled={saving || !canSubmit}>
              {saving ? "Publicando…" : "Publicar"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Post list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <BoxLoader />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          {!authUser && (
            <Link href="/login">
              <Button size="sm" className="mt-4">Entrar para postar</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className={`group relative rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${
                post.is_pinned
                  ? "border-primary/30 bg-primary/[0.03] hover:border-primary/50"
                  : "border-border hover:border-border/70"
              }`}
            >
              {post.is_pinned && (
                <div className="absolute -top-px left-0 right-0 h-px rounded-t-xl bg-gradient-to-r from-primary/60 via-primary/30 to-transparent" />
              )}

              {/* Overlay link — cobre o card inteiro sem aninhar <a> */}
              <Link
                href={`/forum/${post.slug}`}
                aria-label={post.title}
                className="absolute inset-0 z-0 rounded-xl"
              />

              <div className="flex items-start gap-3 p-4 pb-3.5">
                {/* Vote column — acima do overlay para continuar clicável */}
                <div className="relative z-10">
                  <VoteColumn
                    post={post}
                    userVote={userVotes[post.id] ?? 0}
                    onVote={(v) => handleVote(post, v)}
                    disabled={!authUser}
                  />
                </div>

                {/* Post content — não interativo, o overlay cuida da navegação */}
                <div className="flex flex-1 min-w-0 items-start gap-3">
                  <UserAvatar name={post.author_display_name} avatarUrl={post.author_avatar_url} size={8} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
                        {post.is_pinned && (
                          <span className="mr-1.5 inline-flex items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary align-middle">
                            <Pin className="size-2.5" />
                            Fixado
                          </span>
                        )}
                        {post.title}
                      </h2>
                      <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        {post.is_locked && <Lock className="size-3 text-amber-500" />}
                        <MessageCircle className="size-3.5" />
                        <span>{post.comment_count}</span>
                      </div>
                    </div>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {post.author_display_name} · {format(new Date(post.created_at), "dd MMM yyyy", { locale: ptBR })}
                    </p>

                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {post.body}
                    </p>

                    {post.peripherals && post.peripherals.length > 0 && (
                      <div className="relative z-10 mt-2.5 flex flex-wrap gap-1.5">
                        {post.peripherals.map((p) => (
                          <PeripheralCard key={p.id} peripheral={p} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!authLoading && !authUser && !loading && posts.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">Entre na sua conta</Link>
            {" "}para criar tópicos, comentar e votar.
          </p>
        </div>
      )}
    </div>
  )
}
