"use client"

import { useCallback, useState } from "react"

import { PostCard, type PostCardData } from "@/components/forum/PostCard"
import { InfiniteScrollSentinel } from "@/components/forum/InfiniteScrollSentinel"
import BoxLoader from "@/components/ui/box-loader"

export function CategoryPostsList({
  categorySlug,
  initialPosts,
  initialHasMore,
}: {
  categorySlug: string
  initialPosts: PostCardData[]
  initialHasMore: boolean
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    try {
      setLoadingMore(true)
      const nextPage = page + 1
      const res = await fetch(`/api/forum/categoria/${categorySlug}/posts?page=${nextPage}`)
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.posts) return
      setPosts((prev) => [...prev, ...(data.posts as PostCardData[])])
      setHasMore(Boolean(data.hasMore))
      setPage(nextPage)
    } finally {
      setLoadingMore(false)
    }
  }, [categorySlug, page, hasMore, loadingMore])

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {hasMore && <InfiniteScrollSentinel onIntersect={loadMore} />}
      {loadingMore && (
        <div className="flex items-center justify-center py-6">
          <BoxLoader />
        </div>
      )}
    </div>
  )
}
