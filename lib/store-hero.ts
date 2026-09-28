import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

/**
 * Hero da Loja (módulo puro: tela pública, painel e rota usam o mesmo).
 *
 * Um slide é uma campanha: arte desktop e mobile, título, subtítulo, produto
 * relacionado, até dois botões e um período. Vários slides no ar viram um
 * carrossel; nenhum no ar devolve /loja à arte estática de sempre.
 */

export const HERO_TITLE_MAX = 120
export const HERO_SUBTITLE_MAX = 240
export const HERO_CTA_TEXT_MAX = 40

/** Linha do painel, espelho de `store_hero_slides` em camelCase. */
export type StoreHeroSlide = {
  id: string
  title: string
  subtitle: string | null
  imageDesktopUrl: string | null
  imageMobileUrl: string | null
  productId: string | null
  primaryCtaText: string | null
  primaryCtaLink: string | null
  secondaryCtaText: string | null
  secondaryCtaLink: string | null
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/**
 * Linha do painel com o card do produto relacionado (inclusive pausado, para
 * o painel avisar), no mesmo formato da vitrine, então a pré-visualização
 * mostra o preço de verdade.
 */
export type AdminStoreHeroSlide = StoreHeroSlide & { product: StoreProductCard | null }

export type StoreHeroCta = { text: string; href: string }

/** O que a vitrine recebe: botões já resolvidos e o card do produto, pronto para preço. */
export type StoreHeroView = {
  id: string
  title: string
  subtitle: string | null
  imageDesktopUrl: string | null
  imageMobileUrl: string | null
  primaryCta: StoreHeroCta | null
  secondaryCta: StoreHeroCta | null
  endsAt: string | null
  product: StoreProductCard | null
}

export type StoreHeroStatus = "live" | "scheduled" | "ended" | "inactive"

export const HERO_STATUS_LABEL: Record<StoreHeroStatus, string> = {
  live: "No ar",
  scheduled: "Agendado",
  ended: "Encerrado",
  inactive: "Desativado",
}

/** Situação do slide agora: desativado ganha de tudo, depois o período decide. */
export function heroSlideStatus(
  slide: Pick<StoreHeroSlide, "isActive" | "startsAt" | "endsAt">,
  nowMs: number
): StoreHeroStatus {
  if (!slide.isActive) return "inactive"
  if (slide.startsAt && new Date(slide.startsAt).getTime() > nowMs) return "scheduled"
  if (slide.endsAt && new Date(slide.endsAt).getTime() <= nowMs) return "ended"
  return "live"
}

export function productHref(slug: string): string {
  return `/loja/${slug}`
}

type HeroViewSource = Pick<
  StoreHeroSlide,
  | "id"
  | "title"
  | "subtitle"
  | "imageDesktopUrl"
  | "imageMobileUrl"
  | "primaryCtaText"
  | "primaryCtaLink"
  | "secondaryCtaText"
  | "secondaryCtaLink"
  | "endsAt"
>

/**
 * O que a vitrine desenha a partir do slide salvo + card do produto. Usado
 * pela vitrine (servidor) e pela pré-visualização do painel, para as duas
 * resolverem os botões do mesmo jeito. `null` = nada para desenhar (sem arte
 * e sem produto no ar).
 */
export function buildHeroView(slide: HeroViewSource, product: StoreProductCard | null): StoreHeroView | null {
  if (!slide.imageDesktopUrl && !product) return null

  const primaryHref = slide.primaryCtaLink ?? (product ? productHref(product.slug) : null)
  // Sem texto mas com produto, o botão principal é "Ver produto": o Hero de
  // campanha sempre leva a algum lugar.
  const primaryText = slide.primaryCtaText ?? (product ? "Ver produto" : null)

  return {
    id: slide.id,
    title: slide.title,
    subtitle: slide.subtitle,
    imageDesktopUrl: slide.imageDesktopUrl,
    imageMobileUrl: slide.imageMobileUrl,
    primaryCta: primaryText && primaryHref ? { text: primaryText, href: primaryHref } : null,
    secondaryCta:
      slide.secondaryCtaText && slide.secondaryCtaLink
        ? { text: slide.secondaryCtaText, href: slide.secondaryCtaLink }
        : null,
    endsAt: slide.endsAt,
    product,
  }
}

/** Destino de "Ver ofertas": a vitrine já filtrada por produto em promoção. */
export const STORE_OFFERS_HREF = "/loja?ofertas=1#produtos"

/**
 * Atalhos de botão no painel. `link: "product"` = usar a página do produto
 * relacionado (o campo de link fica vazio e a vitrine resolve).
 */
export const HERO_CTA_PRESETS: { text: string; link: string | "product" | null }[] = [
  { text: "Ver ofertas", link: STORE_OFFERS_HREF },
  { text: "Ver produto", link: "product" },
  { text: "Entrega Grátis", link: null },
  { text: "Garantir o meu", link: "product" },
  { text: "Ver pré-venda", link: "product" },
]
