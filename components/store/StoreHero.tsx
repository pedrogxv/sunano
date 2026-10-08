"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { RouteLink } from "@/components/ui/route-link"
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Megaphone,
  MessageSquareQuote,
  PackageCheck,
  Pause,
  Percent,
  Play,
  Rocket,
  ShieldCheck,
  Star,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react"

import { isInternalBannerLink } from "@/lib/banner-link"
import { formatBRL } from "@/lib/format"
import { getCategoryIcon } from "@/lib/store-category-icons"
import {
  productHref,
  type HeroSealIcon,
  type StoreHeroCta,
  type StoreHeroHighlightKind,
  type StoreHeroProductAnalysis,
  type StoreHeroSeal,
  type StoreHeroTrust,
  type StoreHeroView,
} from "@/lib/store-hero"
import { computeEffectivePrice } from "@/lib/store-pricing"
import { cn } from "@/lib/utils"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

/**
 * Hero da Home da Loja: o banner principal, administrável em /admin/store/hero.
 *
 * Cada slide é uma campanha (arte desktop/mobile, título, subtítulo, produto
 * relacionado, dois botões, período). Mais de um no ar vira carrossel com as
 * mesmas regras de acessibilidade de `SectionBannerCarousel`: autoplay que
 * pausa com ponteiro/foco, botão explícito de pausa (WCAG 2.2.2), swipe,
 * setas do teclado e `prefers-reduced-motion`. Sem slide no ar, a Loja
 * mostra a arte estática de sempre.
 *
 * Slide com fim de campanha sai da tela sozinho quando o prazo vence, sem
 * esperar o cache da página (revalidate de 60s) nem um recarregamento.
 *
 * Colada embaixo vem a faixa de selos de curadoria (Produtos Aprovados,
 * Reviews independentes, Curadoria Sunano, Database Completa e Original) com a nota dos
 * compradores. Ela vale também para a arte estática: é o motivo de comprar
 * aqui, não a campanha da semana.
 */

const AUTOPLAY_MS = 7_000
const SWIPE_THRESHOLD_PX = 40
/** Teto do setTimeout (≈24,8 dias): além disso o navegador dispara na hora. */
const MAX_TIMEOUT_MS = 2_147_483_647

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  )
}

/** Arte estática de sempre: aspect-ratio da própria imagem (6047×1890) para mostrá-la inteira. */
function StaticStoreHero() {
  return (
    <div
      className="aspect-[6047/1890] w-full overflow-hidden bg-[#0b0f14] bg-contain bg-center bg-no-repeat"
      style={{ backgroundImage: "url(/images/mascot/Loja.png)" }}
    />
  )
}

function HeroLink({
  href,
  className,
  tabIndex,
  children,
}: {
  href: string
  className: string
  tabIndex: number
  children: React.ReactNode
}) {
  return isInternalBannerLink(href) ? (
    <RouteLink href={href} tabIndex={tabIndex} className={className}>
      {children}
    </RouteLink>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer" tabIndex={tabIndex} className={className}>
      {children}
    </a>
  )
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, "0")
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}min`
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

/** "Termina em …" da campanha. Só aparece depois de montar: número calculado no servidor divergiria da hidratação. */
function CampaignCountdown({ endsAt }: { endsAt: string }) {
  const end = useMemo(() => new Date(endsAt).getTime(), [endsAt])
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setRemaining(end - Date.now())
    const first = window.setTimeout(tick, 0)
    const interval = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
    }
  }, [end])

  if (remaining === null || remaining <= 0) return null

  return (
    <span
      role="timer"
      className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-400/35 bg-black/45 px-3 py-1 text-[11.5px] font-bold text-amber-200 backdrop-blur-sm"
    >
      <Clock className="size-3.5" strokeWidth={2.4} />
      Termina em <span className="tabular-nums">{formatRemaining(remaining)}</span>
    </span>
  )
}

const HIGHLIGHT_STYLE: Record<StoreHeroHighlightKind, { icon: LucideIcon; className: string }> = {
  campaign: { icon: Megaphone, className: "border-violet-300/40 bg-violet-500/25 text-violet-100" },
  launch: { icon: Rocket, className: "border-sky-300/40 bg-sky-500/25 text-sky-100" },
  product: { icon: Star, className: "border-amber-300/40 bg-amber-500/25 text-amber-100" },
  offer: { icon: Percent, className: "border-emerald-300/40 bg-emerald-500/25 text-emerald-100" },
}

/** Etiqueta acima do título: diz se o slide é campanha, lançamento, destaque ou oferta. */
function HighlightPill({ highlight }: { highlight: NonNullable<StoreHeroView["highlight"]> }) {
  const { icon: Icon, className } = HIGHLIGHT_STYLE[highlight.kind]
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] backdrop-blur-sm md:text-[11.5px]",
        className
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.4} />
      {highlight.label}
    </span>
  )
}

/** Mesmo preço que o card da vitrine anuncia (primeira variante com estoque). */
function heroProductPrice(product: StoreProductCard) {
  const variants = product.variants ?? []
  const activeVariant =
    product.has_variants && variants.length > 0
      ? variants.find((variant) => variant.stock === null || variant.stock > 0) ?? variants[0]
      : null
  return computeEffectivePrice(product, activeVariant)
}

/** Produto relacionado: foto, nome e preço real, clicável. */
function HeroProductChip({ product, tabIndex }: { product: StoreProductCard; tabIndex: number }) {
  const { effectiveCents, baseCents, hasDiscount } = heroProductPrice(product)
  const image = product.images?.[0] ?? null
  const isPreOrder = product.sale_type === "pre_order"
  const discountPercent = hasDiscount && baseCents > 0 ? Math.round((1 - effectiveCents / baseCents) * 100) : 0

  return (
    <Link
      href={productHref(product.slug)}
      tabIndex={tabIndex}
      className="group/chip flex w-full max-w-[380px] items-center gap-3 rounded-2xl border border-white/12 bg-black/45 p-2.5 pr-3.5 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-black/60"
    >
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06]">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="size-full object-contain p-1" draggable={false} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          {isPreOrder && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/90 px-1.5 py-px text-[9.5px] font-bold text-[#1a1200]">
              <Rocket className="size-2.5" strokeWidth={2.5} />
              Pré-venda
            </span>
          )}
          {discountPercent > 0 && (
            <span className="shrink-0 rounded-md bg-emerald-500/90 px-1.5 py-px text-[9.5px] font-extrabold text-[#03140c]">
              -{discountPercent}%
            </span>
          )}
          <span className="truncate text-[12.5px] font-semibold text-white">{product.name}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          {hasDiscount && <span className="text-[11px] text-white/45 line-through">{formatBRL(baseCents)}</span>}
          <span className="font-display text-[15px] font-bold text-emerald-400">{formatBRL(effectiveCents)}</span>
          <span className="text-[9.5px] font-semibold uppercase tracking-wide text-emerald-400/80">no PIX</span>
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-white/60 transition-transform group-hover/chip:translate-x-0.5 group-hover/chip:text-white" />
    </Link>
  )
}

/**
 * O produto em destaque no resto do Sunano: periférico vinculado no Database
 * e a posição no ranking da categoria. Link separado do chip (link dentro de
 * link não é HTML válido).
 */
function HeroProductAnalysis({ analysis, tabIndex }: { analysis: StoreHeroProductAnalysis; tabIndex: number }) {
  return (
    <Link
      href={analysis.href}
      tabIndex={tabIndex}
      className="group/analysis inline-flex w-fit max-w-full items-center gap-1.5 text-[11.5px] font-semibold text-white/70 transition-colors hover:text-white"
    >
      <Database className="size-3.5 shrink-0 text-sky-300" strokeWidth={2.2} />
      <span className="truncate">
        Analisado no Database
        {analysis.rank ? (
          <>
            {" · "}
            <span className="font-bold text-white">
              #{analysis.rank.position} de {analysis.rank.total}
            </span>{" "}
            na categoria
          </>
        ) : null}
      </span>
      <ArrowRight className="size-3 shrink-0 transition-transform group-hover/analysis:translate-x-0.5" strokeWidth={2.4} />
    </Link>
  )
}

function CtaButton({ cta, variant, tabIndex }: { cta: StoreHeroCta; variant: "primary" | "secondary"; tabIndex: number }) {
  return (
    <HeroLink
      href={cta.href}
      tabIndex={tabIndex}
      className={cn(
        "group/cta inline-flex h-11 items-center gap-2 rounded-full px-5 text-[13.5px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 md:h-12 md:px-6 md:text-[14.5px]",
        variant === "primary"
          ? "bg-white text-black hover:scale-[1.03]"
          : "border border-white/25 bg-white/[0.08] text-white backdrop-blur-sm hover:border-white/45 hover:bg-white/[0.14]"
      )}
    >
      {cta.text}
      {variant === "primary" && (
        <ArrowRight className="size-4 transition-transform group-hover/cta:translate-x-0.5" strokeWidth={2.4} />
      )}
    </HeroLink>
  )
}

/** Fundo do slide: a arte enviada (desktop/mobile) ou, sem arte, uma composição com a foto do produto. */
function HeroBackground({ slide, isCurrent, eager }: { slide: StoreHeroView; isCurrent: boolean; eager: boolean }) {
  const kenBurns = cn(
    "absolute inset-0 size-full object-cover motion-safe:transition-transform motion-safe:duration-[7000ms] motion-safe:ease-out",
    isCurrent ? "scale-100" : "motion-safe:scale-[1.05]"
  )

  if (slide.imageDesktopUrl) {
    return (
      <picture>
        {slide.imageMobileUrl && <source media="(max-width: 767px)" srcSet={slide.imageMobileUrl} />}
        <img
          src={slide.imageDesktopUrl}
          alt=""
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          draggable={false}
          className={kenBurns}
        />
      </picture>
    )
  }

  const product = slide.product
  if (!product) return null
  const { tint } = getCategoryIcon(product.category)
  const image = product.images?.[0] ?? null

  return (
    <div
      className="absolute inset-0"
      style={{
        background: `radial-gradient(90% 120% at 78% 30%, color-mix(in oklab, ${tint} 26%, #0b0f14), #0b0f14 70%)`,
      }}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          loading={eager ? "eager" : "lazy"}
          draggable={false}
          // Celular: a foto ocupa só o terço de cima, o texto mora embaixo e
          // cobre ~60% da altura. Desktop: coluna da direita, altura cheia.
          className={cn(
            "absolute left-1/2 top-[4%] aspect-square w-[46%] max-w-[260px] -translate-x-1/2 object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.55)] md:left-auto md:right-[7%] md:top-1/2 md:h-[84%] md:w-auto md:max-w-none md:-translate-y-1/2 md:translate-x-0",
            "motion-safe:transition-transform motion-safe:duration-[7000ms] motion-safe:ease-out",
            isCurrent ? "scale-100" : "motion-safe:scale-95"
          )}
        />
      )}
    </div>
  )
}

function HeroSlide({
  slide,
  index,
  total,
  isCurrent,
}: {
  slide: StoreHeroView
  index: number
  total: number
  isCurrent: boolean
}) {
  const tabIndex = isCurrent ? 0 : -1

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} de ${total}: ${slide.title}`}
      aria-hidden={!isCurrent}
      inert={!isCurrent}
      // Sem overflow-hidden aqui: com etiqueta, prazo, botões e produto o
      // texto pode passar do 3:4 de um celular estreito, e aí o slide cresce
      // em vez de cortar o título. Quem recorta o zoom da arte é a <section>.
      className={cn(
        "relative col-start-1 row-start-1 aspect-[3/4] max-h-[620px] w-full transition-opacity duration-700 ease-out motion-reduce:transition-none md:aspect-[16/5] md:max-h-none md:min-h-[380px]",
        isCurrent ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <HeroBackground slide={slide} isCurrent={isCurrent} eager={index === 0} />

      {/* Véu para o texto ler sobre qualquer arte: de baixo no celular (texto
          embaixo), da esquerda no desktop (texto à esquerda). */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent md:bg-gradient-to-r md:from-black/80 md:via-black/35 md:to-transparent" />

      <div
        className={cn(
          "relative flex h-full flex-col justify-end gap-3 px-5 pt-5 md:justify-center md:gap-4 md:px-12 lg:px-16",
          total > 1 ? "pb-12 md:pb-10" : "pb-6 md:pb-10"
        )}
      >
        <div
          className={cn(
            "flex max-w-[600px] flex-col gap-3 transition-all duration-700 ease-out motion-reduce:transition-none md:gap-4",
            isCurrent ? "translate-y-0 opacity-100 delay-150" : "translate-y-3 opacity-0"
          )}
        >
          {(slide.highlight || slide.endsAt) && (
            <div className="flex flex-wrap items-center gap-2">
              {slide.highlight && <HighlightPill highlight={slide.highlight} />}
              {slide.endsAt && <CampaignCountdown endsAt={slide.endsAt} />}
            </div>
          )}
          <h2 className="font-display text-[30px] font-bold leading-[1.02] tracking-[-0.02em] text-white drop-shadow-sm md:text-[44px] lg:text-[54px]">
            {slide.title}
          </h2>
          {slide.subtitle && (
            <p className="line-clamp-2 max-w-[480px] text-[14px] leading-relaxed text-white/80 md:line-clamp-3 md:text-[16.5px]">
              {slide.subtitle}
            </p>
          )}
          {(slide.primaryCta || slide.secondaryCta) && (
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {slide.primaryCta && <CtaButton cta={slide.primaryCta} variant="primary" tabIndex={tabIndex} />}
              {slide.secondaryCta && <CtaButton cta={slide.secondaryCta} variant="secondary" tabIndex={tabIndex} />}
            </div>
          )}
          {slide.product && (
            <div className="flex flex-col gap-2 pt-1">
              <HeroProductChip product={slide.product} tabIndex={tabIndex} />
              {slide.analysis && <HeroProductAnalysis analysis={slide.analysis} tabIndex={tabIndex} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function HeroCarousel({ slides }: { slides: StoreHeroView[] }) {
  const [current, setCurrent] = useState(0)
  const [isHoverPaused, setIsHoverPaused] = useState(false)
  const [isStopped, setIsStopped] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  const dragStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)

  const total = slides.length
  const currentIndex = current < total ? current : 0
  const shouldAutoRotate = total > 1 && !isHoverPaused && !isStopped && !prefersReducedMotion

  const goTo = useCallback(
    (index: number) => {
      if (total === 0) return
      setCurrent(((index % total) + total) % total)
    },
    [total]
  )

  useEffect(() => {
    if (!shouldAutoRotate) return
    const timer = window.setInterval(() => setCurrent((value) => (value + 1) % total), AUTOPLAY_MS)
    return () => window.clearInterval(timer)
    // `currentIndex` de propósito: navegação manual reinicia a contagem.
  }, [shouldAutoRotate, total, currentIndex])

  function onKeyDown(event: React.KeyboardEvent) {
    if (total <= 1) return
    if (event.key === "ArrowRight") {
      event.preventDefault()
      goTo(currentIndex + 1)
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      goTo(currentIndex - 1)
    }
  }

  function onPointerDown(event: React.PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  }

  function onPointerUp(event: React.PointerEvent) {
    const start = dragStartRef.current
    dragStartRef.current = null
    if (!start || start.pointerId !== event.pointerId || total <= 1) return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    // Gesto mais vertical que horizontal é rolagem da página, não swipe.
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return
    goTo(currentIndex + (deltaX < 0 ? 1 : -1))
  }

  const hasControls = total > 1

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques da Loja"
      onMouseEnter={() => setIsHoverPaused(true)}
      onMouseLeave={() => setIsHoverPaused(false)}
      onFocusCapture={() => setIsHoverPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsHoverPaused(false)
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragStartRef.current = null
      }}
      className="group/hero relative touch-pan-y overflow-hidden border-b border-[#1c1c1c] bg-[#0b0f14]"
    >
      {/* Todos os slides na mesma célula do grid: o crossfade é só opacidade. */}
      <div className="relative grid w-full">
        {slides.map((slide, index) => (
          <HeroSlide key={slide.id} slide={slide} index={index} total={total} isCurrent={index === currentIndex} />
        ))}
      </div>

      {hasControls && (
        <>
          <button
            type="button"
            onClick={() => goTo(currentIndex - 1)}
            aria-label="Slide anterior"
            className="absolute left-4 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/60 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 group-hover/hero:opacity-100 md:flex"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => goTo(currentIndex + 1)}
            aria-label="Próximo slide"
            className="absolute right-4 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/60 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 group-hover/hero:opacity-100 md:flex"
          >
            <ChevronRight className="size-5" />
          </button>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center pb-4">
            <div className="pointer-events-auto flex items-center gap-2">
              {slides.map((slide, index) => {
                const isCurrent = index === currentIndex
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={`Ir para o slide ${index + 1}: ${slide.title}`}
                    aria-current={isCurrent}
                    className={cn(
                      "h-2 rounded-full transition-all duration-300 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
                      isCurrent ? "w-7 bg-white" : "w-2 bg-white/45 hover:bg-white/80"
                    )}
                  />
                )
              })}
            </div>

            {/* WCAG 2.2.2: controle explícito para parar o movimento. */}
            <button
              type="button"
              onClick={() => setIsStopped((value) => !value)}
              aria-label={isStopped ? "Retomar rotação dos slides" : "Pausar rotação dos slides"}
              className="pointer-events-auto absolute right-3 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:right-5"
            >
              {isStopped ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </button>
          </div>
        </>
      )}

      <div aria-live="polite" aria-atomic className="sr-only">
        {`Slide ${currentIndex + 1} de ${total}: ${slides[currentIndex]?.title ?? ""}`}
      </div>
    </section>
  )
}

/**
 * Tira da tela o slide cuja campanha acabou enquanto a página estava aberta.
 * `null` até montar: no servidor e na hidratação vale a lista que o servidor
 * mandou (ele já filtrou pelo período), então não há divergência.
 */
function useLiveSlides(slides: StoreHeroView[]): StoreHeroView[] {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const current = Date.now()
    const timers: number[] = []
    if (now === null) timers.push(window.setTimeout(() => setNow(Date.now()), 0))

    const nextEnd = slides
      .map((slide) => (slide.endsAt ? new Date(slide.endsAt).getTime() : null))
      .filter((end): end is number => end !== null && end > current)
      .sort((a, b) => a - b)[0]
    if (nextEnd !== undefined) {
      timers.push(window.setTimeout(() => setNow(Date.now()), Math.min(nextEnd - current + 50, MAX_TIMEOUT_MS)))
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [slides, now])

  return useMemo(
    () => (now === null ? slides : slides.filter((slide) => !slide.endsAt || new Date(slide.endsAt).getTime() > now)),
    [slides, now]
  )
}

/** Ícone e cor de cada selo. Exportado para o seletor do painel desenhar o mesmo. */
export const HERO_SEAL_STYLE: Record<HeroSealIcon, { icon: LucideIcon; tint: string }> = {
  tested: { icon: PackageCheck, tint: "oklch(0.75 0.15 160)" },
  reviews: { icon: MessageSquareQuote, tint: "oklch(0.78 0.14 85)" },
  curation: { icon: BadgeCheck, tint: "oklch(0.72 0.14 250)" },
  database: { icon: Database, tint: "oklch(0.74 0.12 210)" },
  ranking: { icon: Trophy, tint: "oklch(0.8 0.13 95)" },
  shield: { icon: ShieldCheck, tint: "oklch(0.74 0.13 150)" },
  community: { icon: Users, tint: "oklch(0.72 0.14 300)" },
}

function SealItem({ seal }: { seal: StoreHeroSeal }) {
  const { icon: Icon, tint } = HERO_SEAL_STYLE[seal.icon]
  const content = (
    <>
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 md:size-9"
        style={{ background: `color-mix(in oklab, ${tint} 16%, #0e0e0e)` }}
      >
        <Icon className="size-4 md:size-[18px]" style={{ color: tint }} strokeWidth={2} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1 text-[12px] font-bold leading-tight text-white md:text-[13px]">
          {seal.title}
          {seal.link && (
            // No celular o título quebra em duas linhas e a seta solta ficava
            // longe do texto; lá o selo inteiro já é a área de toque.
            <ArrowRight
              className="hidden size-3 shrink-0 text-white/40 transition-all group-hover/seal:translate-x-0.5 group-hover/seal:text-white md:block"
              strokeWidth={2.4}
            />
          )}
        </span>
        {seal.description && (
          <span className="mt-0.5 hidden text-[11.5px] leading-snug text-[#8f8f8f] lg:block">{seal.description}</span>
        )}
      </span>
    </>
  )
  const className = "group/seal flex items-center gap-2.5 md:gap-3"

  if (!seal.link) return <div className={className}>{content}</div>
  return isInternalBannerLink(seal.link) ? (
    <RouteLink href={seal.link} className={className}>
      {content}
    </RouteLink>
  ) : (
    <a href={seal.link} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  )
}

/** Nota média dos compradores, com link para todas as avaliações. */
function RatingSummary({ rating }: { rating: NonNullable<StoreHeroTrust["rating"]> }) {
  const average = rating.average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <RouteLink
      href="/loja/avaliacoes"
      className="group/rating flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 transition-colors hover:border-white/25 hover:bg-white/[0.07]"
    >
      <Star className="size-4 fill-amber-400 text-amber-400" strokeWidth={0} />
      <span className="font-display text-[15px] font-bold text-white">{average}</span>
      <span className="text-[11.5px] font-semibold text-[#9a9a9a] group-hover/rating:text-white">
        {rating.count} {rating.count === 1 ? "avaliação" : "avaliações"} de compradores
      </span>
    </RouteLink>
  )
}

/**
 * Faixa colada no Hero: por que comprar na Loja Sunano. Administrável em
 * /admin/store/hero (selos) e alimentada pelas avaliações publicadas (nota).
 * Exportada para a prévia do painel.
 */
export function HeroSealsBar({ trust }: { trust: StoreHeroTrust }) {
  if (trust.seals.length === 0 && !trust.rating) return null

  return (
    <section aria-label="Por que comprar na Loja Sunano" className="border-b border-[#1c1c1c] bg-[#0b0f14]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:gap-6 lg:px-8 lg:py-4">
        {trust.seals.length > 0 && (
          <ul
            className={cn(
              "grid flex-1 grid-cols-2 gap-x-3 gap-y-3 md:gap-x-5",
              trust.seals.length === 3 ? "md:grid-cols-3" : trust.seals.length >= 4 ? "md:grid-cols-4" : ""
            )}
          >
            {trust.seals.map((seal) => (
              <li key={`${seal.icon}-${seal.title}`} className="min-w-0">
                <SealItem seal={seal} />
              </li>
            ))}
          </ul>
        )}
        {trust.rating && <RatingSummary rating={trust.rating} />}
      </div>
    </section>
  )
}

export function StoreHero({ slides, trust }: { slides: StoreHeroView[]; trust?: StoreHeroTrust }) {
  const liveSlides = useLiveSlides(slides)
  return (
    <>
      {liveSlides.length === 0 ? <StaticStoreHero /> : <HeroCarousel slides={liveSlides} />}
      {trust && <HeroSealsBar trust={trust} />}
    </>
  )
}
