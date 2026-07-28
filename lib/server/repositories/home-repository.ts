import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getYouTubeChannelFeed } from "@/lib/server/integrations/youtube"
import { listActiveBanners, type HomeBanner } from "@/lib/server/repositories/banners-repository"
import { listFeaturedProducts, type FeaturedProduct } from "@/lib/server/repositories/store-repository"

/**
 * Read model da Home — compõe, num único lugar, todas as consultas que a
 * página inicial precisa. A página (`app/page.tsx`) apenas renderiza o
 * resultado: nenhuma query vive no componente.
 */

export type HomeTopPeripheral = {
  id: string
  name: string
  brand: string
  image_url: string | null
  category: string
  tier: string | null
}

export type HomeBlogPost = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_image_url: string | null
  cover_thumbnail_url: string | null
  read_time_minutes: number | null
  created_at: string
}

export type HomeForumPost = {
  id: string
  slug: string
  title: string
  author_name: string
  created_at: string
}

export type HomeVideo = {
  id: string
  title: string
  watchUrl: string
  thumbnailUrl: string | null
  publishedAt: string | null
}

export type HomeData = {
  banners: HomeBanner[]
  peripherals: HomeTopPeripheral[]
  blog: HomeBlogPost[]
  products: FeaturedProduct[]
  forum: HomeForumPost[]
  videos: HomeVideo[]
  counts: {
    peripherals: number
    reviews: number
    forumPosts: number
  }
}

/** Carrega todos os dados da página inicial em paralelo. */
export async function getHomeData(): Promise<HomeData> {
  const db = createSupabaseAdminClient()

  const [
    banners,
    topPeripheralsRes,
    latestBlogRes,
    featuredProducts,
    forumPostsRes,
    ytFeed,
    countsRes,
  ] = await Promise.all([
    // Banner é conteúdo de vitrine: se a consulta falhar, a Home cai no hero
    // padrão em vez de derrubar a página inteira.
    listActiveBanners().catch(() => [] as HomeBanner[]),
    db
      .from("peripherals")
      .select("id, name, brand, image_url, category, tier")
      .in("tier", ["GOAT", "SS", "S"])
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("blog_posts")
      .select(
        "id, slug, title, excerpt, cover_image_url, cover_thumbnail_url, read_time_minutes, created_at"
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(3),
    listFeaturedProducts(6),
    db
      .from("forum_posts")
      .select("id, slug, title, author_name, created_at")
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(4),
    getYouTubeChannelFeed({ forceRefresh: false }).catch(() => ({ data: null, error: null })),
    Promise.all([
      db.from("peripherals").select("id", { count: "exact", head: true }),
      db.from("blog_posts").select("id", { count: "exact", head: true }).eq("is_published", true),
      db.from("forum_posts").select("id", { count: "exact", head: true }).eq("is_hidden", false),
    ]),
  ])

  return {
    banners,
    peripherals: (topPeripheralsRes.data ?? []) as unknown as HomeTopPeripheral[],
    blog: (latestBlogRes.data ?? []) as unknown as HomeBlogPost[],
    products: featuredProducts,
    forum: (forumPostsRes.data ?? []) as unknown as HomeForumPost[],
    videos: ((ytFeed?.data?.videos ?? []) as HomeVideo[]).slice(0, 3),
    counts: {
      peripherals: countsRes[0].count ?? 0,
      reviews: countsRes[1].count ?? 0,
      forumPosts: countsRes[2].count ?? 0,
    },
  }
}
