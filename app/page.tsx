import Link from "next/link"
import {
  ArrowRight,
  BadgePercent,
  Crown,
  MessageCircle,
  Newspaper,
  Package,
  PlayCircle,
  Recycle,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from "lucide-react"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getYouTubeChannelFeed } from "@/lib/youtube"
import { formatBRL } from "@/lib/stripe"
import { mapTier } from "@/lib/tier-utils"
import { CARD_TIER_STYLES } from "@/lib/tierlist-theme"
import { cn } from "@/lib/utils"

export const revalidate = 300

const CATEGORY_LABELS: Record<string, string> = {
  keyboard: "Teclado",
  mouse: "Mouse",
  mousepad: "Mousepad",
  glasspad: "Glasspad",
  iem: "IEM",
  headset: "Headset",
  feet: "Feet",
  chairs: "Cadeira",
  monitors: "Monitor",
  switches: "Switches",
  dac_amp: "DAC/AMP",
}

type Peripheral = {
  id: string
  name: string
  brand: string
  image_url: string | null
  category: string
  tier: string | null
}

type BlogPost = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_image_url: string | null
  cover_thumbnail_url: string | null
  read_time_minutes: number | null
  created_at: string
}

type StoreProduct = {
  id: string
  slug: string
  name: string
  price_cents: number
  images: string[]
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
}

type ForumPost = {
  id: string
  slug: string
  title: string
  author_name: string
  created_at: string
}

async function fetchHomeData() {
  const db = createSupabaseAdminClient()

  const [topPeripheralsRes, latestBlogRes, featuredProductsRes, forumPostsRes, ytFeed, countsRes] =
    await Promise.all([
      db
        .from("peripherals")
        .select("id, name, brand, image_url, category, tier")
        .in("tier", ["GOAT", "SS", "S"])
        .order("created_at", { ascending: false })
        .limit(8),
      db
        .from("blog_posts")
        .select("id, slug, title, excerpt, cover_image_url, cover_thumbnail_url, read_time_minutes, created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(3),
      db
        .from("store_products")
        .select("id, slug, name, price_cents, images, type, condition")
        .eq("is_active", true)
        .gt("stock", 0)
        .order("created_at", { ascending: false })
        .limit(6),
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

  const peripherals = (topPeripheralsRes.data ?? []) as Peripheral[]
  const blog = (latestBlogRes.data ?? []) as BlogPost[]
  const products = (featuredProductsRes.data ?? []) as StoreProduct[]
  const forum = (forumPostsRes.data ?? []) as ForumPost[]
  const videos = (ytFeed?.data?.videos ?? []).slice(0, 3)

  return {
    peripherals,
    blog,
    products,
    forum,
    videos,
    counts: {
      peripherals: countsRes[0].count ?? 0,
      reviews: countsRes[1].count ?? 0,
      forumPosts: countsRes[2].count ?? 0,
    },
  }
}

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "agora"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d`
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  href,
  linkLabel = "Ver tudo",
}: {
  icon: React.ElementType
  title: string
  subtitle?: string
  href: string
  linkLabel?: string
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <Icon className="size-5 text-slate-300" />
          <h2 className="text-xl font-bold tracking-tight text-slate-100 md:text-2xl">{title}</h2>
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500 md:text-sm">{subtitle}</p>}
      </div>
      <Link
        href={href}
        className="group flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-slate-400 transition-all hover:border-white/[0.18] hover:bg-white/[0.05] hover:text-slate-100"
      >
        {linkLabel}
        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}

export default async function HomePage() {
  const { peripherals, blog, products, forum, videos, counts } = await fetchHomeData()

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-6 md:px-6 lg:px-8 md:py-10">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#0a0e17] via-[#0f1525] to-[#0a0e17] px-6 py-10 md:px-12 md:py-16">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
            <Sparkles className="size-3 text-amber-300" />
            <span>Tierlist em constante atualização</span>
          </div>

          <h1 className="text-4xl font-black tracking-tight text-slate-50 md:text-5xl lg:text-6xl">
            Periféricos sem <span className="text-primary">mistério</span>.
          </h1>

          <p className="max-w-2xl text-base text-slate-400 md:text-lg">
            A tierlist definitiva, reviews honestos, comunidade ativa e uma loja com itens
            selecionados pelo Sunano.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/tierlist"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/30"
            >
              <Package className="size-4" />
              Explorar Tierlist
            </Link>
            <Link
              href="/loja"
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-300 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/15"
            >
              <ShoppingBag className="size-4" />
              Ver Loja
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-6 sm:max-w-md">
            <div>
              <div className="text-2xl font-bold text-slate-100">{counts.peripherals}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Periféricos</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-100">{counts.reviews}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Reviews</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-100">{counts.forumPosts}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Tópicos</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ TOP DO TIER ============ */}
      {peripherals.length > 0 && (
        <section>
          <SectionHeader
            icon={Crown}
            title="Top do Tier"
            subtitle="Os melhores periféricos avaliados"
            href="/tierlist"
            linkLabel="Tierlist completa"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {peripherals.slice(0, 8).map((p) => {
              const tier = p.tier ? mapTier(p.tier) : null
              const tierStyle = tier ? CARD_TIER_STYLES[tier as keyof typeof CARD_TIER_STYLES] : null
              return (
                <Link
                  key={p.id}
                  href="/tierlist"
                  className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0e17]/80 p-3 transition-all hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-[#0d121e]"
                >
                  {/* Tier accent bar */}
                  {tierStyle && (
                    <div className={cn("absolute bottom-0 left-0 top-0 w-[3px]", tierStyle.accent)} />
                  )}

                  <div className="flex flex-col gap-3 pl-1.5">
                    <div className="relative h-20 overflow-hidden rounded-md bg-black/30">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="absolute inset-0 size-full object-contain p-2 transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-600">
                          <Package className="size-6" />
                        </div>
                      )}
                      {tier && (
                        <div
                          className={cn(
                            "absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold",
                            tierStyle?.bg,
                            tierStyle?.text
                          )}
                        >
                          {tier}
                        </div>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">
                        {CATEGORY_LABELS[p.category] ?? p.category}
                      </p>
                      <p className="line-clamp-1 text-sm font-semibold text-slate-100">{p.name}</p>
                      <p className="line-clamp-1 text-xs text-slate-500">{p.brand}</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ============ REVIEWS ============ */}
      {blog.length > 0 && (
        <section>
          <SectionHeader
            icon={Newspaper}
            title="Últimos reviews"
            subtitle="Análises detalhadas, sem enrolação"
            href="/blog"
            linkLabel="Ver todos"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {blog.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="group overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0e17]/80 transition-all hover:-translate-y-0.5 hover:border-white/[0.18]"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-black/30">
                  {(post.cover_thumbnail_url || post.cover_image_url) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.cover_thumbnail_url || post.cover_image_url || ""}
                      alt={post.title}
                      className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <p className="line-clamp-2 text-sm font-semibold text-slate-100 group-hover:text-white">
                    {post.title}
                  </p>
                  {post.excerpt && (
                    <p className="line-clamp-2 text-xs text-slate-500">{post.excerpt}</p>
                  )}
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-600">
                    <span>{formatTimeAgo(post.created_at)}</span>
                    {post.read_time_minutes && (
                      <>
                        <span>·</span>
                        <span>{post.read_time_minutes} min</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ============ LOJA & BAZAR ============ */}
      {products.length > 0 && (
        <section>
          <SectionHeader
            icon={ShoppingBag}
            title="Loja & Bazar"
            subtitle="Produtos novos e itens usados pelo Sunano"
            href="/loja"
            linkLabel="Ver loja"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.slice(0, 4).map((product) => {
              const isBazar = product.type === "bazaar"
              return (
                <Link
                  key={product.id}
                  href={isBazar ? `/bazar/${product.slug}` : `/loja/${product.slug}`}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border bg-[#0a0e17]/80 transition-all hover:-translate-y-0.5",
                    isBazar
                      ? "border-amber-500/20 hover:border-amber-500/40"
                      : "border-white/[0.08] hover:border-emerald-500/30"
                  )}
                >
                  {isBazar && (
                    <div className="absolute right-2 top-2 z-10 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-950">
                      Usado
                    </div>
                  )}
                  <div className="relative aspect-square bg-black/30">
                    {product.images?.[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-1 text-xs font-semibold text-slate-100">{product.name}</p>
                    <p
                      className={cn(
                        "text-sm font-bold",
                        isBazar ? "text-amber-400" : "text-emerald-400"
                      )}
                    >
                      {formatBRL(product.price_cents)}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Quick links to both */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link
              href="/loja"
              className="group flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10"
            >
              <div className="flex items-center gap-3">
                <ShoppingBag className="size-5 text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-emerald-300">Loja</p>
                  <p className="text-[11px] text-emerald-500/70">Produtos novos</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-emerald-400 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/bazar"
              className="group flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 transition-all hover:border-amber-500/40 hover:bg-amber-500/10"
            >
              <div className="flex items-center gap-3">
                <Recycle className="size-5 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-amber-300">Bazar</p>
                  <p className="text-[11px] text-amber-500/70">Itens usados</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-amber-400 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      )}

      {/* ============ TWO COLUMNS: FORUM + VIDEOS ============ */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Forum */}
        {forum.length > 0 && (
          <div>
            <SectionHeader
              icon={MessageCircle}
              title="Comunidade"
              subtitle="Discussões recentes"
              href="/forum"
              linkLabel="Ir ao fórum"
            />
            <div className="space-y-2">
              {forum.map((post) => (
                <Link
                  key={post.id}
                  href={`/forum/${post.slug}`}
                  className="group block rounded-xl border border-white/[0.08] bg-[#0a0e17]/80 p-3 transition-all hover:border-white/[0.18] hover:bg-[#0d121e]"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-slate-500 group-hover:bg-primary/10 group-hover:text-primary">
                      <MessageCircle className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-semibold text-slate-100 group-hover:text-white">
                        {post.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                        <span>{post.author_name}</span>
                        <span>·</span>
                        <span>{formatTimeAgo(post.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Videos */}
        {videos.length > 0 && (
          <div>
            <SectionHeader
              icon={PlayCircle}
              title="Vídeos recentes"
              subtitle="Direto do canal"
              href="/videos"
              linkLabel="Ver canal"
            />
            <div className="space-y-2">
              {videos.map((video) => (
                <a
                  key={video.id}
                  href={video.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex gap-3 rounded-xl border border-white/[0.08] bg-[#0a0e17]/80 p-2 transition-all hover:border-white/[0.18] hover:bg-[#0d121e]"
                >
                  <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-black/30">
                    {video.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <PlayCircle className="size-7 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 py-1 pr-2">
                    <p className="line-clamp-2 text-sm font-medium text-slate-100 group-hover:text-white">
                      {video.title}
                    </p>
                    {video.publishedAt && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {formatTimeAgo(video.publishedAt)}
                      </p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ============ QUICK NAV ============ */}
      <section>
        <SectionHeader
          icon={TrendingUp}
          title="Explore tudo"
          subtitle="Atalhos para todas as seções"
          href="/perifericos"
          linkLabel="Periféricos"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { href: "/perifericos", icon: Package, label: "Periféricos", color: "slate" },
            { href: "/blog", icon: Newspaper, label: "Reviews", color: "slate" },
            { href: "/offers", icon: BadgePercent, label: "Ofertas", color: "slate" },
            { href: "/forum", icon: MessageCircle, label: "Fórum", color: "slate" },
          ].map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0a0e17]/80 p-4 transition-all hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-[#0d121e]"
              >
                <Icon className="size-5 text-slate-400 group-hover:text-slate-200" />
                <span className="text-sm font-semibold text-slate-200 group-hover:text-white">
                  {item.label}
                </span>
                <ArrowRight className="ml-auto size-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300" />
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
