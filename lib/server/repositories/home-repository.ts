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
  media_image_urls: string[]
  created_at: string
}

export type HomeTrendingPost = HomeForumPost & {
  aura_count: number
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
  /** Post(s) "em alta" (maior aura nos últimos 7 dias) — até 2, vazio se nada se destacar. */
  trendingForum: HomeTrendingPost[]
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
    trendingForumRes,
    ytFeed,
    countsRes,
    activeEvents,
  ] = await Promise.all([
    // Banner é conteúdo de vitrine: se a consulta falhar, a Home cai no hero
    // padrão em vez de derrubar a página inteira.
    listActiveBanners().catch(() => [] as HomeBanner[]),
    db
      .from("peripherals")
      .select("id, name, brand_id, brands(name), image_url, category, tier")
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
      .select("id, slug, body_preview, author_name, user_id, media_image_urls, created_at")
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(4),
    // "Em alta": maior aura acumulada (soma da aura dos comentários) dentre os
    // posts dos últimos 7 dias — mesmo campo denormalizado usado no fórum
    // (ver aura_count em forum-repository.ts). Só interessa se tiver aura de
    // verdade, por isso o filtro `gt(0)` — sem isso o "em alta" poderia
    // destacar um post qualquer com zero engajamento.
    db
      .from("forum_posts")
      .select("id, slug, body_preview, author_name, user_id, media_image_urls, created_at, aura_count")
      .eq("is_hidden", false)
      .gt("aura_count", 0)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("aura_count", { ascending: false })
      .limit(2),
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
  const trendingRows = trendingForumRes.data ?? []
  const authorIds = [
    ...new Set(
      [...forumRows, ...trendingRows].map((p) => p.user_id).filter((id): id is string => Boolean(id))
    ),
  ]
  const avatarMap: Record<string, string | null> = {}
  if (authorIds.length > 0) {
    const { data: profiles } = await db.from("user_profiles").select("id, avatar_url").in("id", authorIds)
    for (const row of profiles ?? []) avatarMap[row.id] = row.avatar_url
  }

  const topPeripheralRows = (topPeripheralsRes.data ?? []) as unknown as Array<{
    id: string
    name: string
    brand_id: string
    brands: { name: string } | { name: string }[] | null
    image_url: string | null
    category: string
    tier: string | null
  }>

  return {
    banners,
    peripherals: topPeripheralRows.map((row) => ({
      id: row.id,
      name: row.name,
      brand: (Array.isArray(row.brands) ? row.brands[0] : row.brands)?.name ?? "",
      image_url: row.image_url,
      category: row.category,
      tier: row.tier,
    })),
    blog: (latestBlogRes.data ?? []) as unknown as HomeBlogPost[],
    products: featuredProducts,
    forum: forumRows.map((p) => ({
      id: p.id,
      slug: p.slug,
      body_preview: p.body_preview,
      author_name: p.author_name,
      author_avatar_url: p.user_id ? avatarMap[p.user_id] ?? null : null,
      media_image_urls: p.media_image_urls ?? [],
      created_at: p.created_at,
    })),
    trendingForum: trendingRows.map((p) => ({
      id: p.id,
      slug: p.slug,
      body_preview: p.body_preview,
      author_name: p.author_name,
      author_avatar_url: p.user_id ? avatarMap[p.user_id] ?? null : null,
      media_image_urls: p.media_image_urls ?? [],
      created_at: p.created_at,
      aura_count: p.aura_count ?? 0,
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
