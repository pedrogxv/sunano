"use client"

import Link from "next/link"
import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { FileText, Flame, Loader2, MessageSquare, Users } from "lucide-react"

import { FollowButton } from "@/components/people/FollowButton"
import { PostCard, type PostCardData } from "@/components/forum/PostCard"
import { CommentBody } from "@/components/comments/CommentBody"
import { Contador, type Estatistica } from "@/components/profile/EstatisticasContador"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { UserAvatar } from "@/components/ui/user-avatar"
import { TIER_CAPABILITIES } from "@/lib/account-tier"
import { profilePath } from "@/lib/profile-name"
import { getSpecialTag } from "@/lib/special-tag"
import type { ForumUserComment } from "@/lib/server/repositories/forum-repository"
import type { PublicProfileSummary } from "@/lib/user-directory"

function DialogListState({
  loading,
  empty,
  emptyLabel,
}: {
  loading: boolean
  empty: boolean
  emptyLabel: string
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (empty) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }
  return null
}

/** Linha compacta de perfil dentro do modal — `ProfileCard` é pensado para grade, não para lista. */
function FollowerRow({
  profile,
  isFollowing,
  isSelf,
}: {
  profile: PublicProfileSummary
  isFollowing: boolean
  isSelf: boolean
}) {
  const tag = getSpecialTag(profile.display_slug)
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40">
      <Link
        href={profilePath(profile.display_slug)}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <UserAvatar name={profile.display_name} avatarUrl={profile.avatar_url} size={10} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{profile.display_name}</p>
          {(profile.account_tier !== "common" || tag) && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {profile.account_tier !== "common" && TIER_CAPABILITIES[profile.account_tier].label}
              {tag && <span>{tag.label}</span>}
            </p>
          )}
        </div>
      </Link>
      {!isSelf && (
        <FollowButton userId={profile.id} initialFollowing={isFollowing} className="shrink-0" />
      )}
    </div>
  )
}

/**
 * Card "Seguidores" que abre o modal com a lista ao ser clicado.
 *
 * O botão nasce aqui dentro (não recebe o `<button>` pronto via `children`
 * vindo de `EstatisticasGrid`, um Server Component): passar esse JSX pela
 * fronteira Server→Client dentro de um `DialogTrigger asChild` causava
 * hydration mismatch (a caixa some do HTML gerado no servidor). Recebendo só
 * o número, o gatilho fica auto-contido — mesmo padrão do `ImageLightbox`.
 */
export function FollowersStatTrigger({ userId, followersCount }: { userId: string; followersCount: number }) {
  const seguidoresItem: Estatistica = {
    icone: Users,
    rotulo: followersCount === 1 ? "Seguidor" : "Seguidores",
    valor: followersCount,
    tom: "text-sky-400",
    fundo: "bg-sky-400/10",
  }

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [profiles, setProfiles] = useState<PublicProfileSummary[]>([])
  const [followedIds, setFollowedIds] = useState<string[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next || loaded) return

    setLoading(true)
    try {
      const res = await fetch(`/api/users/followers?userId=${userId}`)
      const data = (await res.json()) as {
        ok?: boolean
        profiles?: PublicProfileSummary[]
        followedIds?: string[]
        currentUserId?: string | null
      }
      if (data.ok) {
        setProfiles(data.profiles ?? [])
        setFollowedIds(data.followedIds ?? [])
        setCurrentUserId(data.currentUserId ?? null)
      }
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center rounded-xl border border-border bg-card/60 px-4 py-3 text-left transition-colors hover:bg-card sm:px-5 sm:py-3.5"
        >
          <Contador item={seguidoresItem} />
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Seguidores</DialogTitle>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <DialogListState
            loading={loading}
            empty={!loading && profiles.length === 0}
            emptyLabel="Ainda sem seguidores."
          />
          {!loading &&
            profiles.map((profile) => (
              <FollowerRow
                key={profile.id}
                profile={profile}
                isFollowing={followedIds.includes(profile.id)}
                isSelf={profile.id === currentUserId}
              />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Linha compacta de comentário dentro do modal — trecho do texto + o post ao qual pertence. */
function CommentRow({ comment }: { comment: ForumUserComment }) {
  return (
    <Link
      href={`/forum/${comment.post_slug}#comments`}
      className="block rounded-lg border border-border/60 px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/40"
    >
      <p className="truncate text-xs text-muted-foreground">
        Em: <span className="font-medium text-foreground">{comment.post_title}</span>
      </p>
      <CommentBody body={comment.body} className="mt-1 line-clamp-3" />
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{format(new Date(comment.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
        {comment.aura_count > 0 && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-orange-500">
              <Flame className="size-3" fill="currentColor" strokeWidth={1.5} />
              {comment.aura_count}
            </span>
          </>
        )}
      </div>
    </Link>
  )
}

/**
 * Card "Posts | Comentários" — visualmente uma caixa só (as duas métricas
 * medem "produção no fórum"), mas cada metade é o seu próprio `DialogTrigger`
 * com o seu próprio modal: "Posts" abre a lista de posts, "Comentários" abre
 * a lista de comentários. As duas ficarem dentro do mesmo `<button>` foi o
 * bug original — o clique inteiro ia sempre para o modal de Posts, mesmo do
 * lado de "Comentários". Ver nota em `FollowersStatTrigger` sobre o gatilho
 * nascer aqui dentro em vez de vir de fora via `children`.
 */
export function PostsStatTrigger({
  userId,
  postsCount,
  commentsCount,
}: {
  userId: string
  postsCount: number
  commentsCount: number
}) {
  const postsItem: Estatistica = {
    icone: FileText,
    rotulo: postsCount === 1 ? "Post" : "Posts",
    valor: postsCount,
    tom: "text-emerald-400",
    fundo: "bg-emerald-400/10",
  }
  const comentariosItem: Estatistica = {
    icone: MessageSquare,
    rotulo: commentsCount === 1 ? "Comentário" : "Comentários",
    valor: commentsCount,
    tom: "text-violet-400",
    fundo: "bg-violet-400/10",
  }

  const [postsOpen, setPostsOpen] = useState(false)
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsLoaded, setPostsLoaded] = useState(false)
  const [posts, setPosts] = useState<PostCardData[]>([])

  async function handlePostsOpenChange(next: boolean) {
    setPostsOpen(next)
    if (!next || postsLoaded) return

    setPostsLoading(true)
    try {
      const res = await fetch(`/api/forum/posts?tab=user&userId=${userId}`)
      const data = (await res.json()) as { ok?: boolean; posts?: PostCardData[] }
      if (data.ok) setPosts(data.posts ?? [])
    } finally {
      setPostsLoading(false)
      setPostsLoaded(true)
    }
  }

  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [comments, setComments] = useState<ForumUserComment[]>([])

  async function handleCommentsOpenChange(next: boolean) {
    setCommentsOpen(next)
    if (!next || commentsLoaded) return

    setCommentsLoading(true)
    try {
      const res = await fetch(`/api/forum/comments?userId=${userId}`)
      const data = (await res.json()) as { ok?: boolean; comments?: ForumUserComment[] }
      if (data.ok) setComments(data.comments ?? [])
    } finally {
      setCommentsLoading(false)
      setCommentsLoaded(true)
    }
  }

  return (
    <div className="flex items-center rounded-xl border border-border bg-card/60">
      <Dialog open={postsOpen} onOpenChange={handlePostsOpenChange}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="flex items-center rounded-l-xl px-4 py-3 text-left transition-colors hover:bg-card sm:px-5 sm:py-3.5"
          >
            <Contador item={postsItem} />
          </button>
        </DialogTrigger>
        <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Posts</DialogTitle>
          </DialogHeader>
          <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-1">
            <DialogListState
              loading={postsLoading}
              empty={!postsLoading && posts.length === 0}
              emptyLabel="Nenhum post ainda."
            />
            {!postsLoading && posts.map((post) => <PostCard key={post.id} post={post} />)}
          </div>
        </DialogContent>
      </Dialog>

      <div className="h-8 w-px shrink-0 bg-border sm:h-9" aria-hidden />

      <Dialog open={commentsOpen} onOpenChange={handleCommentsOpenChange}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="flex items-center rounded-r-xl px-4 py-3 text-left transition-colors hover:bg-card sm:px-5 sm:py-3.5"
          >
            <Contador item={comentariosItem} />
          </button>
        </DialogTrigger>
        <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Comentários</DialogTitle>
          </DialogHeader>
          <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-1">
            <DialogListState
              loading={commentsLoading}
              empty={!commentsLoading && comments.length === 0}
              emptyLabel="Nenhum comentário ainda."
            />
            {!commentsLoading && comments.map((comment) => <CommentRow key={comment.id} comment={comment} />)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
