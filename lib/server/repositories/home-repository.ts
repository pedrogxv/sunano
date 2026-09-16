import "server-only"

import { profileMediaProxyUrl } from "@/lib/account-tier"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getYouTubeChannelFeed } from "@/lib/server/integrations/youtube"
import { listActiveBanners, type HomeBanner } from "@/lib/server/repositories/banners-repository"
import { listFeaturedProducts, type FeaturedProduct } from "@/lib/server/repositories/store-repository"
import {
  getPeripheralOwners,
  listActiveAuraItems,
  type AuraItem,
  type PeripheralOwner,
} from "@/lib/server/repositories/aura-store-repository"
import { listActiveEventsForDisplay } from "@/lib/server/repositories/events-repository"
import type { EventDisplay } from "@/lib/events"
import { profileFrameOf, type ProfileFrameIdentity } from "@/lib/profile-frames"
import { getProfileFramesByUser } from "@/lib/server/repositories/vip-founder-repository"

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
  /** Moldura do autor, pronta para `ProfileAvatar` — a home desenha a mesma do resto do site. */
  author_frame: ProfileFrameIdentity
  media_image_urls: string[]
  created_at: string
}

export type HomeTrendingPost = HomeForumPost & {
  aura_count: number
}

/**
 * Produto físico da Central de Aura em destaque na Home — o item de maior
 * apelo da Central, e a razão de a pessoa juntar Aura. Só o que a vitrine
 * precisa: nada por usuário, para a Home continuar cacheável (ISR).
 */
export type HomeAuraPeripheral = {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  auraCost: number
  /** Unidades cadastradas. */
  stock: number
  /** Unidades ainda disponíveis (estoque − resgatados). Zero = esgotado. */
  unitsLeft: number
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
  /** Produtos físicos da Central de Aura, os de maior apelo primeiro. */
  auraPeripherals: HomeAuraPeripheral[]
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
    auraItems,
    auraPeripheralOwners,
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
    // Vitrine da Central de Aura. Tudo aqui é conteúdo público (catálogo e
    // quantas unidades restam), sem nada por usuário — a Home segue cacheável.
    // Se qualquer uma falhar, a seção some em vez de derrubar a página.
    listActiveAuraItems().catch(() => [] as AuraItem[]),
    getPeripheralOwners().catch(() => new Map<string, PeripheralOwner[]>()),
  ])

  const forumRows = forumPostsRes.data ?? []
  const trendingRows = trendingForumRes.data ?? []
  const authorIds = [
    ...new Set(
      [...forumRows, ...trendingRows].map((p) => p.user_id).filter((id): id is string => Boolean(id))
    ),
  ]
  const avatarMap: Record<string, string | null> = {}
  // Tier e validade do VIP entram junto do avatar: sem eles a home não
  // conseguia montar a moldura do autor, e o avatar saía cru enquanto o
  // perfil da pessoa mostrava a moldura dela.
  const tierMap: Record<string, { tier: string | null; expiresAt: string | null }> = {}
  let frameOf: Awaited<ReturnType<typeof getProfileFramesByUser>> | null = null

  if (authorIds.length > 0) {
    const [{ data: profiles }, resolver] = await Promise.all([
      db.from("user_profiles").select("id, avatar_url, account_tier, vip_expires_at").in("id", authorIds),
      getProfileFramesByUser(authorIds),
    ])
    frameOf = resolver
    // Nunca a coluna crua — ver `profileMediaProxyUrl` em `lib/account-tier.ts`.
    for (const row of profiles ?? []) {
      avatarMap[row.id] = row.avatar_url ? profileMediaProxyUrl(row.id, "avatar") : null
      tierMap[row.id] = { tier: row.account_tier, expiresAt: row.vip_expires_at }
    }
  }

  /** Moldura do autor de um post da home (convidado = sem moldura). */
  const authorFrame = (userId: string | null): ProfileFrameIdentity => {
    if (!userId || !frameOf) return profileFrameOf({})
    const t = tierMap[userId]
    return frameOf(userId, t?.tier ?? null, t?.expiresAt ?? null)
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

  // Produtos físicos da Central, com o estoque restante já descontado. A
  // ordem é a de maior apelo: disponível antes de esgotado e, dentro disso,
  // o mais caro primeiro — é o item que justifica juntar Aura. Esgotado
  // continua aparecendo (prova de que alguém levou), mas nunca na frente.
  const auraPeripherals: HomeAuraPeripheral[] = auraItems
    .filter((item) => item.kind === "peripheral")
    .map((item) => {
      const claimed = auraPeripheralOwners.get(item.id)?.length ?? 0
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        auraCost: item.auraCost,
        stock: item.stock,
        unitsLeft: Math.max(item.stock - claimed, 0),
      }
    })
    .sort((a, b) => {
      const availability = Number(b.unitsLeft > 0) - Number(a.unitsLeft > 0)
      return availability !== 0 ? availability : b.auraCost - a.auraCost
    })

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
    auraPeripherals,
    forum: forumRows.map((p) => ({
      id: p.id,
      slug: p.slug,
      body_preview: p.body_preview,
      author_name: p.author_name,
      author_avatar_url: p.user_id ? avatarMap[p.user_id] ?? null : null,
      author_frame: authorFrame(p.user_id),
      media_image_urls: p.media_image_urls ?? [],
      created_at: p.created_at,
    })),
    trendingForum: trendingRows.map((p) => ({
      id: p.id,
      slug: p.slug,
      body_preview: p.body_preview,
      author_name: p.author_name,
      author_avatar_url: p.user_id ? avatarMap[p.user_id] ?? null : null,
      author_frame: authorFrame(p.user_id),
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
