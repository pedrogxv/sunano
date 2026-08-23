"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Bookmark, Crown, EyeOff, Flame, Lock, MessageCircle, Pin, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { CategoryBadge } from "@/components/forum/CategoryBadge"
import { PostVisibilityButton } from "@/components/forum/PostVisibilityButton"
import { PostDeleteButton } from "@/components/forum/PostDeleteButton"
import { ImageLightbox } from "@/components/forum/ImageLightbox"
import { ReportMenu } from "@/components/forum/ReportMenu"
import { ShareMenu } from "@/components/forum/ShareMenu"
import { AuthorAvatarLink, AuthorNameLink } from "@/components/profile/AuthorLink"
import { CommentBody } from "@/components/comments/CommentBody"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useSavedPosts } from "@/components/providers/saved-posts-context"
import { notifyAuraChanged } from "@/lib/client/aura-events"
import { TIER_CAPABILITIES, isVipActive, type AccountTier } from "@/lib/account-tier"
import { getSpecialTag } from "@/lib/special-tag"
import { cn } from "@/lib/utils"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import type { ForumCategoryInfo } from "@/lib/server/repositories/forum-repository"

export type PostCardData = {
  id: string
  slug: string
  title: string
  body: string | null
  user_id: string | null
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  author_vip_expires_at: string | null
  author_display_slug: string | null
  category: ForumCategoryInfo | null
  media_image_urls: string[]
  media_video_url: string | null
  created_at: string
  is_locked: boolean
  is_pinned: boolean
  /** `true` só é relevante na aba "Meus Posts" — nas demais listagens públicas o post oculto nem chega aqui. */
  is_hidden?: boolean
  comment_count: number
  /** Somatório da aura de todos os comentários do post (denormalizado). */
  aura_count: number
  /** Quantos usuários salvaram este post. */
  saved_count: number
}

/** Selo de VIP ao lado do nome do autor — mesmo rótulo do tier usado no perfil. */
export function AuthorTierBadge({ tier, vipExpiresAt = null }: { tier: AccountTier; vipExpiresAt?: string | null }) {
  if (!isVipActive(tier, vipExpiresAt)) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
    >
      <Crown className="size-2.5" />
      {TIER_CAPABILITIES.vip.label}
    </span>
  )
}

/** Selo de tag especial (ex: SUNANO) — aglutina com `AuthorTierBadge` ao lado do nome. */
export function AuthorSpecialTagBadge({ slug }: { slug: string | null }) {
  const tag = getSpecialTag(slug)
  if (!tag) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium bg-cyan-400/15 text-cyan-400`}>
      <Sparkles className="size-2.5" />
      {tag.label}
    </span>
  )
}

function extractYoutubeId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1) || null
    return parsed.searchParams.get("v")
  } catch {
    return null
  }
}

/**
 * "Dar aura" num post — só like, nunca dislike (post não pode render aura
 * negativa pro autor; ver 20260824000000_forum_post_direct_aura.sql). O
 * número exibido é `aura_count`, que já soma a aura dos comentários (ver
 * 20260823000000_forum_post_aura_from_comments.sql) com a reação direta no
 * post no mesmo campo.
 *
 * Self-contido de propósito: busca o estado inicial ("já dei aura nesse
 * post?") e o próprio clique de forma independente, sem depender de a página
 * que renderiza o `PostCard` ter passado esse dado — assim funciona igual em
 * qualquer listagem (fórum, categoria, perfil) sem precisar fiar prop por
 * prop. O custo é 1 fetch por card visível quando logado; aceitável na
 * escala atual do fórum.
 */
function PostAuraButton({
  postSlug,
  authorId,
  initialCount,
}: {
  postSlug: string
  authorId: string | null
  initialCount: number
}) {
  const { user } = useAuthUser()
  const isOwner = Boolean(user) && user!.id === authorId
  const canReact = Boolean(user) && !isOwner

  const [reacted, setReacted] = useState(false)
  const [count, setCount] = useState(initialCount)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCount(initialCount)
  }, [initialCount])

  useEffect(() => {
    if (!canReact) return
    let cancelled = false
    fetch(`/api/forum/posts/${postSlug}/aura`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.ok) setReacted(data.reaction === "like")
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [canReact, postSlug])

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (!canReact || busy) return

    const nextReacted = !reacted
    setBusy(true)
    setReacted(nextReacted)
    setCount((c) => c + (nextReacted ? 1 : -1))

    const res = await fetch(`/api/forum/posts/${postSlug}/aura`, { method: "POST" }).catch(() => null)
    setBusy(false)

    if (!res?.ok) {
      setReacted(!nextReacted)
      setCount((c) => c + (nextReacted ? -1 : 1))
      const data = await res?.json().catch(() => null)
      if (data?.code === "daily_limit" || data?.code === "daily_pair_limit") {
        toast.error(data.error ?? "Limite diário de aura esgotado.")
      } else if (data?.code !== "self_reaction") {
        toast.error(data?.error ?? "Erro ao dar aura.")
      }
      return
    }

    const data = await res.json().catch(() => null)
    if (data?.aura_count !== undefined) {
      setReacted(data.reaction === "like")
      setCount(data.aura_count)
      notifyAuraChanged()
    }
  }

  const tooltipText = !user
    ? "Entre na sua conta pra dar aura — vale +1 pro autor do post"
    : isOwner
      ? "Você não pode dar aura no seu próprio post"
      : reacted
        ? "Você deu aura nesse post — toque de novo pra desfazer"
        : "Dar aura credita +1 pro autor do post"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="pointer-events-auto inline-flex">
          <button
            type="button"
            onClick={handleClick}
            disabled={!canReact}
            aria-pressed={reacted}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold text-orange-500 transition-colors disabled:cursor-not-allowed",
              reacted ? "border-orange-500/50 bg-orange-500/10" : "border-border",
              canReact && "hover:border-orange-500/40 hover:bg-orange-500/5"
            )}
          >
            <span className="aura-stat-icon-holder inline-flex">
              <Flame className="aura-stat-icon size-4 text-orange-500" fill="currentColor" strokeWidth={1.5} />
            </span>
            {count}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56 text-center">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * "Salvar post" para ler depois — ao contrário da aura, o próprio autor
 * também pode salvar o próprio post (não é uma reação social, é uma lista
 * pessoal).
 *
 * Ao contrário de `PostAuraButton`, NÃO busca o próprio estado inicial: lê
 * de `useSavedPosts()` (`SavedPostsProvider`, montado uma vez no layout
 * raiz), que carrega os ids salvos da sessão inteira numa única requisição.
 * Enquanto essa lista global não resolve (`loading`), o botão fica
 * desabilitado em vez de mostrar "não salvo" e trocar de estado 2-3s depois
 * — nunca renderiza um estado que ainda pode estar errado.
 *
 * `onUnsaved` é opcional e só usado pela página /forum/salvos — permite que
 * o card suma da lista assim que o usuário remove o post dos salvos, sem
 * esperar reload.
 */
function PostSaveButton({
  postId,
  postSlug,
  initialCount,
  onUnsaved,
}: {
  postId: string
  postSlug: string
  initialCount: number
  onUnsaved?: (slug: string) => void
}) {
  const { user } = useAuthUser()
  const { openLogin } = useAuthModal()
  const { loading: savedListLoading, isSaved, setSaved: setSavedGlobal } = useSavedPosts()

  const saved = isSaved(postId)
  const [count, setCount] = useState(initialCount)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCount(initialCount)
  }, [initialCount])

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (busy || savedListLoading) return

    if (!user) {
      openLogin(`/forum/${postSlug}`)
      return
    }

    const nextSaved = !saved
    setBusy(true)
    setSavedGlobal(postId, nextSaved)

    const res = await fetch(`/api/forum/posts/${postSlug}/save`, { method: "POST" }).catch(() => null)
    setBusy(false)

    if (!res?.ok) {
      setSavedGlobal(postId, !nextSaved)
      const data = await res?.json().catch(() => null)
      toast.error(data?.error ?? "Erro ao salvar post.")
      return
    }

    const data = await res.json().catch(() => null)
    if (data?.ok) {
      setSavedGlobal(postId, Boolean(data.saved))
      if (typeof data.savedCount === "number") setCount(data.savedCount)
      if (!data.saved) onUnsaved?.(postSlug)
    }
  }

  const tooltipText = !user
    ? "Entre na sua conta pra salvar posts e ler depois"
    : saved
      ? "Remover dos posts salvos"
      : "Salvar post para ler depois"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="pointer-events-auto inline-flex">
          <button
            type="button"
            onClick={handleClick}
            disabled={Boolean(user) && savedListLoading}
            aria-pressed={saved}
            aria-label={tooltipText}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              saved ? "border-primary/50 bg-primary/10 text-primary" : "border-border",
              "hover:border-primary/40 hover:text-primary"
            )}
          >
            <Bookmark className="size-3.5" fill={saved ? "currentColor" : "none"} strokeWidth={1.75} />
            {count > 0 && count}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56 text-center">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Card de post no estilo Reddit/Twitter: avatar + autor + tempo, texto
 * corrido (sem título separado), mídia opcional, rodapé com Comentários /
 * Compartilhar. Usado tanto na listagem quanto no cabeçalho da página de
 * post individual.
 */
export function PostCard({
  post,
  clickable = true,
  compact = true,
  currentUserId = null,
  onOwnPostVisibilityChange,
  onOwnPostDeleted,
  onOwnPostUnsaved,
}: {
  post: PostCardData
  clickable?: boolean
  compact?: boolean
  /** Id do usuário logado — quando bate com `post.user_id`, mostra os botões de ocultar/excluir. */
  currentUserId?: string | null
  /** Quando definido, o botão de ocultar não navega — deixa o chamador atualizar a lista. */
  onOwnPostVisibilityChange?: (slug: string, hidden: boolean) => void
  /** Quando definido, o botão de excluir não navega — deixa o chamador remover o post da lista. */
  onOwnPostDeleted?: (slug: string) => void
  /** Usado só por /forum/salvos — quando definido, remover dos salvos tira o card da lista sem esperar reload. */
  onOwnPostUnsaved?: (slug: string) => void
}) {
  const isOwner = Boolean(currentUserId) && post.user_id === currentUserId
  const youtubeId = post.media_video_url ? extractYoutubeId(post.media_video_url) : null

  return (
    <div
      className={cn(
        "group relative rounded-xl border transition-all",
        clickable && "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20",
        post.is_hidden && "opacity-60",
        post.is_pinned
          ? "border-primary/40 bg-primary/[0.06] ring-1 ring-primary/15 hover:border-primary/60"
          : CARD_SURFACE_INTERACTIVE,
      )}
    >
      {clickable && (
        <Link href={`/forum/${post.slug}`} aria-label="Ver post" className="absolute inset-0 z-0 rounded-xl" />
      )}

      <div className={`relative z-10 flex items-start gap-3 p-4 ${clickable ? "pointer-events-none" : ""}`}>
        {/* `pointer-events-auto` reabre o hover: quando o card inteiro é
            clicável, a camada acima o desliga para o link de fundo receber o
            clique — mas a foto do autor precisa continuar reagindo ao cursor
            para abrir o Mini Perfil. */}
        <AuthorAvatarLink
          author={{ userId: post.user_id, displayName: post.author_display_name, displaySlug: post.author_display_slug }}
          avatarUrl={post.author_avatar_url}
          size={9}
          onClick={(event) => event.stopPropagation()}
          className="pointer-events-auto relative z-10"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <AuthorNameLink
              author={{ userId: post.user_id, displayName: post.author_display_name, displaySlug: post.author_display_slug }}
              onClick={(event) => event.stopPropagation()}
              className="pointer-events-auto relative z-10 font-semibold"
            />
            <AuthorTierBadge tier={post.author_account_tier} vipExpiresAt={post.author_vip_expires_at} />
            <AuthorSpecialTagBadge slug={post.author_display_slug} />
            <span>·</span>
            <span>{format(new Date(post.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
            {post.is_pinned && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Pin className="size-2.5" />
                Fixado
              </span>
            )}
            {post.is_hidden && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <EyeOff className="size-2.5" />
                Oculto
              </span>
            )}
            {post.is_locked && <Lock className="size-3 text-amber-500" />}
            <CategoryBadge category={post.category} linked={!clickable} />
          </div>

          <p className={`mt-2 break-words font-semibold text-foreground ${compact ? "line-clamp-2" : ""}`}>
            {post.title}
          </p>

          {!compact && post.body && (
            <CommentBody body={post.body} className="mt-1 text-muted-foreground" />
          )}

          {post.media_image_urls.length > 0 && (
            <ImageLightbox
              srcs={post.media_image_urls}
              alt={`Imagem do post de ${post.author_display_name}${post.category ? ` sobre ${post.category.name}` : ""}`}
            />
          )}

          {youtubeId && (
            <div className="relative z-10 mt-3 aspect-video overflow-hidden rounded-lg border border-border/50 pointer-events-auto">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}`}
                title="Vídeo do post"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="size-full"
              />
            </div>
          )}

          <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2 pointer-events-auto">
            <PostAuraButton postSlug={post.slug} authorId={post.user_id} initialCount={post.aura_count} />
            <PostSaveButton postId={post.id} postSlug={post.slug} initialCount={post.saved_count} onUnsaved={onOwnPostUnsaved} />
            <Link
              href={clickable ? `/forum/${post.slug}#comments` : "#comments"}
              onClick={(event) => event.stopPropagation()}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <MessageCircle className="size-3.5" />
              {post.comment_count}
            </Link>
            {!post.is_hidden && <ShareMenu slug={post.slug} title={post.title} />}
            {isOwner ? (
              <>
                <PostVisibilityButton
                  postSlug={post.slug}
                  isHidden={Boolean(post.is_hidden)}
                  onChanged={onOwnPostVisibilityChange}
                />
                <PostDeleteButton postSlug={post.slug} onDeleted={onOwnPostDeleted} />
              </>
            ) : (
              <ReportMenu postSlug={post.slug} targetType="post" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
