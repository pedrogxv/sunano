"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import Link from "next/link"
import { Clock, Flame, Plus, Tag, User, X } from "lucide-react"

import { PostCard, type PostCardData } from "@/components/forum/PostCard"
import { CategoryPickerCompact } from "@/components/forum/CategoryPicker"
import { PostMediaField } from "@/components/forum/PostMediaField"
import { TextFormatToolbar } from "@/components/forum/TextFormatToolbar"
import { ForumSidebar, ForumSidebarMobileTrigger } from "@/components/forum/ForumSidebar"
import type { PublicProfileSummary } from "@/lib/user-directory"
import { CommentBody } from "@/components/comments/CommentBody"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAuthUser } from "@/components/providers/auth-context"

export type ForumPost = PostCardData

type ForumCategoryOption = {
  id: string
  slug: string
  name: string
  children: { id: string; slug: string; name: string }[]
}

type AuthUser = { id: string; display_name: string; avatar_url: string | null } | null
type Tab = "recent" | "hot" | "category" | "mine"

const MAX_TITLE = 200
const MAX_BODY = 5000

export function ForumContent({
  initialPosts,
  topActive,
  moderators,
}: {
  initialPosts: ForumPost[]
  topActive: PublicProfileSummary[]
  moderators: PublicProfileSummary[]
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [posts, setPosts] = useState<ForumPost[]>(initialPosts)
  const { user: contextUser, loading: authLoading } = useAuthUser()
  const authUser: AuthUser = useMemo(
    () =>
      contextUser
        ? { id: contextUser.id, display_name: contextUser.displayName, avatar_url: contextUser.avatarUrl }
        : null,
    [contextUser]
  )
  const [activeTab, setActiveTab] = useState<Tab>("recent")
  const [categories, setCategories] = useState<ForumCategoryOption[]>([])
  const [activeRoot, setActiveRoot] = useState<string>("")
  const [activeCategoryId, setActiveCategoryId] = useState<string>("")
  const [hasOwnPosts, setHasOwnPosts] = useState(false)

  // New post form
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [mediaImageUrls, setMediaImageUrls] = useState<string[]>([])
  const [mediaVideoUrl, setMediaVideoUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    fetch("/api/forum/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data?.categories ?? []))
      .catch(() => setCategories([]))
  }, [])

  // Decide se a aba "Meus Posts" aparece — só quando logado e com >= 1 post.
  useEffect(() => {
    if (!authUser) {
      setHasOwnPosts(false)
      return
    }
    fetch("/api/forum/posts?hasPosts=1")
      .then((res) => res.json())
      .then((data) => setHasOwnPosts(Boolean(data?.hasPosts)))
      .catch(() => setHasOwnPosts(false))
  }, [authUser])

  const loadPosts = useCallback(async (tab: Tab, categoryId: string) => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ tab })
      if (tab === "category" && categoryId) params.set("categoryId", categoryId)
      const res = await fetch(`/api/forum/posts?${params}`)
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.posts) throw new Error(data?.error ?? "Erro ao carregar posts")
      setPosts(data.posts as ForumPost[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar posts")
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Atualiza a lista na hora quando o dono oculta/reativa um post, sem
   * esperar o próximo fetch. Fora de "Meus Posts" o post ocultado some da
   * lista (ele nunca mais voltaria a aparecer nas abas públicas); dentro de
   * "Meus Posts" ele continua na lista, só com a flag `is_hidden` trocada,
   * já que essa aba mostra visíveis e ocultos.
   */
  const handleOwnPostVisibilityChange = useCallback((slug: string, hidden: boolean) => {
    setPosts((prev) => {
      if (activeTab !== "mine") {
        return hidden ? prev.filter((p) => p.slug !== slug) : prev
      }
      return prev.map((p) => (p.slug === slug ? { ...p, is_hidden: hidden } : p))
    })
  }, [activeTab])

  const handleOwnPostDeleted = useCallback((slug: string) => {
    setPosts((prev) => prev.filter((p) => p.slug !== slug))
  }, [])

  // O servidor já renderizou os posts da aba padrão (SSR/ISR) e essa lista em
  // si não depende de quem está logado — "já dei aura nesse post?" não vai
  // junto (o ISR é compartilhado entre visitantes distintos); cada
  // `PostCard` busca seu próprio estado de reação depois de montado (ver
  // `PostAuraButton`). Isso dispensa o fetch client-side no primeiro paint;
  // daí em diante, trocar de aba/categoria recarrega normalmente.
  const isFirstLoadRef = useRef(true)

  useEffect(() => {
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false
      return
    }
    loadPosts(activeTab, activeCategoryId)
  }, [activeTab, activeCategoryId, loadPosts])

  // Se a aba "Meus Posts" deixa de existir (deslogou, ou excluiu o último
  // post) enquanto ela está selecionada, volta pra "Recente" em vez de
  // deixar a aba ativa sumir da barra sem seleção visível.
  useEffect(() => {
    if (activeTab === "mine" && !authLoading && (!authUser || !hasOwnPosts)) {
      switchTab("recent")
    }
  }, [activeTab, authUser, authLoading, hasOwnPosts])

  async function submitPost() {
    if (!authUser) return
    try {
      setSaving(true)
      setFormError(null)
      const res = await fetch("/api/forum/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body: body.trim() ? body : undefined,
          category_id: categoryId,
          media_image_urls: mediaImageUrls.length > 0 ? mediaImageUrls : undefined,
          media_video_url: mediaVideoUrl ?? undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok || !data.slug) throw new Error(data?.error ?? "Erro ao criar post")
      setTitle("")
      setBody("")
      setCategoryId("")
      setMediaImageUrls([])
      setMediaVideoUrl(null)
      setShowForm(false)
      setHasOwnPosts(true)
      await loadPosts(activeTab, activeCategoryId)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao criar post")
    } finally {
      setSaving(false)
    }
  }

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    if (tab !== "category") {
      setActiveRoot("")
      setActiveCategoryId("")
    }
  }

  function selectRootFilter(root: ForumCategoryOption | null) {
    setActiveRoot(root?.id ?? "")
    setActiveCategoryId(root?.id ?? "")
  }

  const activeRootOption = categories.find((c) => c.id === activeRoot) ?? null
  const activeCategoryName =
    categories.flatMap((c) => [c, ...c.children]).find((c) => c.id === activeCategoryId)?.name

  const canSubmit = title.trim().length > 0 && categoryId.length > 0

  const emptyMessage =
    activeTab === "hot" ? "Nenhum tópico em destaque no momento." :
    activeTab === "category" && activeCategoryId ? `Nenhum tópico em ${activeCategoryName ?? "categoria"} ainda.` :
    activeTab === "category" ? "Selecione uma categoria." :
    activeTab === "mine" ? "Você ainda não postou nada." :
    "Nenhum tópico ainda. Seja o primeiro!"

  return (
    <div className="mx-auto flex max-w-6xl items-start gap-6 px-2 py-8 sm:px-4 md:px-6">
      <div className="min-w-0 flex-1 space-y-6">
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
              {showForm ? "Cancelar" : "Novo Post"}
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

      <div className="lg:hidden">
        <ForumSidebarMobileTrigger topActive={topActive} moderators={moderators} />
      </div>

      {/* Tab bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          {(
            [
              { value: "recent" as Tab,   label: "Recente",   icon: Clock },
              { value: "hot" as Tab,      label: "Em Alta",   icon: Flame },
              { value: "category" as Tab, label: "Categoria", icon: Tag   },
              ...(authUser && hasOwnPosts
                ? [{ value: "mine" as Tab, label: "Meus Posts", icon: User }]
                : []),
            ]
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

        {activeTab === "category" && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => selectRootFilter(null)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  !activeRoot
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectRootFilter(c)}
                  title={`Ver página de ${c.name}`}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    activeRoot === c.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {c.name}
                </button>
              ))}
              {/* Link real (não só estado de aba) para cada categoria ter uma
                  URL própria indexável em /forum/categoria/[slug]. */}
              {activeRootOption && (
                <Link
                  href={`/forum/categoria/${activeRootOption.slug}`}
                  className="rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  Ver página de {activeRootOption.name} →
                </Link>
              )}
            </div>
            {activeRootOption && activeRootOption.children.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-3">
                <button
                  type="button"
                  onClick={() => setActiveCategoryId(activeRootOption.id)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    activeCategoryId === activeRootOption.id
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  Todas
                </button>
                {activeRootOption.children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setActiveCategoryId(child.id)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      activeCategoryId === child.id
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {child.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New post form */}
      {showForm && authUser && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          {formError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}

          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Título <span className="text-destructive">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 border-border bg-muted/20 text-sm font-medium"
              placeholder="Título do post"
              maxLength={MAX_TITLE}
            />
          </div>

          <CategoryPickerCompact value={categoryId} onChange={setCategoryId} />

          <div className="space-y-1">
            <TextFormatToolbar textareaRef={bodyTextareaRef} value={body} onChange={setBody} />
            <Textarea
              ref={bodyTextareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[80px] border-border bg-muted/20 text-sm"
              placeholder="Corpo do texto (opcional)"
              maxLength={MAX_BODY}
            />
            {body.trim().length > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pré-visualização
                </p>
                <CommentBody body={body} />
              </div>
            )}
            <div className="flex items-center justify-end text-[10px] text-muted-foreground">
              <span>{body.length}/{MAX_BODY}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Mídia <span className="normal-case font-normal">(opcional)</span>
            </label>
            <PostMediaField
              imageUrls={mediaImageUrls}
              videoUrl={mediaVideoUrl}
              onImagesChange={setMediaImageUrls}
              onVideoChange={setMediaVideoUrl}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {!canSubmit && (
              <p className="mr-auto text-xs text-muted-foreground">
                {title.trim().length === 0
                  ? "Adicione um título para publicar."
                  : "Escolha uma categoria para publicar."}
              </p>
            )}
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
            <PostCard
              key={post.id}
              post={post}
              currentUserId={authUser?.id ?? null}
              onOwnPostVisibilityChange={handleOwnPostVisibilityChange}
              onOwnPostDeleted={handleOwnPostDeleted}
            />
          ))}
        </div>
      )}

      {!authLoading && !authUser && !loading && posts.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">Entre na sua conta</Link>
            {" "}para criar tópicos, comentar e dar aura.
          </p>
        </div>
      )}
      </div>

      <ForumSidebar topActive={topActive} moderators={moderators} />
    </div>
  )
}
