import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getYouTubeChannelFeed } from "@/lib/server/integrations/youtube"
import { listActiveBanners, type HomeBanner } from "@/lib/server/repositories/banners-repository"
import { listFeaturedProducts, type FeaturedProduct } from "@/lib/server/repositories/store-repository"
import { listActiveEventsForDisplay } from "@/lib/server/repositories/events-repository"
import type { EventDisplay } from "@/lib/events"

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
  body_preview: string
  author_name: string
  author_avatar_url: string | null
  media_image_url: string | null
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
  /** Eventos ativos (medalhas em resgate) — a personalização por usuário (já resgatado?) é carregada à parte no client, ver `EventsShowcase`. */
  events: EventDisplay[]
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
    activeEvents,
  ] = await Promise.all([
    // Banner é conteúdo de vitrine: se a consulta falhar, a Home cai no hero
    // padrão em vez de derrubar a página inteira.
    listActiveBanners().catch(() => [] as HomeBanner[]),
    db
      .from("peripherals")
      .select("id, name, brand, image_url, category, tier")
      .order("created_at", { ascending: false })
      .limit(4),
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
      .select("id, slug, body_preview, author_name, user_id, media_image_url, created_at")
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(4),
    getYouTubeChannelFeed({ forceRefresh: false }).catch(() => ({ data: null, error: null })),
    Promise.all([
      db.from("peripherals").select("id", { count: "exact", head: true }),
      db.from("blog_posts").select("id", { count: "exact", head: true }).eq("is_published", true),
      db.from("forum_posts").select("id", { count: "exact", head: true }).eq("is_hidden", false),
    ]),
    // Sem estado por usuário aqui de propósito: manter a Home cacheável (ISR).
    // "Já resgatei essa?" é resolvido no client por `EventsShowcase`.
    listActiveEventsForDisplay().catch(() => [] as EventDisplay[]),
  ])

  const forumRows = forumPostsRes.data ?? []
  const authorIds = [...new Set(forumRows.map((p) => p.user_id).filter((id): id is string => Boolean(id)))]
  const avatarMap: Record<string, string | null> = {}
  if (authorIds.length > 0) {
    const { data: profiles } = await db.from("user_profiles").select("id, avatar_url").in("id", authorIds)
    for (const row of profiles ?? []) avatarMap[row.id] = row.avatar_url
  }

  return {
    banners,
    peripherals: (topPeripheralsRes.data ?? []) as unknown as HomeTopPeripheral[],
    blog: (latestBlogRes.data ?? []) as unknown as HomeBlogPost[],
    products: featuredProducts,
    forum: forumRows.map((p) => ({
      id: p.id,
      slug: p.slug,
      body_preview: p.body_preview,
      author_name: p.author_name,
      author_avatar_url: p.user_id ? avatarMap[p.user_id] ?? null : null,
      media_image_url: p.media_image_url,
      created_at: p.created_at,
    })),
    videos: ((ytFeed?.data?.videos ?? []) as HomeVideo[]).slice(0, 3),
    events: activeEvents.filter((event) => event.active).slice(0, 6),
    counts: {
      peripherals: countsRes[0].count ?? 0,
      reviews: countsRes[1].count ?? 0,
      forumPosts: countsRes[2].count ?? 0,
    },
  }
}
