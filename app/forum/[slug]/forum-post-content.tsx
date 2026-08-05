"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, EyeOff } from "lucide-react"

import { PostCard, type PostCardData } from "@/components/forum/PostCard"
import { ForumPostSidebar } from "@/components/forum/ForumPostSidebar"
import { useAuthUser } from "@/components/providers/auth-context"
import { CommentsSection } from "@/components/comments/CommentsSection"
import type { CommentItem } from "@/components/comments/types"
import type { ForumPostDetail, ForumSidebarData } from "@/lib/server/repositories/forum-repository"
import type { ProfileShowcase } from "@/lib/profile-showcase"

/**
 * O post e a 1ª página de comentários chegam prontos do servidor (SSR) —
 * páginas seguintes e troca de ordenação são buscadas sob demanda pelo
 * `CommentsSection`/`useCommentsController` via `/api/forum/posts/[slug]/comments`.
 */
export function ForumPostContent({
  post,
  initialComments,
  initialHasMoreComments,
  sidebarData,
  authorProfile,
}: {
  post: ForumPostDetail
  initialComments: CommentItem[]
  initialHasMoreComments: boolean
  sidebarData: ForumSidebarData
  /** `null` para posts de convidado (sem `user_id`) — a sidebar cai pros dados básicos do post. */
  authorProfile: ProfileShowcase | null
}) {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const [comments, setComments] = useState<CommentItem[]>(initialComments)
  const { user: contextUser, loading: authLoading } = useAuthUser()
  const authUser = useMemo(
    () =>
      contextUser
        ? { id: contextUser.id, display_name: contextUser.displayName, avatar_url: contextUser.avatarUrl }
        : null,
    [contextUser]
  )

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar ao fórum
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {post.is_hidden && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-500">
              <EyeOff className="size-4 shrink-0" />
              <span>
                Este post está oculto — só você consegue vê-lo. Use o botão &quot;Mostrar post&quot;
                abaixo para reativá-lo.
              </span>
            </div>
          )}

          <PostCard
            post={post as PostCardData}
            clickable={false}
            compact={false}
            currentUserId={authUser?.id ?? null}
            onOwnPostVisibilityChange={() => router.refresh()}
          />

          <CommentsSection
            apiBasePath={`/api/forum/posts/${params.slug}`}
            auraLookupPath="/api/forum/aura"
            comments={comments}
            onCommentsChange={setComments}
            initialHasMore={initialHasMoreComments}
            totalCount={post.comment_count}
            authUser={authUser}
            authLoading={authLoading}
            isLocked={post.is_locked}
            reportPostSlug={post.slug}
          />
        </div>

        <ForumPostSidebar
          category={post.category}
          author={{
            display_name: post.author_display_name,
            avatar_url: post.author_avatar_url,
            account_tier: post.author_account_tier,
            display_slug: post.author_display_slug,
          }}
          authorProfile={authorProfile}
          stats={sidebarData}
        />
      </div>
    </div>
  )
}
