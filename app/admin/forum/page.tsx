import { revalidatePath } from "next/cache"
import Link from "next/link"
import { Eye, EyeOff, Lock, LockOpen, MessageSquare, Pencil, Pin, PinOff, Search } from "lucide-react"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getAuthorizedProfile } from "@/lib/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const PAGE_SIZE = 20

type FilterKey = "all" | "visible" | "hidden" | "locked" | "pinned"

type ForumPost = {
  id: string
  slug: string
  title: string
  body_preview: string
  author_name: string
  is_hidden: boolean
  is_locked: boolean
  is_pinned: boolean
  created_at: string
  comment_count: number
}

type ForumComment = {
  id: string
  post_id: string
  body: string
  author_name: string
  is_hidden: boolean
  created_at: string
}

async function togglePostHidden(postId: string, hidden: boolean) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) return
  const supabase = createSupabaseAdminClient()
  await (supabase.from("forum_posts") as any).update({ is_hidden: hidden }).eq("id", postId)
  revalidatePath("/admin/forum")
}

async function togglePostLocked(postId: string, locked: boolean) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) return
  const supabase = createSupabaseAdminClient()
  await (supabase.from("forum_posts") as any).update({ is_locked: locked }).eq("id", postId)
  revalidatePath("/admin/forum")
}

async function togglePostPinned(postId: string, pinned: boolean) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) return
  const supabase = createSupabaseAdminClient()
  await (supabase.from("forum_posts") as any).update({ is_pinned: pinned }).eq("id", postId)
  revalidatePath("/admin/forum")
}

async function toggleCommentHidden(commentId: string, hidden: boolean) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) return
  const supabase = createSupabaseAdminClient()
  await (supabase.from("forum_comments") as any).update({ is_hidden: hidden }).eq("id", commentId)
  revalidatePath("/admin/forum")
}

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "Todos",
  visible: "Visíveis",
  hidden: "Ocultos",
  locked: "Bloqueados",
  pinned: "Fixados",
}

export default async function AdminForumPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string; q?: string }>
}) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_read")) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Sem permissão para acessar o fórum.
      </div>
    )
  }

  const params = await searchParams
  const filter = (["all", "visible", "hidden", "locked", "pinned"].includes(params.filter ?? "")
    ? params.filter
    : "all") as FilterKey
  const q = params.q?.trim() ?? ""
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const start = (page - 1) * PAGE_SIZE
  const end = start + PAGE_SIZE - 1

  const canWrite = hasAdminPermission(auth.profile, "forum_write")
  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from("forum_posts")
    .select("id, slug, title, body_preview, author_name, is_hidden, is_locked, is_pinned, created_at", { count: "exact" })

  if (filter === "visible") query = (query as any).eq("is_hidden", false)
  else if (filter === "hidden") query = (query as any).eq("is_hidden", true)
  else if (filter === "locked") query = (query as any).eq("is_locked", true)
  else if (filter === "pinned") query = (query as any).eq("is_pinned", true)

  if (q) {
    query = (query as any).or(`title.ilike.%${q}%,author_name.ilike.%${q}%`)
  }

  const { data: posts, count } = await (query as any)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(start, end)

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)
  const postIds = ((posts ?? []) as any[]).map((p: any) => p.id)
  let commentsByPost: Record<string, ForumComment[]> = {}

  if (postIds.length > 0) {
    const { data: comments } = await supabase
      .from("forum_comments")
      .select("id, post_id, body, author_name, is_hidden, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true })

    for (const c of (comments ?? []) as ForumComment[]) {
      if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = []
      commentsByPost[c.post_id].push(c)
    }
  }

  const postsWithCounts: ForumPost[] = ((posts ?? []) as any[]).map((p: any) => ({
    ...p,
    is_pinned: p.is_pinned ?? false,
    body_preview: p.body_preview ?? p.body ?? "",
    comment_count: commentsByPost[p.id]?.length ?? 0,
  }))

  function buildUrl(overrides: Partial<{ page: number; filter: FilterKey; q: string }>) {
    const p = new URLSearchParams()
    const f = overrides.filter ?? filter
    const newQ = overrides.q ?? q
    const newPage = overrides.page ?? 1
    if (f !== "all") p.set("filter", f)
    if (newQ) p.set("q", newQ)
    if (newPage > 1) p.set("page", String(newPage))
    const qs = p.toString()
    return `/admin/forum${qs ? `?${qs}` : ""}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Moderação do Fórum</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie posts e comentários. Posts ocultos não aparecem para o público.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "visible", "hidden", "locked", "pinned"] as FilterKey[]).map((f) => (
            <Link
              key={f}
              href={buildUrl({ filter: f, page: 1 })}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:border-border/70 hover:text-foreground"
              }`}
            >
              {FILTER_LABELS[f]}
            </Link>
          ))}
        </div>

        <form action="/admin/forum" method="GET" className="flex gap-2">
          <input type="hidden" name="filter" value={filter} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Buscar título ou autor…"
              className="h-8 w-52 rounded-lg border border-border bg-muted/20 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" className="h-8 border-border text-xs">
            Buscar
          </Button>
          {q && (
            <Link href={buildUrl({ q: "", page: 1 })} className="flex items-center">
              <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground">
                Limpar
              </Button>
            </Link>
          )}
        </form>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{count ?? 0} post{(count ?? 0) !== 1 ? "s" : ""} encontrado{(count ?? 0) !== 1 ? "s" : ""}</span>
        {q && <span>· filtrando por &quot;{q}&quot;</span>}
      </div>

      {/* Post list */}
      <div className="space-y-4">
        {postsWithCounts.map((post) => {
          const comments = commentsByPost[post.id] ?? []
          const hiddenComments = comments.filter((c) => c.is_hidden).length

          return (
            <div
              key={post.id}
              className={`rounded-xl border bg-card ${
                post.is_pinned
                  ? "border-primary/30 bg-primary/[0.03]"
                  : post.is_hidden
                  ? "border-border/40 opacity-60"
                  : "border-border"
              }`}
            >
              <div className="flex items-start gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground truncate">{post.title}</span>
                    {post.is_pinned && (
                      <Badge variant="secondary" className="bg-primary/15 text-primary text-[10px]">
                        Fixado
                      </Badge>
                    )}
                    {post.is_hidden && (
                      <Badge variant="secondary" className="bg-red-500/15 text-red-400 text-[10px]">Oculto</Badge>
                    )}
                    {post.is_locked && (
                      <Badge variant="secondary" className="bg-amber-500/15 text-amber-400 text-[10px]">Bloqueado</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {post.author_name} · {new Date(post.created_at).toLocaleDateString("pt-BR")}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{post.body_preview}</p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link href={`/admin/forum/${post.slug}/edit`}>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border text-xs">
                      <Pencil className="size-3.5" />
                      Editar
                    </Button>
                  </Link>

                {canWrite && (
                  <>
                    <form action={togglePostPinned.bind(null, post.id, !post.is_pinned)}>
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className={`h-8 gap-1.5 text-xs ${
                          post.is_pinned
                            ? "border-primary/40 text-primary hover:bg-primary/10"
                            : "border-border"
                        }`}
                        title={post.is_pinned ? "Desafixar post" : "Fixar post"}
                      >
                        {post.is_pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                        {post.is_pinned ? "Desafixar" : "Fixar"}
                      </Button>
                    </form>
                    <form action={togglePostHidden.bind(null, post.id, !post.is_hidden)}>
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 border-border text-xs"
                        title={post.is_hidden ? "Mostrar post" : "Ocultar post"}
                      >
                        {post.is_hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                        {post.is_hidden ? "Mostrar" : "Ocultar"}
                      </Button>
                    </form>
                    <form action={togglePostLocked.bind(null, post.id, !post.is_locked)}>
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 border-border text-xs"
                        title={post.is_locked ? "Desbloquear" : "Bloquear comentários"}
                      >
                        {post.is_locked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
                        {post.is_locked ? "Desbloquear" : "Bloquear"}
                      </Button>
                    </form>
                  </>
                )}
                </div>
              </div>

              {comments.length > 0 && (
                <div className="border-t border-border/50 px-4 pb-4 pt-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <MessageSquare className="size-3.5" />
                    {comments.length} comentário{comments.length !== 1 ? "s" : ""}
                    {hiddenComments > 0 && ` · ${hiddenComments} oculto${hiddenComments !== 1 ? "s" : ""}`}
                  </p>
                  <div className="space-y-2">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                          comment.is_hidden ? "border-border/30 bg-muted/10 opacity-50" : "border-border/30 bg-muted/5"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-muted-foreground">
                            {comment.author_name} · {new Date(comment.created_at).toLocaleDateString("pt-BR")}
                            {comment.is_hidden && <span className="ml-1 text-red-400">(oculto)</span>}
                          </p>
                          <p className="mt-0.5 text-xs text-foreground line-clamp-2">{comment.body}</p>
                        </div>
                        {canWrite && (
                          <form action={toggleCommentHidden.bind(null, comment.id, !comment.is_hidden)}>
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                              title={comment.is_hidden ? "Mostrar comentário" : "Ocultar comentário"}
                            >
                              {comment.is_hidden ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                            </Button>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {postsWithCounts.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {q ? `Nenhum post encontrado para "${q}".` : "Nenhum post no fórum ainda."}
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages} · {count} posts
          </p>
          <div className="flex gap-1.5">
            {page > 1 && (
              <Link href={buildUrl({ page: page - 1 })}>
                <Button size="sm" variant="outline" className="h-8 border-border text-xs">Anterior</Button>
              </Link>
            )}
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = Math.min(Math.max(page - 2, 1) + i, totalPages)
              return (
                <Link key={p} href={buildUrl({ page: p })}>
                  <Button
                    size="sm"
                    variant={p === page ? "default" : "outline"}
                    className={`h-8 w-8 border-border text-xs ${p === page ? "" : "text-muted-foreground"}`}
                  >
                    {p}
                  </Button>
                </Link>
              )
            })}
            {page < totalPages && (
              <Link href={buildUrl({ page: page + 1 })}>
                <Button size="sm" variant="outline" className="h-8 border-border text-xs">Próxima</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
