import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Crown,
  Flame,
  MessageCircle,
  Package,
  PlayCircle,
  ShoppingBag,
} from "lucide-react"

import BannerCarousel from "@/components/home/BannerCarousel"
import DefaultHero from "@/components/home/DefaultHero"
import { EventsShowcase } from "@/components/home/EventsShowcase"
import HeroHighlightsBar from "@/components/home/HeroHighlightsBar"
import { UserAvatar } from "@/components/ui/user-avatar"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { getHomeData } from "@/lib/server/repositories/home-repository"
import { formatBRL } from "@/lib/format"
import { mapTier } from "@/lib/tier-utils"
import { CARD_TIER_STYLES } from "@/lib/tierlist-theme"
import { cn } from "@/lib/utils"

export const revalidate = 300

// Título/descrição da home vêm do `default` do layout raiz (já é a cópia
// certa para "/") — aqui só fixamos a URL canônica, sem sobrescrever o
// `title.template` com um título redundante ("Sunano | ... | Sunano").
export const metadata: Metadata = {
  alternates: { canonical: "/" },
}

// TODO: reativar quando a Loja estiver pronta para lançamento.
// Enquanto false, a seção "Loja" fica oculta na Home (o menu lateral
// e a rota /loja continuam funcionando normalmente).
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
  psu: "Fonte",
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
  const { banners, peripherals, products, forum, trendingForum, videos, events, counts } = await getHomeData()

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-2 py-6 sm:px-4 md:px-6 lg:px-8 md:py-10">
      {/* ============ HERO ============ */}
      {/* Com banners no ar (/admin/banners) o topo vira um carrossel — o hero
          padrão é só mais um slide dele (kind "hero" no banco), então entra
          na mesma ordem/ativação que os demais. Sem nenhum banner no ar
          (inclusive o hero desativado), cai no hero padrão sozinho, fixo. A
          faixa abaixo preserva os CTAs e os números em todos os slides. */}
      {banners.length > 0 ? (
        <div className="space-y-4">
          <BannerCarousel
            banners={banners.map((banner) =>
              banner.kind === "hero"
                ? { id: banner.id, kind: "custom" as const, content: <DefaultHero counts={counts} bare /> }
                : {
                    id: banner.id,
                    kind: "image" as const,
                    imageUrl: banner.image_url!,
                    imageUrlMobile: banner.image_url_mobile,
                    linkUrl: banner.link_url,
                    altText: banner.alt_text,
                  }
            )}
          />
          <HeroHighlightsBar counts={counts} />
        </div>
      ) : (
        <DefaultHero counts={counts} />
      )}

      {/* ============ EM ALTA ============ */}
      {peripherals.length > 0 && (
        <section>
          <SectionHeader
            icon={Crown}
            title="Em Alta"
            subtitle="Os últimos periféricos adicionados"
            href="/perifericos"
            linkLabel="Periféricos completo"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {peripherals.slice(0, 4).map((p) => {
              const tier = p.tier ? mapTier(p.tier) : null
              const tierStyle = tier ? CARD_TIER_STYLES[tier as keyof typeof CARD_TIER_STYLES] : null
              return (
                <Link
                  key={p.id}
                  href={`/perifericos/${buildPeripheralSlug(p.name, p.id)}`}
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

      {/* ============ CONQUISTAS EM DESTAQUE ============ */}
      {events.length > 0 && <EventsShowcase events={events} />}

      {/* ============ LOJA ============ */}
      {SHOW_STORE_SECTION && products.length > 0 && (
        <section>
          <SectionHeader
            icon={ShoppingBag}
            title="Loja"
            subtitle="Produtos novos escolhidos pelo Sunano"
            href="/loja"
            linkLabel="Ver loja"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.slice(0, 4).map((product) => (
              <Link
                key={product.id}
                href={`/loja/${product.slug}`}
                className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-emerald-500/30"
              >
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
                  <p className="text-sm font-bold text-emerald-400">{formatBRL(product.price_cents)}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-4">
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
              {trendingForum.map((post) => (
                <Link
                  key={post.id}
                  href={`/forum/${post.slug}`}
                  className="trending-post-card group relative block rounded-xl border bg-card p-3 transition-transform hover:-translate-y-0.5"
                >
                  <div className="relative z-10 flex items-start gap-3">
                    {post.media_image_urls[0] ? (
                      <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={post.media_image_urls[0]}
                          alt=""
                          className="size-full object-cover"
                        />
                      </div>
                    ) : (
                      <UserAvatar name={post.author_name} avatarUrl={post.author_avatar_url} size={10} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="aura-stat-icon-holder inline-flex shrink-0">
                          <Flame className="aura-stat-icon size-3.5 text-primary" fill="currentColor" strokeWidth={1.5} />
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                          Em alta
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-sm font-semibold text-foreground/90 group-hover:text-foreground">
                        {post.body_preview}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{post.author_name}</span>
                        <span>·</span>
                        <span>{formatTimeAgo(post.created_at)}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1 font-medium text-primary/80">
                          <Flame className="size-3" fill="currentColor" strokeWidth={1.5} />
                          {post.aura_count}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              {forum
                .filter((post) => !trendingForum.some((t) => t.id === post.id))
                .slice(0, Math.max(0, 4 - trendingForum.length))
                .map((post) => (
                <Link
                  key={post.id}
                  href={`/forum/${post.slug}`}
                  className="group block rounded-xl border border-border bg-card p-3 transition-all hover:border-foreground/20 hover:bg-accent"
                >
                  <div className="flex items-start gap-3">
                    {post.media_image_urls[0] ? (
                      <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={post.media_image_urls[0]}
                          alt=""
                          className="size-full object-cover"
                        />
                      </div>
                    ) : (
                      <UserAvatar name={post.author_name} avatarUrl={post.author_avatar_url} size={10} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-semibold text-foreground/90 group-hover:text-foreground">
                        {post.body_preview}
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
