"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { format, formatDistanceToNow, isToday, type Locale } from "date-fns"
import { safeHref } from "@/lib/safe-url"
import { enUS, ptBR } from "date-fns/locale"
import {
  AlertCircle,
  ArrowUpRight,
  Clock,
  ExternalLink,
  Info,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Ticket,
  X,
  Zap,
} from "lucide-react"

import BoxLoader from "@/components/ui/box-loader"
import { TelegramIcon } from "@/components/icons/social-icons"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CouponChip } from "@/components/offers/CouponChip"
import { useLocale } from "@/components/providers/locale-context"
import { getLowestPrice, parseOffer, type ParsedOffer } from "@/lib/offer-parser"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

// ── Constants ─────────────────────────────────────────────────────────────────

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g
const URL_TEST_RE = /^https?:\/\//

const ITEMS_PER_PAGE = 12
const NEW_OFFER_MS = 12 * 60 * 60 * 1000
/** A partir daqui a oferta ganha o aviso de "antiga" — preço/estoque podem ter mudado. */
const OLD_OFFER_MS = 48 * 60 * 60 * 1000
const TELEGRAM_URL = "https://t.me/canal_sunano"

type OfferFilter = "all" | "coupons" | "new"
type OfferSort = "recent" | "price"

// ── Types ─────────────────────────────────────────────────────────────────────

type TelegramOfferImage = {
  url: string
  width: number | null
  height: number | null
}

type TelegramOffer = {
  id: string
  messageId: number
  text: string
  date: string
  author: string | null
  authorAvatar: TelegramOfferImage | null
  chatTitle: string | null
  url: string | null
  /** Sempre presente: a API só devolve oferta com foto confirmada. */
  image: TelegramOfferImage | null
}

/** Oferta crua + o resultado do parser, calculado uma única vez por mensagem. */
type EnrichedOffer = TelegramOffer & {
  parsed: ParsedOffer
  isNew: boolean
  /** Mais de 48h desde a postagem. Só muda a aparência do card, não a ordem. */
  isOld: boolean
  lowestValue: number | null
}

type OffersApiResponse = {
  ok?: boolean
  error?: string
  warning?: string | null
  offers?: TelegramOffer[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return `${first}${last}`.toUpperCase()
}

function formatBrl(value: number, locale: string) {
  return value.toLocaleString(locale === "en-US" ? "en-US" : "pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TextWithLinks({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_SPLIT_RE)
  return (
    <p className={cn("whitespace-pre-wrap text-sm leading-relaxed text-foreground/75", className)}>
      {parts.map((part, i) =>
        URL_TEST_RE.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary underline underline-offset-2 transition-colors hover:text-primary/75"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </p>
  )
}

function StatRow({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="shrink-0 text-muted-foreground/70">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className={cn("shrink-0 text-sm font-bold tabular-nums text-foreground", accent)}>
        {value}
      </span>
    </div>
  )
}

/** Um card do grid. Toda a leitura da mensagem já vem pronta em `offer.parsed`. */
function OfferCard({
  offer,
  t,
  locale,
  dateLocale,
}: {
  offer: EnrichedOffer
  t: ReturnType<typeof useT>
  locale: string
  dateLocale: Locale
}) {
  const { parsed } = offer
  // Falhas de carregamento da foto. A 1ª tenta de novo com outra URL (o 502
  // do proxy fica 1 min no cache da CDN, a mesma URL devolveria o mesmo erro).
  const [imageErrors, setImageErrors] = useState(0)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const relTime = formatDistanceToNow(new Date(offer.date), { locale: dateLocale, addSuffix: true })
  const fullDate = format(new Date(offer.date), t.offers.dateFormat, { locale: dateLocale })
  const lowest = getLowestPrice(parsed.prices)
  // Desconto de cupom e preço riscado saem da lista de preços: o primeiro não
  // é o que se paga, o segundo vai colado no destaque.
  const original = parsed.prices.find((price) => price.kind === "original") ?? null
  const discounts = parsed.prices.filter((price) => price.kind === "discount")
  const secondary = parsed.prices.filter(
    (price) => price !== lowest && price.kind !== "original" && price.kind !== "discount"
  )

  // Oferta não aparece sem foto. A API já só manda as que têm; isto cobre a
  // foto que não carregou nem na segunda tentativa (mensagem apagada do canal
  // depois da última leitura, Telegram fora do ar).
  if (!offer.image || imageErrors >= 2) return null
  const imageSrc = imageErrors === 0 ? offer.image.url : `${offer.image.url}?retry=1`

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500/40 hover:bg-card/70 hover:shadow-xl hover:shadow-sky-950/30">
      {/* Imagem */}
      <div className="relative aspect-[16/10] overflow-hidden border-b border-border/30 bg-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={parsed.title ?? t.offers.offerImage}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          loading="lazy"
          onError={() => setImageErrors((count) => count + 1)}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
        {offer.isNew && (
          <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-950/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-300 backdrop-blur">
            <Zap className="size-2.5" fill="currentColor" />
            {t.offers.new}
          </span>
        )}
        {offer.isOld && (
          <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full border border-orange-400/40 bg-orange-950/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-orange-300 backdrop-blur">
            <Clock className="size-2.5" />
            {t.offers.oldOffer}
          </span>
        )}
        {parsed.coupons.length > 0 && (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-950/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 backdrop-blur">
            <Ticket className="size-2.5" />
            {t.offers.coupon}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        {/* Título */}
        {parsed.title && (
          <h2 className="line-clamp-3 text-sm font-semibold leading-snug text-foreground">
            {parsed.title}
          </h2>
        )}

        {/* Preços */}
        {lowest && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-2xl font-black tracking-tight text-emerald-400">
              {lowest.value !== null ? formatBrl(lowest.value, locale) : lowest.label}
            </span>
            {original && (
              <span className="text-xs font-medium text-muted-foreground line-through">
                {original.value !== null ? formatBrl(original.value, locale) : original.label}
              </span>
            )}
            {lowest.note && (
              <span className="text-xs font-medium text-emerald-500/70">{lowest.note}</span>
            )}
          </div>
        )}
        {secondary.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {secondary.map((price, i) => (
              <span key={i} className="text-xs text-muted-foreground">
                {price.value !== null ? formatBrl(price.value, locale) : price.label}
                {price.note ? ` ${price.note}` : ""}
              </span>
            ))}
          </div>
        )}

        {/* Abatimento do cupom. Fica fora do destaque de propósito: é o quanto
            sai do preço, não o preço. */}
        {discounts.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {discounts.map((price, i) => (
              <span key={i} className="flex items-start gap-1.5 text-xs text-amber-300/80">
                <Ticket className="mt-0.5 size-3 shrink-0" />
                <span>
                  <span className="font-semibold">
                    {price.value !== null ? formatBrl(price.value, locale) : price.label}
                  </span>
                  {price.note ? ` ${price.note}` : ""}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Corpo restante (só o que o parser não soube classificar) */}
        {parsed.body && <TextWithLinks text={parsed.body} className="line-clamp-4 text-xs" />}

        {/* Cupons */}
        {parsed.coupons.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {parsed.coupons.map((code) => (
              <CouponChip
                key={code}
                code={code}
                copyLabel={t.offers.copyCoupon}
                copiedLabel={t.offers.copied}
                copiedToast={t.offers.couponCopied}
                copyFailed={t.offers.copyFailed}
              />
            ))}
          </div>
        )}

        {/* Aviso de oferta antiga — logo acima do botão, onde ele importa. */}
        {offer.isOld && (
          <p className="flex items-start gap-1.5 rounded-lg border border-orange-500/20 bg-orange-500/[0.07] px-2.5 py-2 text-[11px] leading-snug text-orange-300/90">
            <Clock className="mt-px size-3 shrink-0" />
            <span>{t.offers.oldOfferHint}</span>
          </p>
        )}

        {/* Ações */}
        <div className="mt-auto flex items-center gap-2 pt-2">
          {parsed.link && (
            <a
              href={parsed.link}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 transition-all hover:border-sky-500/60 hover:bg-sky-500/20 hover:text-sky-200"
            >
              {t.offers.seeOffer}
              <ArrowUpRight className="size-3.5" />
            </a>
          )}
          {offer.url && (
            <a
              href={safeHref(offer.url)}
              target="_blank"
              rel="noopener noreferrer"
              title={t.offers.openInTelegram}
              aria-label={t.offers.openInTelegram}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:border-sky-500/30 hover:bg-sky-500/5 hover:text-sky-400",
                !parsed.link && "flex-1"
              )}
            >
              <TelegramIcon className="size-3.5 shrink-0" />
              {!parsed.link && t.offers.openInTelegram}
            </a>
          )}
        </div>

        {/* Rodapé: autor + tempo */}
        <div className="flex items-center gap-2 border-t border-border/30 pt-3">
          {offer.authorAvatar && !avatarFailed ? (
            <Image
              src={offer.authorAvatar.url}
              alt={offer.author ?? ""}
              width={20}
              height={20}
              sizes="20px"
              className="size-5 rounded-full border border-white/10 object-cover"
              unoptimized
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <div className="flex size-5 items-center justify-center rounded-full border border-white/10 bg-muted/40 text-[8px] font-bold uppercase text-muted-foreground">
              {offer.author ? getInitials(offer.author) : "TG"}
            </div>
          )}
          <span className="truncate text-[11px] text-muted-foreground" title={fullDate}>
            {relTime}
          </span>
        </div>
      </div>
    </article>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OffersPage() {
  const { locale } = useLocale()
  const t = useT()
  const dateLocale = locale === "en-US" ? enUS : ptBR

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [offers, setOffers] = useState<TelegramOffer[]>([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<OfferFilter>("all")
  const [sort, setSort] = useState<OfferSort>("recent")
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => { void loadOffers(false) }, [])

  async function loadOffers(isRefresh: boolean) {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true)
      setError(null)
      setWarning(null)
      const res = await fetch("/api/offers")
      const data = (await res.json().catch(() => null)) as OffersApiResponse | null
      if (!res.ok || !data?.offers) {
        throw new Error(data?.error ?? t.offers.failedToLoad)
      }
      setOffers(data.offers)
      setWarning(data.warning ?? null)
      setUpdatedAt(new Date())
      if (isRefresh) setPage(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.offers.failedToLoad)
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }

  // O parser roda uma vez por mensagem, não a cada tecla digitada na busca.
  const enriched = useMemo<EnrichedOffer[]>(() => {
    const now = Date.now()
    return offers.map((offer) => {
      const parsed = parseOffer(offer.text)
      return {
        ...offer,
        parsed,
        isNew: now - new Date(offer.date).getTime() < NEW_OFFER_MS,
        isOld: now - new Date(offer.date).getTime() > OLD_OFFER_MS,
        lowestValue: getLowestPrice(parsed.prices)?.value ?? null,
      }
    })
  }, [offers])

  const stats = useMemo(() => {
    const withCoupon = enriched.filter((o) => o.parsed.coupons.length > 0).length
    const newToday = enriched.filter((o) => isToday(new Date(o.date))).length
    return {
      total: enriched.length,
      withCoupon,
      newToday,
    }
  }, [enriched])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    let list = enriched

    if (filter === "coupons") list = list.filter((o) => o.parsed.coupons.length > 0)
    else if (filter === "new") list = list.filter((o) => o.isNew)

    if (term) {
      list = list.filter(
        (o) =>
          o.text.toLowerCase().includes(term) ||
          o.parsed.coupons.some((code) => code.toLowerCase().includes(term))
      )
    }

    if (sort === "price") {
      // Ofertas sem preço legível vão para o fim em vez de sumirem da lista.
      list = [...list].sort((a, b) => {
        if (a.lowestValue === null) return b.lowestValue === null ? 0 : 1
        if (b.lowestValue === null) return -1
        return a.lowestValue - b.lowestValue
      })
    }

    return list
  }, [enriched, filter, search, sort])

  // Filtrar reduz a lista; sem isso o visitante pode ficar preso numa página
  // que não existe mais e ver o grid vazio.
  useEffect(() => { setPage(1) }, [filter, search, sort])

  const totalPages = Math.max(1, Math.ceil(visible.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageItems = visible.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)
  const hasFilters = search.trim().length > 0 || filter !== "all"

  const filterOptions: Array<{ key: OfferFilter; label: string; icon: React.ReactNode }> = [
    { key: "all", label: t.offers.filterAll, icon: <Sparkles className="size-3.5" /> },
    { key: "coupons", label: t.offers.filterCoupons, icon: <Ticket className="size-3.5" /> },
    { key: "new", label: t.offers.filterNew, icon: <Zap className="size-3.5" /> },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-2 py-8 sm:px-4 md:px-6">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      {/* Faixa única: título + status na mesma linha das ações. O ícone, a
          pill em linha própria e os blurs decorativos saíram — só somavam
          altura acima da primeira oferta. */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-r from-sky-500/[0.07] to-card/60 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h1 className="text-xl font-black tracking-tight text-sky-400 md:text-2xl">
                {t.offers.title}
              </h1>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-sky-500" />
                </span>
                {t.offers.livePill}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.offers.subtitle}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => void loadOffers(true)}
              disabled={refreshing || loading}
              title={t.offers.refresh}
              className="flex size-8 items-center justify-center rounded-lg border border-border/50 bg-muted/20 text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </button>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-400 transition-all hover:border-sky-500/50 hover:bg-sky-500/[0.16] hover:text-sky-300"
            >
              <TelegramIcon className="size-3.5 shrink-0" />
              {t.offers.join}
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>

      {/* ── Alerts ───────────────────────────────────────────────────────── */}
      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertCircle className="size-3.5 text-red-300" />
          <AlertDescription className="text-xs leading-5 text-red-200">{error}</AlertDescription>
        </Alert>
      )}
      {warning && (
        <Alert className="border-amber-500/30 bg-amber-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertCircle className="size-3.5 text-amber-300" />
          <AlertDescription className="text-xs leading-5 text-amber-200">{warning}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <BoxLoader />
        </div>
      ) : (
        /* ── Sidebar + grid ─────────────────────────────────────────────── */
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">

          {/* Coluna lateral */}
          <aside className="lg:sticky lg:top-[calc(var(--sticky-header-h)+1.25rem)] lg:self-start">
            <div className="space-y-4">
              {/* Como funciona: primeiro item da coluna, por ser a instrução de
                  uso da página (cupom, carrinho, app do AliExpress). No fim da
                  barra lateral ela caía abaixo da dobra, depois de tudo. */}
              <div className="rounded-2xl border border-sky-500/15 bg-sky-500/[0.04] p-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-300/80">
                  <Info className="size-3.5" />
                  {t.offers.howItWorks}
                </p>
                <p className="text-xs leading-relaxed text-sky-200/60">{t.offers.howItWorksBody}</p>
                <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-2 py-1.5 text-[11px] leading-relaxed text-amber-200/80">
                  <Smartphone className="mt-px size-3 shrink-0" />
                  <span>{t.offers.aliexpressAppHint}</span>
                </p>
              </div>

              {/* Convite pro canal. Fica logo abaixo do "Como funciona", que
                  acabou de dizer que as ofertas nascem no Telegram: o convite
                  responde à pergunta que aquele texto levanta, antes de a
                  pessoa cair na busca e nos filtros. A pílula do cabeçalho
                  continua existindo — ela é o atalho de quem já está rolando
                  a grade, e ali no topo um card deste tamanho só empurraria a
                  primeira oferta pra baixo. */}
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="group block rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-500/[0.08] to-card/40 p-4 text-center transition-colors hover:border-sky-500/40"
              >
                <span className="mx-auto mb-2.5 flex size-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 transition-colors group-hover:bg-sky-500/25">
                  <TelegramIcon className="size-5" />
                </span>
                <span className="block text-[13px] font-black uppercase leading-tight tracking-wide text-foreground">
                  {t.offers.joinCardTitle}
                </span>
                <span className="mt-1.5 block text-[11px] leading-relaxed text-muted-foreground">
                  {t.offers.joinCardSubtitle}
                </span>
                <span className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-sky-900/40 transition-all group-hover:brightness-110">
                  <TelegramIcon className="size-3.5 shrink-0" />
                  {t.offers.joinCardAction}
                </span>
              </a>

              {/* Busca */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.offers.searchPlaceholder}
                  className="h-10 w-full rounded-xl border border-border/50 bg-muted/20 pl-9 pr-8 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-sky-500/40 focus:bg-muted/30"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label={t.offers.clearFilters}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {/* Filtros */}
              <div className="flex flex-wrap gap-1.5 lg:flex-col">
                {filterOptions.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setFilter(option.key)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all lg:w-full",
                      filter === option.key
                        ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                        : "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    {option.icon}
                    {option.label}
                  </button>
                ))}
              </div>

              {/* Ordenação */}
              <div className="rounded-2xl border border-border/50 bg-card/40 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t.offers.sortLabel}
                </p>
                <div className="flex gap-1.5">
                  {([
                    { key: "recent" as const, label: t.offers.sortRecent },
                    { key: "price" as const, label: t.offers.sortPrice },
                  ]).map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setSort(option.key)}
                      className={cn(
                        "flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all",
                        sort === option.key
                          ? "bg-sky-600 text-white shadow-sm shadow-sky-900/40"
                          : "bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resumo */}
              <div className="rounded-2xl border border-border/50 bg-card/40 p-4">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t.offers.statsTitle}
                </p>
                <div className="divide-y divide-border/30">
                  <StatRow
                    icon={<Sparkles className="size-3.5" />}
                    label={t.offers.statLive}
                    value={String(stats.total)}
                  />
                  <StatRow
                    icon={<Ticket className="size-3.5" />}
                    label={t.offers.statWithCoupon}
                    value={String(stats.withCoupon)}
                    accent="text-amber-400"
                  />
                  <StatRow
                    icon={<Zap className="size-3.5" />}
                    label={t.offers.statNewToday}
                    value={String(stats.newToday)}
                    accent="text-sky-400"
                  />
                </div>
                {updatedAt && (
                  <p className="mt-2 border-t border-border/30 pt-2 text-[10px] text-muted-foreground">
                    {t.offers.lastUpdated}{" "}
                    {formatDistanceToNow(updatedAt, { locale: dateLocale, addSuffix: true })}
                  </p>
                )}
              </div>

              {/* Aviso legal */}
              <div className="flex items-start gap-2.5 rounded-xl border border-border/40 bg-muted/10 px-3 py-3">
                <span className="mt-px shrink-0 text-sm">📌</span>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t.offers.disclaimer}
                </p>
              </div>
            </div>
          </aside>

          {/* Grid de ofertas */}
          <div className="min-w-0 space-y-4">
            {visible.length === 0 ? (
              <div className="rounded-2xl border border-sky-500/10 bg-card/40 py-20 text-center">
                <Zap className="mx-auto mb-3 size-10 text-sky-500/20" />
                <p className="text-sm font-medium text-foreground">
                  {hasFilters ? t.offers.noResults : t.offers.noMessages}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasFilters ? "" : t.offers.tryLater}
                </p>
                {hasFilters && (
                  <button
                    onClick={() => { setSearch(""); setFilter("all") }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-400 transition-all hover:bg-sky-500/20"
                  >
                    <X className="size-3.5" />
                    {t.offers.clearFilters}
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{visible.length}</span>{" "}
                  {t.offers.showingCount}
                </p>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {pageItems.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      t={t}
                      locale={locale}
                      dateLocale={dateLocale}
                    />
                  ))}
                </div>

                {/* ── Paginação ──────────────────────────────────────────── */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-1.5 pt-2">
                    <button
                      onClick={() => setPage(Math.max(1, safePage - 1))}
                      disabled={safePage === 1}
                      className="flex h-9 items-center gap-1 rounded-lg border border-border/50 bg-muted/20 px-3 text-sm text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                    >
                      ← <span className="hidden sm:inline">{t.offers.prev}</span>
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={cn(
                          "flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-all",
                          p === safePage
                            ? "bg-sky-600 text-white shadow-sm shadow-sky-900/40"
                            : "border border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        {p}
                      </button>
                    ))}

                    <button
                      onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                      disabled={safePage === totalPages}
                      className="flex h-9 items-center gap-1 rounded-lg border border-border/50 bg-muted/20 px-3 text-sm text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                    >
                      <span className="hidden sm:inline">{t.offers.next}</span> →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
