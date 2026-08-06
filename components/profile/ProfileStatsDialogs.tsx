"use client"

import Link from "next/link"
import { useState } from "react"
import { FileText, Loader2, MessageSquare, Users } from "lucide-react"

import { FollowButton } from "@/components/people/FollowButton"
import { PostCard, type PostCardData } from "@/components/forum/PostCard"
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

/** Card "Posts" que abre o modal com a lista ao ser clicado — ver nota em `FollowersStatTrigger`. */
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

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [posts, setPosts] = useState<PostCardData[]>([])

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next || loaded) return

    setLoading(true)
    try {
      const res = await fetch(`/api/forum/posts?tab=user&userId=${userId}`)
      const data = (await res.json()) as { ok?: boolean; posts?: PostCardData[] }
      if (data.ok) setPosts(data.posts ?? [])
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
          className="flex items-center gap-4 rounded-xl border border-border bg-card/60 px-4 py-3 text-left transition-colors hover:bg-card sm:gap-5 sm:px-5 sm:py-3.5"
        >
          <Contador item={postsItem} />
          <div className="h-8 w-px shrink-0 bg-border sm:h-9" aria-hidden />
          <Contador item={comentariosItem} />
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Posts</DialogTitle>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-1">
          <DialogListState
            loading={loading}
            empty={!loading && posts.length === 0}
            emptyLabel="Nenhum post ainda."
          />
          {!loading && posts.map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      </DialogContent>
    </Dialog>
  )
}
