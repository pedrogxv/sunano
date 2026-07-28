import Link from "next/link"
import {
  ArrowRight,
  Crown,
  MessageCircle,
  Newspaper,
  Package,
  PlayCircle,
  Recycle,
  ShoppingBag,
} from "lucide-react"

import BannerCarousel from "@/components/home/BannerCarousel"
import DefaultHero from "@/components/home/DefaultHero"
import HeroHighlightsBar from "@/components/home/HeroHighlightsBar"
import { getHomeData } from "@/lib/server/repositories/home-repository"
import { formatBRL } from "@/lib/stripe"
import { mapTier } from "@/lib/tier-utils"
import { CARD_TIER_STYLES } from "@/lib/tierlist-theme"
import { cn } from "@/lib/utils"

export const revalidate = 300

// TODO: reativar quando Loja/Bazar estiverem prontos para lançamento.
// Enquanto false, a seção "Loja & Bazar" fica oculta na Home (o menu lateral
// e as rotas /loja e /bazar continuam funcionando normalmente).
const SHOW_STORE_SECTION = false

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
          <Icon className="size-5 text-muted-foreground" />
          <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{title}</h2>
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{subtitle}</p>}
      </div>
      <Link
        href={href}
        className="group flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:bg-muted hover:text-foreground"
      >
        {linkLabel}
        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}

export default async function HomePage() {
  const { banners, peripherals, blog, products, forum, videos, counts } = await getHomeData()

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-6 md:px-6 lg:px-8 md:py-10">
      {/* ============ HERO ============ */}
      {/* Com banners no ar (/admin/banners) o topo vira um carrossel; sem
          nenhum, cai no hero padrão. A faixa abaixo preserva os CTAs e os
          números que o hero trazia — trocar a arte não deve custar conversão. */}
      {banners.length > 0 ? (
        <div className="space-y-4">
          <BannerCarousel
            banners={banners.map((banner) => ({
              id: banner.id,
              imageUrl: banner.image_url,
              imageUrlMobile: banner.image_url_mobile,
              linkUrl: banner.link_url,
              altText: banner.alt_text,
            }))}
          />
          <HeroHighlightsBar counts={counts} />
        </div>
      ) : (
        <DefaultHero counts={counts} />
      )}

      {/* ============ TOP TIER ============ */}
      {peripherals.length > 0 && (
        <section>
          <SectionHeader
            icon={Crown}
            title="Top Tier"
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
                  className="group relative overflow-hidden rounded-xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-accent"
                >
                  {/* Tier accent bar */}
                  {tierStyle && (
                    <div className={cn("absolute bottom-0 left-0 top-0 w-[3px]", tierStyle.accent)} />
                  )}

                  <div className="flex flex-col gap-3 pl-1.5">
                    <div className="relative h-20 overflow-hidden rounded-md bg-muted">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="absolute inset-0 size-full object-contain p-2 transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
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
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {CATEGORY_LABELS[p.category] ?? p.category}
                      </p>
                      <p className="line-clamp-1 text-sm font-semibold text-foreground">{p.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{p.brand}</p>
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
                className="group overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-foreground/20"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-muted">
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
                  <p className="line-clamp-2 text-sm font-semibold text-foreground/90 group-hover:text-foreground">
                    {post.title}
                  </p>
                  {post.excerpt && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{post.excerpt}</p>
                  )}
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
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
      {SHOW_STORE_SECTION && products.length > 0 && (
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
                    "group relative overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5",
                    isBazar
                      ? "border-amber-500/20 hover:border-amber-500/40"
                      : "border-border hover:border-emerald-500/30"
                  )}
                >
                  {isBazar && (
                    <div className="absolute right-2 top-2 z-10 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-950">
                      Usado
                    </div>
                  )}
                  <div className="relative aspect-square bg-muted">
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
                    <p className="line-clamp-1 text-xs font-semibold text-foreground">{product.name}</p>
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
                  className="group block rounded-xl border border-border bg-card p-3 transition-all hover:border-foreground/20 hover:bg-accent"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                      <MessageCircle className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-semibold text-foreground/90 group-hover:text-foreground">
                        {post.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
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
                  className="group flex gap-3 rounded-xl border border-border bg-card p-2 transition-all hover:border-foreground/20 hover:bg-accent"
                >
                  <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-muted">
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
                    <p className="line-clamp-2 text-sm font-medium text-foreground/90 group-hover:text-foreground">
                      {video.title}
                    </p>
                    {video.publishedAt && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
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
    </div>
  )
}
