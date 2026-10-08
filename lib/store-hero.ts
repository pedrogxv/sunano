import { isValidBannerLink } from "@/lib/banner-link"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

/**
 * Hero da Loja (módulo puro: tela pública, painel e rota usam o mesmo).
 *
 * Um slide é uma campanha: etiqueta (campanha, lançamento, produto, oferta),
 * arte desktop e mobile, título, subtítulo curto, produto em destaque, até
 * dois botões e um período. Vários slides no ar viram um carrossel; nenhum no
 * ar devolve /loja à arte estática de sempre.
 *
 * Colados no Hero ficam os selos de curadoria (`StoreHeroSettings`), que
 * valem para todos os slides: dizem por que comprar aqui, não o que comprar.
 */

export const HERO_TITLE_MAX = 120
/** Mesmo teto do CHECK em store_hero_slides (20261211000000): título + uma frase. */
export const HERO_SUBTITLE_MAX = 140
export const HERO_CTA_TEXT_MAX = 40
export const HERO_HIGHLIGHT_LABEL_MAX = 28

/** O que o slide está vendendo. Decide cor e ícone da etiqueta acima do título. */
export const STORE_HERO_HIGHLIGHTS = ["campaign", "launch", "product", "offer"] as const

export type StoreHeroHighlightKind = (typeof STORE_HERO_HIGHLIGHTS)[number]

export const HERO_HIGHLIGHT_LABEL: Record<StoreHeroHighlightKind, string> = {
  campaign: "Campanha",
  launch: "Lançamento",
  product: "Destaque",
  offer: "Oferta",
}

export function isHeroHighlightKind(value: unknown): value is StoreHeroHighlightKind {
  return typeof value === "string" && (STORE_HERO_HIGHLIGHTS as readonly string[]).includes(value)
}

export type StoreHeroHighlight = { kind: StoreHeroHighlightKind; label: string }

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
  highlight: StoreHeroHighlightKind | null
  /** Texto próprio da etiqueta. Nulo = rótulo do tipo. */
  highlightLabel: string | null
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

/**
 * O produto em destaque visto pelo resto do Sunano: o periférico vinculado no
 * Database e a posição dele no ranking da categoria (a mesma de
 * `/perifericos/[slug]` e da página do produto). `rank` nulo = periférico sem
 * nota ainda.
 */
export type StoreHeroProductAnalysis = {
  peripheralName: string
  href: string
  rank: { position: number; total: number } | null
}

/** O que a vitrine recebe: botões já resolvidos e o card do produto, pronto para preço. */
export type StoreHeroView = {
  id: string
  title: string
  subtitle: string | null
  imageDesktopUrl: string | null
  imageMobileUrl: string | null
  primaryCta: StoreHeroCta | null
  secondaryCta: StoreHeroCta | null
  highlight: StoreHeroHighlight | null
  endsAt: string | null
  product: StoreProductCard | null
  analysis: StoreHeroProductAnalysis | null
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
  | "highlight"
  | "highlightLabel"
  | "endsAt"
>

/**
 * O que a vitrine desenha a partir do slide salvo + card do produto. Usado
 * pela vitrine (servidor) e pela pré-visualização do painel, para as duas
 * resolverem os botões do mesmo jeito. `null` = nada para desenhar (sem arte
 * e sem produto no ar).
 */
export function buildHeroView(
  slide: HeroViewSource,
  product: StoreProductCard | null,
  analysis: StoreHeroProductAnalysis | null = null
): StoreHeroView | null {
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
    highlight: slide.highlight
      ? { kind: slide.highlight, label: slide.highlightLabel?.trim() || HERO_HIGHLIGHT_LABEL[slide.highlight] }
      : null,
    endsAt: slide.endsAt,
    product,
    analysis: product ? analysis : null,
  }
}

/** Destino de "Ver ofertas": a vitrine já filtrada por produto em promoção. */
export const STORE_OFFERS_HREF = "/loja?ofertas=1#produtos"

/**
 * Destino de "Conheça nossa curadoria": a tierlist oficial, que é onde o
 * Sunano diz o que recomenda e por quê. Não existe página de curadoria à
 * parte, e uma criada só para a Loja repetiria a tierlist com outro texto.
 */
export const STORE_CURATION_HREF = "/tierlist"

/**
 * Atalhos de botão no painel. `link: "product"` = usar a página do produto
 * relacionado (o campo de link fica vazio e a vitrine resolve).
 */
export const HERO_CTA_PRESETS: { text: string; link: string | "product" | null }[] = [
  { text: "Ver ofertas", link: STORE_OFFERS_HREF },
  { text: "Conheça nossa curadoria", link: STORE_CURATION_HREF },
  { text: "Ver produto", link: "product" },
  { text: "Entrega Grátis", link: null },
  { text: "Garantir o meu", link: "product" },
  { text: "Ver pré-venda", link: "product" },
]

// ────────────────────────────────────────────
// Selos de curadoria (store_hero_settings)
// ────────────────────────────────────────────

export const HERO_SEAL_ICONS = ["tested", "reviews", "curation", "database", "ranking", "shield", "community"] as const

export type HeroSealIcon = (typeof HERO_SEAL_ICONS)[number]

export const HERO_SEAL_ICON_LABEL: Record<HeroSealIcon, string> = {
  tested: "Testado",
  reviews: "Review",
  curation: "Curadoria",
  database: "Database",
  ranking: "Ranking",
  shield: "Garantia",
  community: "Comunidade",
}

/** O banco aceita até 4 (CHECK em store_hero_settings); mais que isso não cabe numa linha do celular. */
export const MAX_HERO_SEALS = 4
export const HERO_SEAL_TITLE_MAX = 28
export const HERO_SEAL_DESCRIPTION_MAX = 70

export type StoreHeroSeal = {
  icon: HeroSealIcon
  title: string
  /** Frase de apoio, só no desktop. */
  description: string | null
  link: string | null
}

export type StoreHeroSettings = {
  sealsEnabled: boolean
  seals: StoreHeroSeal[]
  showRating: boolean
}

/** Os quatro selos que a migration grava; também o fallback se a linha não puder ser lida. */
export const DEFAULT_HERO_SEALS: StoreHeroSeal[] = [
  {
    icon: "tested",
    title: "Produtos Aprovados",
    description: "Periféricos que realmente melhoram seu nível.",
    link: null,
  },
  {
    icon: "reviews",
    title: "Reviews independentes",
    description: "Opinião honesta e análises completas em vídeos no canal.",
    link: "/videos",
  },
  {
    icon: "curation",
    title: "Curadoria Sunano",
    description: "Selecionados e aprovados pelo Sunano.",
    link: STORE_CURATION_HREF,
  },
  {
    icon: "database",
    title: "Database Completa e Original",
    description: "Sem copiar ou imitar outras pessoas.",
    link: "/perifericos",
  },
]

export const DEFAULT_HERO_SETTINGS: StoreHeroSettings = {
  sealsEnabled: true,
  seals: DEFAULT_HERO_SEALS,
  showRating: true,
}

export function isHeroSealIcon(value: unknown): value is HeroSealIcon {
  return typeof value === "string" && (HERO_SEAL_ICONS as readonly string[]).includes(value)
}

/**
 * Lê o `seals` (jsonb) com desconfiança: item com ícone desconhecido, título
 * vazio ou link inválido some em vez de quebrar o topo da Loja.
 */
export function parseHeroSeals(raw: unknown): StoreHeroSeal[] {
  if (!Array.isArray(raw)) return []
  const seals: StoreHeroSeal[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const { icon, title, description, link } = item as Record<string, unknown>
    if (!isHeroSealIcon(icon) || typeof title !== "string" || !title.trim()) continue
    const safeLink = typeof link === "string" && link.trim() && isValidBannerLink(link.trim()) ? link.trim() : null
    const safeDescription =
      typeof description === "string" && description.trim()
        ? description.trim().slice(0, HERO_SEAL_DESCRIPTION_MAX)
        : null
    seals.push({ icon, title: title.trim().slice(0, HERO_SEAL_TITLE_MAX), description: safeDescription, link: safeLink })
    if (seals.length === MAX_HERO_SEALS) break
  }
  return seals
}

/**
 * O que a vitrine desenha embaixo do Hero: selos já filtrados e a nota dos
 * compradores (nula sem avaliação publicada ou com a nota desligada).
 */
export type StoreHeroTrust = {
  seals: StoreHeroSeal[]
  rating: { average: number; count: number } | null
}
