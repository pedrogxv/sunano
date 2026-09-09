"use client"

import type { ComponentType, ReactNode } from "react"
import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Activity, AudioLines, Gauge, Hand, ListChecks, MessageSquare, MessageSquareText, Package, Ruler, ShieldAlert, ShoppingBag, Star, ThumbsDown, ThumbsUp, Trophy, Volume2, Youtube, Zap } from "lucide-react"
import { FaAmazon } from "react-icons/fa"
import { SiShopee } from "react-icons/si"

import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/use-t"
import { useLocale } from "@/components/providers/locale-context"
import type { LocaleCode } from "@/lib/i18n"
import { mapTier, NEW_TIERS, tierLabel } from "@/lib/tier-utils"
import { CARD_TAG_STYLES, RATING_LEVEL_COLORS, TIER_THEMES } from "@/lib/tierlist-theme"
import { GripArchitectureImage } from "@/components/ui/grip-architecture-image"
import { FormattedText } from "@/components/ui/formatted-text"
import { PeripheralGallery } from "@/components/peripherals/PeripheralGallery"
import { PeripheralLikeToggle } from "@/components/peripherals/PeripheralLikeToggle"
import { PeripheralReviewsList } from "@/components/peripherals/PeripheralReviewsList"
import { PeripheralVoteBox } from "@/components/peripherals/PeripheralVoteBox"
import { RankingCrownBadge } from "@/components/peripherals/RankingCrownBadge"
import { formatBRL, formatCurrencyBRL } from "@/lib/format"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { SWITCH_PRICE_TIER_LABEL } from "@/lib/switch-price-tier"
import { CATEGORY_PLURAL_LABELS, getTagLabel, type Category, type Tag } from "@/lib/tag-options"
import { AuthorAvatarLink, AuthorNameLink } from "@/components/profile/AuthorLink"
import { parseExpertAuthor } from "@/lib/peripheral-expert"
import {
  formatPsuBoolean,
  hasPsuReadings,
  PSU_CERT_FALLBACK_STYLE,
  PSU_CERT_LEVEL_STYLE,
  type PsuSpecs,
} from "@/lib/psu-specs"

export interface PeripheralDetailViewData {
  id: string
  name: string
  brand: string
  category: string
  tier: string | null
  price: number
  tags?: string[] | null
  image_url: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  specs: Record<string, any> | null
  /** Colunas migradas de `specs` (ver peripherals-repository.ts) — têm
   * prioridade sobre o valor equivalente dentro de `specs` durante a
   * transição (dual-write). */
  weightG?: number | null
  connectivity?: string | null
  mouseShape?: string | null
  keyboardLayout?: string | null
  surface?: string | null
  profile?: string | null
  panelType?: string | null
  refreshRate?: number | null
}

export interface PeripheralDetailViewLinkedProduct {
  slug: string
  name: string
  price_cents: number
  price_cents_min?: number | null
  price_cents_max?: number | null
  /** Preço cheio (sem promo), para riscar ao lado do valor promocional. */
  price_cents_original?: number | null
  images?: string[] | null
  stock?: number | null
  is_sold_out?: boolean | null
  /** Distingue os anúncios do mesmo periférico ("pronta entrega", pré-venda). */
  sale_type?: "pre_order" | "ready_stock" | "normal" | null
}

export interface PeripheralDetailViewRelatedPost {
  id: string
  slug: string
  title: string
  cover_thumbnail_url?: string | null
  cover_image_url?: string | null
}

export interface PeripheralDetailViewLinkedSwitch {
  id: string
  name: string
}

/** Uma linha de classificação: o mesmo produto pode existir em mais de uma
 *  categoria da tierlist (cadastrado como mais de uma linha na tabela), cada
 *  uma com seu próprio tier. */
export interface PeripheralDetailViewClassification {
  id: string
  name: string
  category: string
  tier: string | null
}

interface PeripheralDetailViewProps {
  data: PeripheralDetailViewData
  rankBadge?: { position: number; total: number } | null
  relatedPosts?: PeripheralDetailViewRelatedPost[]
  linkedStore?: PeripheralDetailViewLinkedProduct | null
  /** Todos os anúncios da Loja para este periférico (venda normal primeiro).
   *  `linkedStore` é o principal — quando omitido, cai para o primeiro daqui. */
  linkedStores?: PeripheralDetailViewLinkedProduct[]
  linkedSwitch?: PeripheralDetailViewLinkedSwitch | null
  /** Todas as classificações deste produto (por nome+marca), incluindo a
   *  categoria atual. Se omitido, cai de volta para a classificação única de
   *  `data` (usado pelo preview do form de admin). */
  classifications?: PeripheralDetailViewClassification[]
  /** Destino do badge/link de ranking. Passe "/admin/ranking" ao renderizar
   *  dentro do painel admin, senão o clique sai para o site público. */
  rankingHref?: string
}

/** Modos de ranking por categoria — espelha `TIERLIST_MODE_OPTIONS` do form de
 *  admin (app/admin/tierlist/form.tsx) e `ratingModes` da Tierlist pública
 *  (components/tierlist/TierlistGrid.tsx). Cada periférico pode aparecer em
 *  mais de um modo dentro da mesma categoria (ex.: um mouse é ranqueado tanto
 *  em "Geral" quanto em "Magnético"), cada um com seu próprio tier. */
type RankingMode = "oled" | "overall" | "value" | "recommended" | "soundTyping" | "mechanical" | "magnetic" | "pcb" | "ips_va" | "competitive"

const DEFAULT_RANKING_MODES: { key: RankingMode; label: string; color: string }[] = [
  { key: "overall", label: "Geral", color: "bg-red-400" },
  { key: "value", label: "Custo Benefício", color: "bg-emerald-400" },
]

const RANKING_MODES_BY_CATEGORY: Record<string, { key: RankingMode; label: string; color: string }[]> = {
  keyboard: [
    { key: "magnetic", label: "Magnético", color: "bg-blue-400" },
    { key: "value", label: "Custo Benefício", color: "bg-emerald-400" },
    { key: "mechanical", label: "Mecânico", color: "bg-purple-400" },
  ],
  monitors: [
    { key: "oled", label: "OLED", color: "bg-amber-400" },
    { key: "ips_va", label: "IPS / VA", color: "bg-sky-400" },
    { key: "competitive", label: "Competitivo", color: "bg-purple-400" },
    { key: "value", label: "Custo Benefício", color: "bg-emerald-400" },
  ],
  mouse: [
    { key: "overall", label: "Geral", color: "bg-red-400" },
    { key: "magnetic", label: "Magnético", color: "bg-blue-400" },
    { key: "value", label: "Custo Benefício", color: "bg-emerald-400" },
  ],
  switches: [
    { key: "overall", label: "Geral", color: "bg-red-400" },
    { key: "value", label: "Custo Benefício", color: "bg-emerald-400" },
    { key: "soundTyping", label: "Som e Digitação", color: "bg-cyan-500" },
  ],
  mousepad: [
    { key: "overall", label: "Geral", color: "bg-red-400" },
    { key: "value", label: "Nacional", color: "bg-emerald-400" },
    { key: "recommended", label: "Custo Benefício", color: "bg-purple-400" },
  ],
  glasspad: [
    { key: "overall", label: "Geral", color: "bg-red-400" },
    { key: "value", label: "Nacional", color: "bg-emerald-400" },
    { key: "recommended", label: "Custo Benefício", color: "bg-purple-400" },
  ],
  iem: [
    { key: "overall", label: "Geral", color: "bg-red-400" },
    { key: "recommended", label: "Gamer", color: "bg-purple-400" },
    { key: "value", label: "Custo Benefício", color: "bg-emerald-400" },
  ],
  headset: [
    { key: "overall", label: "Geral", color: "bg-red-400" },
    { key: "value", label: "Custo Benefício", color: "bg-emerald-400" },
    { key: "recommended", label: "Nacionais", color: "bg-purple-400" },
  ],
  psu: [
    { key: "overall", label: "Geral", color: "bg-red-400" },
    { key: "recommended", label: "Nacional", color: "bg-purple-400" },
    { key: "value", label: "Custo Benefício", color: "bg-emerald-400" },
  ],
}

// Modos que não compartilham a coluna `tier` — cada um lê seu próprio valor em
// `specs.adminTier_<modo>`. "overall"/"magnetic" (teclado) ficam de fora: são o
// modo "padrão" da categoria e usam a coluna `tier` diretamente.
const RANKING_TIER_SPEC_KEY: Partial<Record<RankingMode, string>> = {
  value: "adminTier_value",
  recommended: "adminTier_recommended",
  oled: "adminTier_oled",
  soundTyping: "adminTier_soundTyping",
  mechanical: "adminTier_mechanical",
  magnetic: "adminTier_magnetic",
  pcb: "adminTier_pcb",
  ips_va: "adminTier_ips_va",
  competitive: "adminTier_competitive",
}

function getDefaultRankingMode(category: string): RankingMode {
  if (category === "keyboard") return "magnetic"
  if (category === "monitors") return "oled"
  return "overall"
}

function getRankingModeTier(
  category: string,
  tier: string | null,
  specs: Record<string, unknown>,
  mode: RankingMode,
): string | null {
  // Teclado usa "magnetic" como modo padrão (compartilha a coluna `tier`).
  const defaultMode = getDefaultRankingMode(category)
  if (mode === defaultMode) return tier
  const specKey = RANKING_TIER_SPEC_KEY[mode]
  if (!specKey) return tier
  const value = specs?.[specKey]
  return typeof value === "string" && (NEW_TIERS as readonly string[]).includes(value) ? value : null
}

/** Nome da categoria como o site fala dela — `formatLabel("psu")` daria "Psu". */
function categoryLabel(category: string) {
  if (category === "psu") return CATEGORY_PLURAL_LABELS.psu
  return formatLabel(category)
}

/** Etiqueta de um selo (80 Plus / Cybenetics / Teclab) na cor do nível. */
function CertBadge({ label, level }: { label: string; level?: string }) {
  return (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        (level && PSU_CERT_LEVEL_STYLE[level]) || PSU_CERT_FALLBACK_STYLE,
      )}
    >
      {level ? `${label} ${level}` : label}
    </span>
  )
}

function formatLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatCurrency(value: number) {
  try {
    return formatCurrencyBRL(value)
  } catch (error) {
    return `R$${value}`
  }
}

function formatTagLabel(tag: string, locale: LocaleCode, category?: string) {
  // `light`/`heavy` são registradas só para `mouse` em tag-options, mas teclado
  // também as exibe (item legado). Buscar na categoria primeiro e cair para o
  // pool global preserva o caso especial que existia aqui antes, agora sem
  // duplicar o rótulo — o pool global acha a tag e devolve no idioma certo.
  const scoped = getTagLabel(tag, locale, category as Category | undefined)
  return scoped ?? getTagLabel(tag, locale) ?? formatLabel(tag)
}

function splitLines(value?: string | null) {
  if (!value) return []
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

/** `fallbackLabel` vem do dicionário — esta função é de módulo e não usa `useT`. */
function parseLinkLines(value: string | null | undefined, fallbackLabel: string) {
  return splitLines(value).map((line) => {
    const [label, url] = line.split("|").map((part) => part.trim())
    return {
      label: url ? label || fallbackLabel : fallbackLabel,
      url: url || label,
    }
  })
}

function normalizeRating(value: unknown, max = 6) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(max, Math.round(parsed)))
}

function RatingRow({ label, rating }: { label: string; rating: number }) {
  const filled = Math.max(0, Math.min(6, Math.round(rating)))
  const levelColor = RATING_LEVEL_COLORS[filled]
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", levelColor.bg)}>
          {filled}/6
        </span>
      </div>
      <div className="flex h-3 items-center gap-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-3 flex-1 rounded transition-colors",
              index < filled ? levelColor.bar : "bg-muted/40",
            )}
          />
        ))}
      </div>
    </div>
  )
}

// Header padronizado dos cards de "informação estrutural" do periférico
// (Especificações, Performance, Shape, Pegada, Software, Review) — cada bloco
// ganha um ícone próprio numa cor de destaque, no mesmo espírito do glow por
// categoria usado nos cards de listagem de /perifericos.
type InfoAccent = "sky" | "purple" | "violet" | "amber" | "emerald" | "rose" | "indigo" | "cyan" | "teal" | "lime" | "fuchsia"

const INFO_ACCENT_STYLES: Record<InfoAccent, { icon: string; iconBg: string }> = {
  sky: { icon: "text-sky-400", iconBg: "bg-sky-400/10" },
  purple: { icon: "text-purple-400", iconBg: "bg-purple-400/10" },
  violet: { icon: "text-violet-400", iconBg: "bg-violet-400/10" },
  amber: { icon: "text-amber-400", iconBg: "bg-amber-400/10" },
  emerald: { icon: "text-emerald-400", iconBg: "bg-emerald-400/10" },
  rose: { icon: "text-rose-400", iconBg: "bg-rose-400/10" },
  indigo: { icon: "text-indigo-400", iconBg: "bg-indigo-400/10" },
  cyan: { icon: "text-cyan-400", iconBg: "bg-cyan-400/10" },
  teal: { icon: "text-teal-400", iconBg: "bg-teal-400/10" },
  lime: { icon: "text-lime-400", iconBg: "bg-lime-400/10" },
  fuchsia: { icon: "text-fuchsia-400", iconBg: "bg-fuchsia-400/10" },
}

function InfoCardTitle({
  icon: Icon,
  accent,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  accent: InfoAccent
  children: ReactNode
}) {
  const style = INFO_ACCENT_STYLES[accent]
  return (
    <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg", style.iconBg)}>
        <Icon className={cn("size-3.5", style.icon)} />
      </span>
      {children}
    </CardTitle>
  )
}

function getYoutubeEmbedId(url?: string | null) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, "")
    if (host === "youtu.be") {
      return parsed.pathname.slice(1) || null
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v")
      }
      const match = parsed.pathname.match(/^\/(embed|shorts)\/([^/?]+)/)
      if (match) return match[2]
    }
    return null
  } catch {
    return null
  }
}

function linkifyText(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}

const BUY_LINK_STYLES: Record<string, { container: string; icon: string }> = {
  aliexpress: {
    container: "border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20",
    icon: "text-red-400",
  },
  "mercado livre": {
    container: "border-yellow-400/30 bg-yellow-400/10 text-yellow-200 hover:bg-yellow-400/20",
    icon: "text-yellow-400",
  },
  mercadolivre: {
    container: "border-yellow-400/30 bg-yellow-400/10 text-yellow-200 hover:bg-yellow-400/20",
    icon: "text-yellow-400",
  },
  amazon: {
    container: "border-blue-500/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20",
    icon: "text-blue-400",
  },
  shopee: {
    container: "border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20",
    icon: "text-orange-400",
  },
}

const DEFAULT_BUY_LINK_STYLE = {
  container: "border-border bg-muted/30 text-foreground hover:bg-muted/40",
  icon: "text-muted-foreground",
}

function getBuyLinkStyle(label: string) {
  return BUY_LINK_STYLES[label.trim().toLowerCase()] ?? DEFAULT_BUY_LINK_STYLE
}

// AliExpress: o ícone da simple-icons é o wordmark completo, ilegível no tamanho
// de ícone (size-4) — usa o ícone genérico até termos um SVG que caiba nesse espaço.
function getBuyLinkIcon(label: string) {
  switch (label.trim().toLowerCase()) {
    case "mercado livre":
    case "mercadolivre":
      return "/images/mercado-livre-icon.png"
    case "amazon":
      return FaAmazon
    case "shopee":
      return SiShopee
    default:
      return ShoppingBag
  }
}

function formatSpecValue(value: unknown) {
  if (value === null || typeof value === "undefined" || value === "") return "-"
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return "-"
    return /^[a-z0-9-]+$/.test(trimmed) ? formatLabel(trimmed) : trimmed
  }
  return String(value)
}

/** Preço a exibir de um anúncio: faixa quando há variantes de preços diferentes. */
function linkedProductPriceLabel(product: PeripheralDetailViewLinkedProduct) {
  const { price_cents_min, price_cents_max } = product
  if (price_cents_min != null && price_cents_max != null && price_cents_max > price_cents_min) {
    return `A partir de ${formatBRL(price_cents_min)}`
  }
  return formatBRL(price_cents_min ?? product.price_cents)
}

function isLinkedProductSoldOut(product: PeripheralDetailViewLinkedProduct) {
  return product.stock === 0 || product.is_sold_out === true
}

/**
 * Etiqueta do tipo de venda. A venda normal não recebe etiqueta — é o padrão.
 *
 * Devolve a chave do dicionário, não o texto: a função é de módulo (fora de
 * componente) e não pode chamar `useT`. Quem renderiza resolve o idioma.
 */
function saleTypeLabelKey(
  saleType: PeripheralDetailViewLinkedProduct["sale_type"]
): "readyStock" | "preOrder" | null {
  if (saleType === "ready_stock") return "readyStock"
  if (saleType === "pre_order") return "preOrder"
  return null
}

/**
 * Uma linha do bloco "Onde comprar" da Loja. Usada tanto no card da página
 * quanto no dialog de "ver todas as opções", para as duas listas ficarem
 * visualmente idênticas.
 */
function LinkedStoreRow({ product }: { product: PeripheralDetailViewLinkedProduct }) {
  const t = useT()
  const soldOut = isLinkedProductSoldOut(product)
  const tagKey = saleTypeLabelKey(product.sale_type)
  const tag = tagKey ? t.storeBadges[tagKey] : null

  return (
    <Link
      href={`/loja/${product.slug}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs font-medium transition",
        soldOut
          ? "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05]"
          : "border-emerald-400/40 bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 text-emerald-100 shadow-[0_0_0_1px_rgba(52,211,153,0.08)] hover:from-emerald-500/25 hover:to-emerald-500/10"
      )}
    >
      <div
        className={cn(
          "relative size-9 shrink-0 overflow-hidden rounded-md border bg-black/20",
          soldOut ? "border-white/10" : "border-emerald-400/30"
        )}
      >
        {product.images?.[0] ? (
          <Image alt={product.name} fill sizes="36px" className="object-contain p-0.5" src={product.images[0]} />
        ) : (
          <div className={cn("flex h-full w-full items-center justify-center", soldOut ? "text-muted-foreground" : "text-emerald-300")}>
            <ShoppingBag className="size-4" />
          </div>
        )}
      </div>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              soldOut ? "bg-white/10 text-muted-foreground" : "bg-emerald-400 text-emerald-950"
            )}
          >
            Sunano
          </span>
          <span className={cn("text-[10px] font-semibold uppercase tracking-wider", soldOut ? "text-muted-foreground" : "text-emerald-300/80")}>
            {tag ?? t.storeBadges.officialStore}
          </span>
        </span>
        <span className={cn("mt-0.5 flex flex-wrap items-baseline gap-1.5 text-sm font-semibold", soldOut ? "text-muted-foreground" : "text-white")}>
          {linkedProductPriceLabel(product)}
          {!soldOut && product.price_cents_original != null && (
            <span className="text-xs font-normal text-muted-foreground line-through">
              {formatBRL(product.price_cents_original)}
            </span>
          )}
          {soldOut && <span className="font-normal text-rose-300">{t.peripheralDetail.soldOut}</span>}
        </span>
      </span>
      <span className={soldOut ? "text-muted-foreground" : "text-emerald-300"}>→</span>
    </Link>
  )
}

/**
 * Lista os anúncios da Loja no bloco "Onde comprar". Mostra até
 * `MAX_VISIBLE_STORE_LINKS` e resume o restante num "ver mais N" que abre o
 * dialog com a lista completa — um periférico pode ter venda normal, pronta
 * entrega e pré-venda ao mesmo tempo, e empilhar tudo empurraria os links das
 * outras lojas para fora da vista.
 */
const MAX_VISIBLE_STORE_LINKS = 3

function LinkedStoreList({
  products,
  onShowAll,
}: {
  products: PeripheralDetailViewLinkedProduct[]
  onShowAll: () => void
}) {
  const visible = products.slice(0, MAX_VISIBLE_STORE_LINKS)
  const hiddenCount = products.length - visible.length

  return (
    <>
      {visible.map((product) => (
        <LinkedStoreRow key={product.slug} product={product} />
      ))}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onShowAll}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/15"
        >
          <Package className="size-3.5" />
          {`Ver mais ${hiddenCount} ${hiddenCount === 1 ? "opção" : "opções"} na Loja`}
        </button>
      )}
    </>
  )
}

/**
 * Card de compra do topo da página. Mostra a foto do anúncio, o preço efetivo
 * (com o preço cheio riscado quando há promoção) e, quando o periférico tem
 * mais de um anúncio, um botão que abre a lista completa — antes isso era um
 * texto solto "+N outras opções", que informava mas não levava a lugar nenhum.
 */
function FeaturedStoreCard({
  product,
  otherCount,
  onShowAll,
}: {
  product: PeripheralDetailViewLinkedProduct
  otherCount: number
  onShowAll: () => void
}) {
  const t = useT()
  const hasRange =
    product.price_cents_min != null &&
    product.price_cents_max != null &&
    product.price_cents_max > product.price_cents_min
  const price = product.price_cents_min ?? product.price_cents
  const original = product.price_cents_original
  const discount = original != null && original > price ? Math.round(((original - price) / original) * 100) : null
  const tagKey = saleTypeLabelKey(product.sale_type)
  const tag = tagKey ? t.storeBadges[tagKey] : null

  return (
    <div className="w-full max-w-xs overflow-hidden rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent shadow-[0_0_0_1px_rgba(52,211,153,0.08)]">
      <Link href={`/loja/${product.slug}`} className="group flex items-center gap-3 p-3 transition hover:bg-emerald-500/10">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-emerald-400/30 bg-black/30">
          {product.images?.[0] ? (
            <Image alt={product.name} fill sizes="56px" className="object-contain p-1" src={product.images[0]} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-emerald-300">
              <ShoppingBag className="size-5" />
            </div>
          )}
          {discount != null && (
            <span className="absolute inset-x-0 bottom-0 bg-emerald-400 py-px text-center text-[9px] font-bold text-emerald-950">
              -{discount}%
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-950">
              Sunano
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/80">
              {tag ?? t.storeBadges.officialStore}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-baseline gap-1.5">
            {hasRange && <span className="text-[11px] text-emerald-300/80">a partir de</span>}
            <span className="text-lg font-bold leading-none text-white">{formatBRL(price)}</span>
            {original != null && (
              <span className="text-xs text-muted-foreground line-through">{formatBRL(original)}</span>
            )}
          </span>
          <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-300 transition group-hover:gap-1.5">
            <ShoppingBag className="size-3" />
            Comprar na Loja
            <span aria-hidden>→</span>
          </span>
        </div>
      </Link>

      {otherCount > 0 && (
        <button
          type="button"
          onClick={onShowAll}
          className="flex w-full items-center justify-center gap-1.5 border-t border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/15"
        >
          <Package className="size-3" />
          {`Ver ${otherCount === 1 ? "a outra opção" : `as outras ${otherCount} opções`}`}
        </button>
      )}
    </div>
  )
}

/** Lista completa dos anúncios da Loja — aberta pelo card do topo e pelo bloco lateral. */
function AllStoresDialog({
  open,
  onOpenChange,
  products,
  peripheralName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: PeripheralDetailViewLinkedProduct[]
  peripheralName: string
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.peripheralDetail.buyInStore}</DialogTitle>
          <DialogDescription>
            {`${products.length} ${products.length === 1 ? "opção disponível" : "opções disponíveis"} para ${peripheralName}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-auto">
          {products.map((product) => (
            <LinkedStoreRow key={product.slug} product={product} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Renderiza o "corpo" da página de periférico a partir de dados já resolvidos (sem
// buscar nada no banco). Usado tanto pela página pública (/perifericos/[slug], que
// resolve os dados no servidor) quanto pelo preview ao vivo do formulário de admin
// (que monta os mesmos dados a partir do estado do form conforme o usuário digita).
export function PeripheralDetailView({
  data,
  rankBadge = null,
  relatedPosts = [],
  linkedStore = null,
  linkedStores,
  linkedSwitch = null,
  classifications = [],
  rankingHref = "/ranking",
}: PeripheralDetailViewProps) {
  const t = useT()
  const { locale } = useLocale()
  // A página pública passa `linkedStores` (já ordenada: venda normal primeiro).
  // O preview do form de admin só passa `linkedStore` — daí o fallback.
  const storeProducts = linkedStores ?? (linkedStore ? [linkedStore] : [])
  // O botão de destaque só faz sentido apontando para algo comprável: se o
  // anúncio principal estiver esgotado, usa o primeiro disponível (a ordem já
  // prioriza a venda normal) em vez de sumir com o botão.
  const featuredStore = storeProducts.find((product) => !isLinkedProductSoldOut(product)) ?? null
  const otherStoreCount = storeProducts.length - 1
  // Um só estado para os dois pontos de entrada (card do topo e bloco lateral),
  // para as duas listas abrirem exatamente o mesmo dialog.
  const [showAllStores, setShowAllStores] = useState(false)

  const specs = (data.specs ?? {}) as Record<string, any>
  const details = (specs.details ?? {}) as Record<string, any>
  // Colunas migradas (weight_g, connectivity, ...) têm prioridade; `specs`
  // continua servindo de fallback para registros ainda não regravados desde
  // a migration — ver PeripheralDetailViewData acima.
  const weightDisplay = data.weightG != null ? `${data.weightG}g` : (details.weight ?? specs.weight)
  const connectivityValue = data.connectivity ?? specs.connectivity
  const keyboardLayoutValue = data.keyboardLayout ?? specs.keyboardLayout
  const surfaceValue = data.surface ?? specs.surface ?? details.surface
  const profileValue = data.profile ?? specs.profile ?? details.profile
  const panelTypeValue = data.panelType ?? specs.panelType
  const refreshRateValue = data.refreshRate ?? specs.refreshRate

  const gallery = Array.isArray(details.gallery) ? details.gallery : splitLines(details.gallery)
  const pros = Array.isArray(details.pros) ? details.pros : splitLines(details.pros)
  const cons = Array.isArray(details.cons) ? details.cons : splitLines(details.cons)
  const buyLinks = Array.isArray(details.buyLinks) ? details.buyLinks : parseLinkLines(details.buyLinks, t.storeBadges.buy)

  const ratings = {
    overall: normalizeRating(details?.ratings?.overall ?? details.ratingOverall),
    build: normalizeRating(details?.ratings?.build ?? details.ratingBuild),
    software: normalizeRating(details?.ratings?.software ?? details.ratingSoftware),
    battery: normalizeRating(details?.ratings?.battery ?? details.ratingBattery),
    performance: normalizeRating(details?.ratings?.performance ?? details.ratingPerformance),
    qc: normalizeRating(details?.ratings?.qc ?? details.ratingQc),
    value: normalizeRating(details?.ratings?.value ?? details.ratingValue),
  }

  const reviewUrl = details.reviewUrl
  const youtubeId = getYoutubeEmbedId(reviewUrl)
  const softwareInfo = details.softwareInfo
  const generalComments = details.summary

  const isSwitch = data.category === "switches"

  // IEM: notas, ficha técnica e curva de tuning próprias — ver o formulário de admin.
  const isIem = data.category === "iem"
  const tuningCurveImage = typeof details.tuningCurveImage === "string" ? details.tuningCurveImage.trim() : ""

  // Fonte: a ficha é um relatório de bancada (ver lib/psu-specs.ts). Cada cenário
  // de carga vira um card próprio, e um cenário que nunca foi medido não aparece.
  const isPsu = data.category === "psu"
  const psu = (details.psu ?? {}) as PsuSpecs
  const psuCertBadges = isPsu
    ? [
        psu.plus80 === "yes" ? { label: "80 Plus", level: psu.plus80Level } : null,
        psu.cybenetics === "yes" ? { label: "Cybenetics", level: psu.cybeneticsLevel } : null,
        psu.teclab === "yes" ? { label: "Teclab", level: undefined } : null,
      ].filter((badge): badge is { label: string; level: string | undefined } => badge !== null)
    : []
  const psuLoadCards = isPsu
    ? [
        { key: "load100", title: t.psu.load100, hint: t.psu.load100Hint, readings: psu.load100 },
        { key: "load110", title: t.psu.load110, hint: t.psu.load110Hint, readings: psu.load110 },
      ].filter((card) => hasPsuReadings(card.readings))
    : []
  const psuOverloadRows = isPsu && hasPsuReadings(psu.overload)
    ? [
        { label: t.psu.protectionWorked, value: formatPsuBoolean(psu.overload?.protectionWorked) },
        { label: t.psu.maxLoad, value: psu.overload?.maxLoad },
        { label: t.psu.rippleStable, value: formatPsuBoolean(psu.overload?.rippleStable) },
        { label: t.psu.ripple12v, value: psu.overload?.ripple12v },
        { label: t.psu.efficiency, value: psu.overload?.efficiency },
        { label: t.psu.maxTemp, value: psu.overload?.maxTemp },
      ]
    : []
  const psuComponentRows = isPsu
    ? [
        { label: t.psu.fanModel, value: psu.fanModel },
        { label: t.psu.circuitType, value: psu.circuitType },
        { label: t.psu.mainCapacitor, value: psu.mainCapacitor },
        { label: t.psu.secondaryCapacitor, value: psu.secondaryCapacitor },
      ].filter((row) => row.value)
    : []

  // O review em vídeo é opcional em toda categoria: sem link de vídeo e sem post de
  // blog vinculado, o card inteiro sai da página em vez de exibir um vazio.
  const showReviewCard = !!reviewUrl || relatedPosts.length > 0

  // Card de comentário assinado — sem especialista escolhido, mostra só o texto.
  const expertAuthor = parseExpertAuthor(details.expertAuthor)
  const soundUrl = typeof details.soundUrl === "string" ? details.soundUrl.trim() : ""
  const soundYoutubeId = getYoutubeEmbedId(soundUrl)

  // Switch vinculado: se o admin apontou este teclado/mouse a um Switch cadastrado,
  // a linha "Switch" vira um link para a página daquele switch.
  const switchHref = linkedSwitch ? `/perifericos/${buildPeripheralSlug(linkedSwitch.name, linkedSwitch.id)}` : undefined
  const switchLabel = linkedSwitch?.name

  const formatConnectivity = (v?: string) =>
    v === "wired" ? t.peripheralDetail.value.wired : v === "wireless" ? t.peripheralDetail.value.wireless : v

  const formatKeyboardType = (v?: string) =>
    v === "mechanical" ? t.peripheralDetail.value.mechanical : v === "optical" ? t.peripheralDetail.value.optical : v === "magnetic" ? t.peripheralDetail.value.magnetic : v

  // Campos guardados como "yes"/"no" (Trimode, Microfone...).
  const formatYesNo = (v?: string) =>
    v === "yes" ? t.peripheralDetail.value.yes : v === "no" ? t.peripheralDetail.value.no : v

  // Switches usam faixa de preço (priceTier) em vez de valor exato.
  const specsBase = data.category === "switches"
    ? [{ label: t.peripheralDetail.spec.averageValue, value: SWITCH_PRICE_TIER_LABEL[String(details.priceTier)] ?? "—", group: "specs" as const }]
    : [{ label: t.peripheralDetail.spec.averagePrice, value: formatCurrency(data.price), group: "specs" as const }]

  // Linha "Switch": vira link quando há um Switch cadastrado vinculado; senão, texto livre.
  const switchRow = (group: "specs" | "performance") =>
    switchLabel
      ? { label: t.peripheralDetail.spec.switch, value: switchLabel, href: switchHref, group }
      : { label: t.peripheralDetail.spec.switch, value: details.switchType ?? specs.switchType, group }

  const specsTable: { label: string; value: unknown; group: "specs" | "performance"; href?: string }[] = (() => {
    switch (data.category) {
      case "mouse":
        return [...specsBase,
          { label: t.peripheralDetail.spec.latency, value: details.latency ?? specs.latency, group: "specs" },
          switchRow("specs"),
          { label: t.peripheralDetail.spec.sensor, value: specs.driver ?? details.sensor, group: "specs" },
          { label: t.peripheralDetail.spec.pollingRate, value: details.pollingRate ?? specs.pollingRate, group: "specs" },
          { label: t.peripheralDetail.spec.coating, value: details.coating ?? specs.coating, group: "specs" },
          { label: t.peripheralDetail.spec.trimode, value: formatYesNo(specs.trimode), group: "specs" },
          { label: t.peripheralDetail.spec.battery, value: details.battery ?? specs.battery, group: "specs" },
          { label: t.peripheralDetail.spec.batteryLife, value: details.batteryLife ?? specs.batteryLife, group: "specs" },
        ]
      case "keyboard":
        return [...specsBase,
          { label: t.peripheralDetail.spec.layout, value: keyboardLayoutValue, group: "specs" },
          { label: t.peripheralDetail.spec.type, value: formatKeyboardType(specs.keyboardType), group: "specs" },
          { label: t.peripheralDetail.spec.connectivity, value: formatConnectivity(connectivityValue), group: "specs" },
          { label: t.peripheralDetail.spec.weight, value: weightDisplay, group: "specs" },
          switchRow("performance"),
          { label: t.peripheralDetail.spec.latency, value: details.latency ?? specs.latency, group: "performance" },
          { label: t.peripheralDetail.spec.deadzone, value: details.deadzone, group: "performance" },
          { label: t.peripheralDetail.spec.rtMin, value: details.rtMin, group: "performance" },
          { label: t.peripheralDetail.spec.features, value: details.features, group: "performance" },
        ]
      case "pcb":
        // PCB avulsa: mesmas specs do teclado, sem a linha de Switch — a PCB é vendida
        // sem switches, quem monta o teclado escolhe e instala depois.
        return [...specsBase,
          { label: t.peripheralDetail.spec.layout, value: keyboardLayoutValue, group: "specs" },
          { label: t.peripheralDetail.spec.type, value: formatKeyboardType(specs.keyboardType), group: "specs" },
          { label: t.peripheralDetail.spec.connectivity, value: formatConnectivity(connectivityValue), group: "specs" },
          { label: t.peripheralDetail.spec.weight, value: weightDisplay, group: "specs" },
          { label: t.peripheralDetail.spec.latency, value: details.latency ?? specs.latency, group: "performance" },
          { label: t.peripheralDetail.spec.deadzone, value: details.deadzone, group: "performance" },
          { label: t.peripheralDetail.spec.rtMin, value: details.rtMin, group: "performance" },
          { label: t.peripheralDetail.spec.features, value: details.features, group: "performance" },
        ]
      case "mousepad":
      case "glasspad":
        return [...specsBase,
          { label: t.peripheralDetail.spec.surface, value: surfaceValue, group: "specs" },
          { label: t.peripheralDetail.spec.type, value: specs.padType ?? details.padType, group: "specs" },
          { label: t.peripheralDetail.spec.size, value: specs.size ?? details.size, group: "specs" },
          { label: t.peripheralDetail.spec.profile, value: profileValue, group: "specs" },
        ]
      case "monitors":
        return [...specsBase,
          { label: t.peripheralDetail.spec.panel, value: panelTypeValue, group: "specs" },
          { label: t.peripheralDetail.spec.refreshRate, value: refreshRateValue ? `${refreshRateValue}Hz` : undefined, group: "performance" },
        ]
      case "headset":
        return [...specsBase,
          { label: t.peripheralDetail.spec.connectivity, value: formatConnectivity(connectivityValue), group: "specs" },
          { label: t.peripheralDetail.spec.compatibility, value: details.compatibility, group: "specs" },
        ]
      case "iem":
        return [...specsBase,
          { label: t.peripheralDetail.spec.drivers, value: details.drivers, group: "specs" },
          { label: t.peripheralDetail.spec.impedance, value: details.impedance, group: "specs" },
          { label: t.peripheralDetail.spec.sensitivity, value: details.sensitivity, group: "specs" },
          { label: t.peripheralDetail.spec.connector, value: details.connector, group: "specs" },
          { label: t.peripheralDetail.spec.plug, value: details.plug, group: "specs" },
          { label: t.peripheralDetail.spec.material, value: details.material, group: "specs" },
          // Texto cru: em IEM o peso é escrito "8 g por lado", e a coluna weight_g
          // (numérica) perderia o "por lado" na exibição.
          { label: t.peripheralDetail.spec.weight, value: details.weight ?? specs.weight, group: "specs" },
          { label: t.peripheralDetail.spec.microphone, value: formatYesNo(details.microphone), group: "specs" },
        ]
      case "dac_amp":
        return [...specsBase,
          { label: t.peripheralDetail.spec.connectivity, value: formatConnectivity(connectivityValue), group: "specs" },
          { label: t.peripheralDetail.spec.trimode, value: formatYesNo(specs.trimode), group: "specs" },
        ]
      case "psu":
        // Garantia primeiro: numa fonte é o dado que mais pesa na decisão de compra.
        // Os selos ficam de fora da tabela — viram etiquetas coloridas logo abaixo.
        return [...specsBase,
          { label: t.peripheralDetail.spec.warranty, value: psu.warranty, group: "specs" },
          { label: t.peripheralDetail.spec.wattage, value: psu.wattage, group: "specs" },
        ]
      case "switches":
        return [...specsBase,
          { label: t.peripheralDetail.spec.type, value: formatKeyboardType(specs.keyboardType), group: "specs" },
          { label: t.peripheralDetail.spec.actuationForce, value: details.actuationForce, group: "specs" },
          { label: t.peripheralDetail.spec.totalTravel, value: details.totalTravel, group: "specs" },
          { label: t.peripheralDetail.spec.magneticFlux, value: details.magneticFlux, group: "specs" },
          { label: t.peripheralDetail.spec.housing, value: details.housing, group: "specs" },
          { label: t.peripheralDetail.spec.stemType, value: details.stemType, group: "specs" },
        ]
      default:
        // feet, chairs — só preço base
        return [...specsBase]
    }
  })()

  // A 1ª linha de specsTable é sempre o preço (specsBase) — vira uma tag
  // própria, maior, perto do nome/marca, em vez de disputar espaço com as
  // outras specs nos chips de destaque.
  const [priceHeadline] = specsTable
  const priceDisplay = formatSpecValue(priceHeadline.value)

  const isMouse = data.category === "mouse"
  // "Preço médio" já aparece em destaque perto do nome — não repetir nas Especificações.
  const specsRows = specsTable.filter((row) => row.group === "specs" && row !== priceHeadline)
  const performanceRows = specsTable.filter((row) => row.group === "performance")

  const showGrip = isMouse
  const gripInfo = [
    { label: t.peripheralDetail.gripSmall, value: details.gripSmall || "Claw/Palm" },
    { label: t.peripheralDetail.gripMedium, value: details.gripMedium || "Claw/Palm" },
    { label: t.peripheralDetail.gripLarge, value: details.gripLarge || "Claw/Finger" },
  ]

  const showShape = isMouse
  const shapeSize = specs.size ?? details.size
  const shapeDimensions = details.dimensions ?? specs.dimensions
  const shapeImageUrl = typeof (details.shapeImage ?? specs.shapeImage) === "string" ? (details.shapeImage ?? specs.shapeImage) : null

  // "Dimensões (CxLxA)" = comprimento x largura x altura, ex: "125 x 63.5 x 40 mm".
  // O container do Shape usa escala real (mm→px) do mouse visto de cima, então
  // mouses maiores renderizam fisicamente maiores que mouses menores, mantendo
  // consistência entre páginas de perifs diferentes. Só escala pra baixo se
  // estourar o card; nunca escala pra cima.
  const SHAPE_MM_TO_PX = 1.5
  const SHAPE_MAX_SIDE_PX = 200
  const { shapeBoxWidth, shapeBoxHeight } = (() => {
    const numbers = typeof shapeDimensions === "string" ? shapeDimensions.match(/\d+(\.\d+)?/g) : null
    const [length, width] = numbers && numbers.length >= 2 ? numbers.map(Number) : [120, 66]
    const rawHeight = (length || 120) * SHAPE_MM_TO_PX
    const rawWidth = (width || 66) * SHAPE_MM_TO_PX
    const scale = Math.min(1, SHAPE_MAX_SIDE_PX / Math.max(rawHeight, rawWidth))
    return { shapeBoxWidth: Math.round(rawWidth * scale), shapeBoxHeight: Math.round(rawHeight * scale) }
  })()

  const showTuningCurve = isIem && !!tuningCurveImage

  const specCardCount =
    1 + (performanceRows.length > 0 ? 1 : 0) + (showShape ? 1 : 0) + (isSwitch ? 1 : 0) + (showTuningCurve ? 1 : 0)

  const classificationsList = classifications.length > 0
    ? classifications
    : [{ id: data.id, name: data.name, category: data.category, tier: data.tier }]
  const hasMultipleClassifications = classificationsList.length > 1

  // Dentro da própria categoria (ex.: mouse), o mesmo produto pode ser ranqueado
  // em mais de um "modo" (Geral, Magnético, Custo-Benefício...), cada um com seu
  // tier — ver RANKING_MODES_BY_CATEGORY. A página de detalhe mostra só o modo
  // padrão da categoria (Geral, ou Magnético pra teclado/OLED pra monitor) —
  // os demais modos continuam disponíveis na Tierlist pública, evitando um
  // seletor de modo redundante aqui. Filtra pelos modos que o admin marcou como
  // aplicáveis (specs.tierlistCategories); sem esse campo (itens legados),
  // cai no modo padrão da categoria.
  const tierlistCategories = Array.isArray(specs.tierlistCategories) ? specs.tierlistCategories as string[] : null
  const defaultRankingMode = getDefaultRankingMode(data.category)
  const availableRankingModes = (RANKING_MODES_BY_CATEGORY[data.category] ?? DEFAULT_RANKING_MODES)
    .filter((mode) => !tierlistCategories || tierlistCategories.includes(mode.key))
  const effectiveRankingMode =
    availableRankingModes.find((mode) => mode.key === defaultRankingMode)?.key
    ?? availableRankingModes[0]?.key
    ?? defaultRankingMode
  const activeTier = getRankingModeTier(data.category, data.tier, specs, effectiveRankingMode)
  const tierStyle = activeTier ? TIER_THEMES[activeTier as keyof typeof TIER_THEMES] : null

  return (
    // @container/pdv: permite que este componente seja reaproveitado tanto na página
    // pública (largura cheia) quanto no preview estreito do formulário de admin — o
    // corte de 2 colunas reage à largura do próprio componente, não da viewport.
    // O container fica num wrapper separado do grid que ele mede: um elemento não
    // pode aplicar a si mesmo um estilo baseado no próprio container query (a regra
    // é ignorada pelo browser), então "@container/pdv" e "@2xl/pdv:" não podem estar
    // na mesma div.
    // Corte em @2xl (672px de container, não de viewport): a sidebar de 240px do app
    // + o padding da página comem largura, então mesmo tablets de 10"+ (ex.: Galaxy
    // Tab S10 FE em paisagem, container ~700-970px) não chegariam a 1024px. Com 672px
    // o tablet entra em 2 colunas e só celular/retrato fica em coluna única.
    <div className="@container/pdv">
    <div className="grid gap-4 @2xl/pdv:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-3">
              {hasMultipleClassifications ? (
                <div className="rounded-2xl border border-border bg-card p-3">
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Classificações
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {classificationsList.map((classification) => {
                      const isCurrent = classification.id === data.id
                      const style = classification.tier
                        ? TIER_THEMES[classification.tier as keyof typeof TIER_THEMES]
                        : null
                      const tile = (
                        <div
                          className={cn(
                            "rounded-xl px-2.5 py-2.5 text-center transition",
                            style
                              ? cn("bg-gradient-to-br", style.accent, style.textColor)
                              : "border border-border bg-muted/40",
                            isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                            !isCurrent && "hover:opacity-90",
                          )}
                        >
                          <p
                            className={cn(
                              "text-[9px] font-semibold uppercase tracking-wide",
                              style ? "opacity-70" : "text-muted-foreground",
                            )}
                          >
                            {categoryLabel(classification.category)}
                          </p>
                          <p className={cn("text-lg font-bold leading-tight", !style && "text-foreground")}>
                            {classification.tier ? tierLabel(mapTier(classification.tier), classification.category) : t.peripheralDetail.underReview}
                          </p>
                        </div>
                      )
                      return isCurrent ? (
                        <div key={classification.id}>{tile}</div>
                      ) : (
                        <Link
                          key={classification.id}
                          href={`/perifericos/${buildPeripheralSlug(classification.name, classification.id)}`}
                          aria-label={`Ver classificação em ${categoryLabel(classification.category)}`}
                        >
                          {tile}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ) : tierStyle ? (
                <div className={cn("rounded-2xl bg-gradient-to-br px-4 py-3 text-center", tierStyle.accent, tierStyle.textColor)}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest opacity-60 mb-1">{t.peripheralDetail.classification}</p>
                  <p className="text-3xl font-bold tracking-tight leading-none">
                    {activeTier ? tierLabel(mapTier(activeTier), data.category) : t.peripheralDetail.underReview}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{t.peripheralDetail.classification}</p>
                  <p className="text-sm font-semibold text-foreground">{data.tier ? tierLabel(mapTier(data.tier), data.category) : t.peripheralDetail.underReview}</p>
                </div>
              )}

              <PeripheralGallery images={[data.image_url, ...gallery]} alt={data.name} />

              <Card size="sm" className="border-border/60 bg-secondary/50">
                <CardHeader className="space-y-1">
                  <InfoCardTitle icon={Star} accent="indigo">{t.peripheralDetail.overallRatings}</InfoCardTitle>
                  <CardDescription className="text-sm">{t.peripheralDetail.ratingScale}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <RatingRow label={t.peripheralDetail.ratingGeneral} rating={ratings.overall} />
                  {isIem ? (
                    // IEM tem sua própria lista de notas, na ordem definida pro formulário
                    // de admin (ver RATING_FIELD_ORDER_BY_CATEGORY em app/admin/tierlist/form.tsx).
                    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                      <RatingRow label={t.peripheralDetail.ratingTuning} rating={ratings.performance} />
                      <RatingRow label={t.peripheralDetail.ratingCable} rating={ratings.software} />
                      <RatingRow label={t.peripheralDetail.ratingTips} rating={ratings.battery} />
                      <RatingRow label={t.peripheralDetail.ratingBuild} rating={ratings.build} />
                      <RatingRow label={t.peripheralDetail.ratingValue} rating={ratings.value} />
                      <RatingRow label={t.peripheralDetail.ratingQualityControl} rating={ratings.qc} />
                    </div>
                  ) : (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                    {data.category !== "pcb" && (
                      <RatingRow label={isPsu ? t.peripheralDetail.ratingComponents : data.category === "mousepad" ? t.peripheralDetail.ratingSurface : t.peripheralDetail.ratingBuild} rating={ratings.build} />
                    )}
                    <RatingRow label={isPsu ? t.peripheralDetail.ratingEfficiency : data.category === "mousepad" ? t.peripheralDetail.ratingBase : t.peripheralDetail.ratingSoftware} rating={ratings.software} />
                    {data.category !== "pcb" && (
                      <RatingRow label={isPsu ? t.peripheralDetail.ratingWarranty : data.category === "keyboard" ? t.peripheralDetail.ratingTyping : data.category === "mousepad" ? t.peripheralDetail.ratingStitching : t.peripheralDetail.ratingBattery} rating={ratings.battery} />
                    )}
                    <RatingRow label={isPsu ? t.peripheralDetail.ratingRipple : t.peripheralDetail.ratingPerformance} rating={ratings.performance} />
                    <RatingRow label={t.peripheralDetail.ratingQc} rating={ratings.qc} />
                    <RatingRow label={t.peripheralDetail.ratingValue} rating={ratings.value} />
                  </div>
                  )}
                </CardContent>
              </Card>

              {/* Fonte não tem software próprio nem review em vídeo — os dois cards
                  saem da página (e os campos correspondentes, do formulário de admin). */}
              {!isPsu && (
                <Card className="border-border/60 bg-secondary/50">
                  <CardHeader>
                    <InfoCardTitle icon={Package} accent="sky">{t.peripheralDetail.software}</InfoCardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground break-words whitespace-pre-wrap">
                    {softwareInfo ? linkifyText(softwareInfo) : t.peripheralDetail.softwareEmpty}
                  </CardContent>
                </Card>
              )}

              <PeripheralVoteBox peripheralId={data.id} />

              <Card size="sm" className="border-border/60 bg-secondary/50">
                <CardHeader>
                  <InfoCardTitle icon={MessageSquareText} accent="cyan">{t.peripheralDetail.communityReviews}</InfoCardTitle>
                </CardHeader>
                <CardContent>
                  <PeripheralReviewsList peripheralId={data.id} peripheralSlug={buildPeripheralSlug(data.name, data.id)} />
                </CardContent>
              </Card>

              {(buyLinks.length > 0 || storeProducts.length > 0) && (
                <Card size="sm" className="border-border/60 bg-secondary/50">
                  <CardHeader className="space-y-1">
                    <InfoCardTitle icon={ShoppingBag} accent="teal">{t.peripheralDetail.whereToBuy}</InfoCardTitle>
                    <CardDescription className="text-xs">{t.peripheralDetail.whereToBuyDesc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 lg:max-h-64 lg:overflow-auto">
                    {storeProducts.length > 0 && (
                      <LinkedStoreList products={storeProducts} onShowAll={() => setShowAllStores(true)} />
                    )}
                    {buyLinks.map((link: { label: string; url: string }) => {
                      const style = getBuyLinkStyle(link.label)
                      const Icon = getBuyLinkIcon(link.label)
                      return (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition",
                            style.container
                          )}
                        >
                          <span className="flex items-center gap-2">
                            {typeof Icon === "string" ? (
                              <Image src={Icon} alt="" width={16} height={16} className="size-4 shrink-0 object-contain" />
                            ) : (
                              <Icon className={cn("size-4 shrink-0", style.icon)} />
                            )}
                            {link.label}
                          </span>
                          <span>→</span>
                        </a>
                      )
                    })}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* @container/col: os grids desta coluna precisam medir a coluna, não a
                viewport — a sidebar de 240px e a coluna de 320px ao lado fazem com que
                a largura da tela não descreva o espaço que sobra aqui. */}
            <div className="@container/col space-y-3">
              <div>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {data.category && (
                      <Badge variant="secondary" className="bg-muted/50 text-xs text-muted-foreground">
                        {categoryLabel(data.category)}
                      </Badge>
                    )}
                    {data.tier && (
                      <Badge className="bg-primary/15 text-xs text-primary">
                        {tierLabel(mapTier(data.tier), data.category)}
                      </Badge>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      {rankBadge && (
                        <RankingCrownBadge position={rankBadge.position} href={rankingHref} />
                      )}
                      <PeripheralLikeToggle peripheralId={data.id} />
                    </div>
                    {featuredStore && (
                      <FeaturedStoreCard
                        product={featuredStore}
                        otherCount={otherStoreCount}
                        onShowAll={() => setShowAllStores(true)}
                      />
                    )}
                  </div>
                </div>

                <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                  {data.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">{data.brand}</p>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/80">{priceHeadline.label}</span>
                    <span className="text-sm font-bold text-emerald-300">{priceDisplay}</span>
                  </span>
                </div>

                {data.tags?.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {data.tags.map((tag) => {
                      const style = CARD_TAG_STYLES[tag as Tag]
                      if (!style) {
                        return (
                          <Badge key={tag} variant="outline" className="border-border text-xs text-muted-foreground">
                            {formatTagLabel(tag, locale, data.category)}
                          </Badge>
                        )
                      }
                      return (
                        <span
                          key={tag}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            style.bg,
                            style.text,
                            style.border,
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", style.dot)} />
                          {formatTagLabel(tag, locale, data.category)}
                        </span>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              {/* Layout tipo masonry: colunas CSS em vez de grid, pra cards de altura
                  diferente (ex.: Especificações alto ao lado de Shape mais curto) não
                  deixarem buraco vazio embaixo do card menor. Especificações...Review
                  ficam todos no mesmo container de colunas (não um por seção) pra um
                  card curto (ex.: Review sem vídeo) poder subir e preencher ao lado de
                  outro card curto (ex.: Shape), em vez de ficar preso "for de posição". */}
              <div className="@2xl/col:columns-2 @2xl/col:gap-3">
                <Card size="sm" className="mb-3 break-inside-avoid border-border/60 bg-secondary/50">
                  <CardHeader>
                    <InfoCardTitle icon={ListChecks} accent="sky">
                      {isSwitch ? t.peripheralDetail.specsTitleTechnical : t.peripheralDetail.specsTitle}
                    </InfoCardTitle>
                    {!isMouse && (
                      <CardDescription className="text-xs">{t.peripheralDetail.mainSpecs}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                    {specsRows.map((row) => (
                      <div key={row.label} className="flex items-start justify-between gap-3">
                        <span>{row.label}</span>
                        <span className="text-right font-semibold break-words text-foreground">
                          {row.href ? (
                            <Link href={row.href} className="text-primary underline-offset-2 hover:underline">{formatSpecValue(row.value)}</Link>
                          ) : (
                            formatSpecValue(row.value)
                          )}
                        </span>
                      </div>
                    ))}
                    {psuCertBadges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {psuCertBadges.map((badge) => (
                          <CertBadge key={badge.label} label={badge.label} level={badge.level} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {psuLoadCards.map((card) => (
                  <Card key={card.key} size="sm" className="mb-3 break-inside-avoid border-border/60 bg-secondary/50">
                    <CardHeader>
                      <InfoCardTitle icon={Activity} accent="purple">{card.title}</InfoCardTitle>
                      <CardDescription className="text-xs">{card.hint}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                      {[
                        { label: t.psu.ripple12v, value: card.readings?.ripple12v },
                        { label: t.psu.line5v, value: card.readings?.ripple5v },
                        { label: t.psu.line33v, value: card.readings?.ripple33v },
                        { label: t.psu.efficiency, value: card.readings?.efficiency },
                        { label: t.psu.maxTemp, value: card.readings?.maxTemp },
                      ].map((row) => (
                        <div key={row.label} className="flex items-start justify-between gap-3">
                          <span>{row.label}</span>
                          <span className="text-right font-semibold break-words text-foreground">{formatSpecValue(row.value)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}

                {psuOverloadRows.length > 0 && (
                  <Card size="sm" className="mb-3 break-inside-avoid border-border/60 bg-secondary/50">
                    <CardHeader>
                      <InfoCardTitle icon={ShieldAlert} accent="rose">{t.peripheralDetail.overloadTest}</InfoCardTitle>
                      <CardDescription className="text-xs">{t.peripheralDetail.overloadTestDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                      {psuOverloadRows.map((row) => (
                        <div key={row.label} className="flex items-start justify-between gap-3">
                          <span>{row.label}</span>
                          <span className="text-right font-semibold break-words text-foreground">{formatSpecValue(row.value)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {psuComponentRows.length > 0 && (
                  <Card size="sm" className="mb-3 break-inside-avoid border-border/60 bg-secondary/50">
                    <CardHeader>
                      <InfoCardTitle icon={Zap} accent="amber">{t.peripheralDetail.components}</InfoCardTitle>
                      <CardDescription className="text-xs">O que tem dentro da fonte.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                      {psuComponentRows.map((row) => (
                        <div key={row.label} className="flex items-start justify-between gap-3">
                          <span>{row.label}</span>
                          <span className="text-right font-semibold break-words text-foreground">{formatSpecValue(row.value)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {performanceRows.length > 0 && (
                  <Card size="sm" className="mb-3 break-inside-avoid border-border/60 bg-secondary/50">
                    <CardHeader>
                      <InfoCardTitle icon={Gauge} accent="purple">{t.peripheralDetail.performance}</InfoCardTitle>
                      <CardDescription className="text-xs">{t.peripheralDetail.performanceDesc}</CardDescription>
                      {rankBadge && (
                        <CardAction>
                          <Link
                            href={rankingHref}
                            className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-primary transition hover:bg-primary/20"
                          >
                            <Trophy className="size-4 shrink-0" />
                            {`#${rankBadge.position} de ${rankBadge.total} no Ranking`}
                          </Link>
                        </CardAction>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      {performanceRows.map((row) => (
                        <div key={row.label} className="flex items-start justify-between gap-3">
                          <span>{row.label}</span>
                          <span className="text-right font-semibold break-words text-foreground">
                            {row.href ? (
                              <Link href={row.href} className="text-primary underline-offset-2 hover:underline">{formatSpecValue(row.value)}</Link>
                            ) : (
                              formatSpecValue(row.value)
                            )}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {showShape && (
                  <Card size="sm" className="mb-3 break-inside-avoid border-border/60 bg-secondary/50">
                    <CardHeader>
                      <InfoCardTitle icon={Ruler} accent="violet">{t.peripheralDetail.shape}</InfoCardTitle>
                      <CardDescription className="text-xs">{t.peripheralDetail.shapeDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                      <div className="flex items-start justify-between gap-3">
                        <span>{t.peripheralDetail.size}</span>
                        <span className="text-right font-semibold text-foreground">{formatSpecValue(shapeSize)}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span>{t.peripheralDetail.dimensions}</span>
                        <span className="text-right font-semibold break-words text-foreground">{formatSpecValue(shapeDimensions)}</span>
                      </div>
                      <div
                        className="relative mx-auto mt-2 overflow-hidden rounded-xl border border-border bg-[#2a2a2a]"
                        style={{ width: shapeBoxWidth, height: shapeBoxHeight }}
                      >
                        {/* Eixos de referência: dão noção de proporção/simetria sobre o shape. */}
                        <div className="pointer-events-none absolute inset-0">
                          <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-white/25" />
                          <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-white/25" />
                        </div>
                        {shapeImageUrl ? (
                          <Image
                            src={shapeImageUrl}
                            alt={`Formato de ${data.name} visto de cima`}
                            fill
                            sizes={`${shapeBoxWidth}px`}
                            className="object-contain p-4"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
                            {t.peripheralDetail.shapePhotoEmpty}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {showTuningCurve && (
                  <Card size="sm" className="mb-3 break-inside-avoid border-border/60 bg-secondary/50">
                    <CardHeader>
                      <InfoCardTitle icon={AudioLines} accent="violet">{t.peripheralDetail.tuningCurve}</InfoCardTitle>
                      <CardDescription className="text-xs">{t.peripheralDetail.tuningCurveDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-black">
                        <Image
                          src={tuningCurveImage}
                          alt={`Curva de tuning de ${data.name}`}
                          fill
                          sizes="(max-width: 768px) 100vw, 360px"
                          className="object-contain p-2"
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSwitch && (
                  <Card size="sm" className="mb-3 break-inside-avoid border-border/60 bg-secondary/50">
                    <CardHeader>
                      <InfoCardTitle icon={Volume2} accent="amber">{t.peripheralDetail.switchSound}</InfoCardTitle>
                      <CardDescription className="text-xs">{t.peripheralDetail.switchSoundDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {soundYoutubeId ? (
                        <div className="aspect-video overflow-hidden rounded-xl border border-border bg-muted/40">
                          <iframe
                            src={`https://www.youtube-nocookie.com/embed/${soundYoutubeId}`}
                            title={t.peripheralDetail.switchSound}
                            className="h-full w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        </div>
                      ) : soundUrl ? (
                        <div className="aspect-video overflow-hidden rounded-xl border border-border bg-black">
                          <video src={soundUrl} controls className="h-full w-full" />
                        </div>
                      ) : (
                        <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                          {t.peripheralDetail.switchSoundEmpty}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {showGrip && (
                  <Card size="sm" className="mb-3 break-inside-avoid border-border/60 bg-secondary/50">
                    <CardHeader>
                      <InfoCardTitle icon={Hand} accent="emerald">{t.peripheralDetail.grip}</InfoCardTitle>
                      <CardDescription className="text-xs">{t.peripheralDetail.gripDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="divide-y divide-border text-sm text-muted-foreground">
                      {gripInfo.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between gap-4 px-3 py-2"
                        >
                          <span className="text-foreground/80">{row.label}</span>
                          <span className="font-semibold text-foreground">{formatSpecValue(row.value)}</span>
                        </div>
                      ))}
                      <div className="pt-3">
                        <GripArchitectureImage />
                      </div>
                    </CardContent>
                  </Card>
                )}

{showReviewCard && (
                <Card size="sm" className="mb-3 break-inside-avoid border-border/60 bg-secondary/50">
                <CardHeader>
                  <InfoCardTitle icon={Youtube} accent="rose">{t.peripheralDetail.youtubeReview}</InfoCardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {youtubeId ? (
                    <div className="space-y-2">
                      <div className="aspect-video overflow-hidden rounded-xl border border-border bg-muted/40">
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
                          title="Review no Youtube"
                          className="h-full w-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  ) : reviewUrl ? (
                    <Link
                      href={reviewUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm text-foreground transition hover:bg-muted/40"
                    >
                      <div className="flex size-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground">
                        Vídeo
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{t.peripheralDetail.videoReview}</p>
                        <p className="text-xs text-muted-foreground">{"Ver review"}</p>
                      </div>
                      <span className="text-primary">→</span>
                    </Link>
                  ) : null}
                  {relatedPosts && relatedPosts.length > 0 && (
                    <div className="space-y-3 lg:max-h-56 lg:overflow-auto">
                      {relatedPosts.map((post) => (
                        <Link
                          key={post.id}
                          href={`/blog/${post.slug}`}
                          className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm text-foreground transition hover:bg-muted/40"
                        >
                          <div className="relative size-12 overflow-hidden rounded-lg border border-border bg-muted/40">
                            {post.cover_thumbnail_url || post.cover_image_url ? (
                              <Image
                                alt={post.title}
                                fill
                                sizes="48px"
                                className="object-cover"
                                src={post.cover_thumbnail_url || post.cover_image_url || ""}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                Blog
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{post.title}</p>
                            <p className="text-xs text-muted-foreground">{t.peripheralDetail.viewReview}</p>
                          </div>
                          <span className="text-primary">→</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
                </Card>
                )}
              </div>

              <Card size="sm" className="border-border/60 bg-secondary/50">
                <CardContent className="text-base text-muted-foreground lg:max-h-80 lg:overflow-auto">
                    <div className="grid gap-6 @2xl/col:grid-cols-2">
                      <div>
                        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-green-500">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                            <ThumbsUp className="size-3.5 text-green-500" />
                          </span>
                          {t.peripheralDetail.prosTitle}
                        </p>
                        {pros.length > 0 ? (
                          <ul className="list-disc space-y-2 pl-5 text-base">
                            {pros.map((item: string) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-base">{t.peripheralDetail.noStrengths}</p>
                        )}
                      </div>
                      <div>
                        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-500">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                            <ThumbsDown className="size-3.5 text-red-500" />
                          </span>
                          {t.peripheralDetail.consTitle}
                        </p>
                        {cons.length > 0 ? (
                          <ul className="list-disc space-y-2 pl-5 text-base">
                            {cons.map((item: string) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-base">{t.peripheralDetail.noWeaknesses}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

              <Card size="sm" className="border-border/60 bg-secondary/50">
                <CardHeader>
                  <InfoCardTitle icon={MessageSquare} accent="fuchsia">{t.peripheralDetail.expertComments}</InfoCardTitle>
                  {expertAuthor && (
                    <CardDescription className="flex items-center gap-2">
                      <AuthorAvatarLink
                        author={{ userId: expertAuthor.userId, displayName: expertAuthor.displayName, displaySlug: expertAuthor.displaySlug }}
                        avatarUrl={expertAuthor.avatarUrl}
                        size={7}
                      />
                      <span className="text-xs">
                        por{" "}
                        <AuthorNameLink
                          author={{ userId: expertAuthor.userId, displayName: expertAuthor.displayName, displaySlug: expertAuthor.displaySlug }}
                          className="text-xs"
                        />
                      </span>
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="whitespace-pre-wrap break-words text-base text-muted-foreground lg:max-h-80 lg:overflow-auto">
                  {generalComments ? (
                    // O admin escreve o comentário com o markdown mínimo do
                    // projeto (`**negrito**`, `- item`, `##` título); antes o
                    // texto saía cru, com os asteriscos à mostra. `FormattedText`
                    // e não `CommentBody` porque aqui não há @menções a resolver.
                    <FormattedText text={generalComments} />
                  ) : (
                    t.peripheralDetail.noExpertComments
                  )}
                </CardContent>
              </Card>


            </div>
    </div>

    {storeProducts.length > 0 && (
      <AllStoresDialog
        open={showAllStores}
        onOpenChange={setShowAllStores}
        products={storeProducts}
        peripheralName={data.name}
      />
    )}
    </div>
  )
}
