"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react"

import { AnimatedCounter } from "@/components/animated-counter"
import { isInternalBannerLink } from "@/lib/banner-link"
import { cn } from "@/lib/utils"

/**
 * Carrossel de banners do topo da Home.
 *
 * Acessibilidade (o que faz este componente passar em auditoria):
 * - **Botão de pausa explícito** — WCAG 2.2.2 exige um controle para parar
 *   conteúdo que se move sozinho por mais de 5s. Hover e foco também pausam,
 *   mas nenhum dos dois substitui o botão.
 * - Slides fora de tela ficam `inert`: não recebem foco nem clique.
 * - Sem rotação automática para quem pediu menos movimento no sistema
 *   (`prefers-reduced-motion`); a navegação manual continua.
 * - Setas ←/→ do teclado navegam; troca de slide é anunciada via `aria-live`.
 *
 * Cada banner é clicável: caminho interno navega pelo router (`next/link`),
 * URL externa abre em nova aba.
 */

export type CarouselBanner =
  | {
      id: string
      kind: "image"
      imageUrl: string
      imageUrlMobile: string | null
      linkUrl: string | null
      altText: string | null
    }
  | {
      id: string
      /** Slide com conteúdo arbitrário (hoje só o hero fixo "Periféricos sem mistério") — sem imagem/link próprios, o carrossel só cuida da moldura. */
      kind: "custom"
      content: React.ReactNode
    }

const DEFAULT_INTERVAL_MS = 10_000

/** Deslocamento horizontal mínimo (px) para um arraste virar troca de slide. */
const SWIPE_THRESHOLD_PX = 40

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
    () => false // No servidor não dá para saber; assume movimento permitido.
  )
}

/** Moldura comum a todo slide: recorte no grid, `inert` fora de tela, fade de opacidade. */
function SlideFrame({
  children,
  isCurrent,
  index,
  total,
}: {
  children: React.ReactNode
  isCurrent: boolean
  index: number
  total: number
}) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`Banner ${index + 1} de ${total}`}
      aria-hidden={!isCurrent}
      inert={!isCurrent}
      className={cn(
        "col-start-1 row-start-1 transition-opacity duration-700 ease-out motion-reduce:transition-none",
        // Só o slide atual fica em fluxo normal — é ele quem define a altura
        // da célula do grid. Os demais viram `absolute` (tirados do fluxo):
        // sem isso, um banner com proporção diferente (ex.: quase quadrado
        // entre banners bem largos) empurrava a altura do carrossel inteiro
        // pela sua própria altura mesmo escondido, sobrando vão vazio abaixo
        // de qualquer slide mais baixo que ele.
        isCurrent ? "opacity-100" : "pointer-events-none absolute inset-0 opacity-0"
      )}
    >
      {children}
    </div>
  )
}

/** Imagem do slide + a camada clicável que a envolve (ou não, se não houver link). */
function BannerSlide({
  banner,
  isCurrent,
  index,
  total,
}: {
  banner: Extract<CarouselBanner, { kind: "image" }>
  isCurrent: boolean
  index: number
  total: number
}) {
  const image = (
    <picture>
      {banner.imageUrlMobile && (
        <source media="(max-width: 767px)" srcSet={banner.imageUrlMobile} />
      )}
      <img
        src={banner.imageUrl}
        alt={banner.altText ?? ""}
        // O primeiro banner é o LCP da Home; os demais só carregam quando entram.
        loading={index === 0 ? "eager" : "lazy"}
        fetchPriority={index === 0 ? "high" : "auto"}
        draggable={false}
        className="block w-full h-auto"
      />
    </picture>
  )

  const content = banner.linkUrl ? (
    isInternalBannerLink(banner.linkUrl) ? (
      <Link href={banner.linkUrl} className="block w-full" tabIndex={isCurrent ? 0 : -1}>
        {image}
      </Link>
    ) : (
      <a
        href={banner.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full"
        tabIndex={isCurrent ? 0 : -1}
      >
        {image}
      </a>
    )
  ) : (
    image
  )

  return (
    <SlideFrame index={index} total={total} isCurrent={isCurrent}>
      {content}
    </SlideFrame>
  )
}

/** Pílula com os números da comunidade, sobreposta a qualquer slide (imagem ou hero). */
function StatsOverlay({
  counts,
}: {
  counts: { peripherals: number; reviews: number; forumPosts: number }
}) {
  const items = [
    { value: counts.peripherals, label: "Periféricos" },
    { value: counts.reviews, label: "Reviews" },
    { value: counts.forumPosts, label: "Tópicos" },
  ]

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/40 px-3.5 py-1.5 text-white backdrop-blur-sm sm:gap-4">
      {items.map(({ value, label }) => (
        <div key={label} className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold">
            <AnimatedCounter value={value} />
          </span>
          <span className="text-[9px] uppercase tracking-widest text-white/70">{label}</span>
        </div>
      ))}
    </div>
  )
}

/** Seta de navegação lateral. */
function ArrowButton({
  side,
  onClick,
  label,
}: {
  side: "left" | "right"
  onClick: () => void
  label: string
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur-sm transition-all",
        "hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:block",
        side === "left" ? "left-3" : "right-3"
      )}
    >
      <Icon className="size-5" />
    </button>
  )
}

export default function BannerCarousel({
  banners,
  counts,
  intervalMs = DEFAULT_INTERVAL_MS,
  className,
}: {
  banners: CarouselBanner[]
  /** Números da comunidade exibidos em todos os slides (imagem ou hero). */
  counts?: { peripherals: number; reviews: number; forumPosts: number }
  intervalMs?: number
  className?: string
}) {
  const [current, setCurrent] = useState(0)
  // Pausa transitória: ponteiro em cima ou foco dentro do carrossel.
  const [isHoverPaused, setIsHoverPaused] = useState(false)
  // Pausa deliberada: o visitante apertou o botão. Só ele reverte.
  const [isStopped, setIsStopped] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()

  const dragStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const suppressClickRef = useRef(false)

  const total = banners.length
  const shouldAutoRotate =
    total > 1 && !isHoverPaused && !isStopped && !prefersReducedMotion

  // Se a lista encolher (banner removido no admin), o índice guardado pode
  // apontar para fora dela — daí o slide exibido ser sempre derivado, não o
  // estado cru.
  const currentIndex = current < total ? current : 0

  const goTo = useCallback(
    (index: number) => {
      if (total === 0) return
      setCurrent(((index % total) + total) % total)
    },
    [total]
  )

  useEffect(() => {
    if (!shouldAutoRotate) return

    const timer = window.setInterval(() => {
      setCurrent((value) => (value + 1) % total)
    }, intervalMs)

    return () => window.clearInterval(timer)
    // `currentIndex` entra na lista de propósito: qualquer navegação manual
    // reinicia a contagem, em vez de trocar de slide logo em seguida.
  }, [shouldAutoRotate, total, intervalMs, currentIndex])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (total <= 1) return
      if (event.key === "ArrowRight") {
        event.preventDefault()
        goTo(currentIndex + 1)
      } else if (event.key === "ArrowLeft") {
        event.preventDefault()
        goTo(currentIndex - 1)
      }
    },
    [currentIndex, goTo, total]
  )

  // ── Swipe ────────────────────────────────────────────────
  // O slide inteiro é um link, então um arraste precisa cancelar o clique que
  // o navegador dispara logo depois — senão deslizar navega sem querer.
  function onPointerDown(event: React.PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    suppressClickRef.current = false
  }

  function onPointerUp(event: React.PointerEvent) {
    const start = dragStartRef.current
    dragStartRef.current = null
    if (!start || start.pointerId !== event.pointerId || total <= 1) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    // Gesto mais vertical que horizontal é rolagem da página, não swipe.
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return

    suppressClickRef.current = true
    goTo(currentIndex + (deltaX < 0 ? 1 : -1))
  }

  function onClickCapture(event: React.MouseEvent) {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }

  const dots = useMemo(() => banners.map((banner, index) => ({ id: banner.id, index })), [banners])

  if (total === 0) return null

  const hasControls = total > 1

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques do Sunano"
      onMouseEnter={() => setIsHoverPaused(true)}
      onMouseLeave={() => setIsHoverPaused(false)}
      onFocusCapture={() => setIsHoverPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsHoverPaused(false)
        }
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragStartRef.current = null
      }}
      onClickCapture={onClickCapture}
      className={cn(
        "relative touch-pan-y overflow-hidden rounded-3xl border border-border bg-card",
        className
      )}
    >
      {/* Grid com todos os slides na mesma célula: a altura do carrossel
          acompanha a imagem atual (sem cortar), e o crossfade acontece via
          opacidade em vez de position: absolute. */}
      <div className="relative grid w-full">
        {banners.map((banner, index) =>
          banner.kind === "custom" ? (
            <SlideFrame key={banner.id} index={index} total={total} isCurrent={index === currentIndex}>
              {banner.content}
            </SlideFrame>
          ) : (
            <BannerSlide
              key={banner.id}
              banner={banner}
              index={index}
              total={total}
              isCurrent={index === currentIndex}
            />
          )
        )}
      </div>

      {counts && (
        <div className="pointer-events-none absolute left-3 top-3 z-10">
          <StatsOverlay counts={counts} />
        </div>
      )}

      {hasControls && (
        <>
          <ArrowButton side="left" label="Banner anterior" onClick={() => goTo(currentIndex - 1)} />
          <ArrowButton side="right" label="Próximo banner" onClick={() => goTo(currentIndex + 1)} />

          <div className="pointer-events-none absolute inset-x-0 bottom-0">
            {/* Véu sutil para os controles não sumirem sobre banners claros. */}
            <div className="h-16 bg-gradient-to-t from-black/45 to-transparent" />

            <div className="pointer-events-auto absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
              {dots.map(({ id, index }) => {
                const isCurrent = index === currentIndex
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={`Ir para o banner ${index + 1}`}
                    aria-current={isCurrent}
                    className={cn(
                      "relative h-2 overflow-hidden rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40",
                      isCurrent ? "w-6 bg-white/25" : "w-2 bg-white/50 hover:bg-white/80"
                    )}
                  >
                    {/* No dot ativo, a barra some do zero e enche até trocar de
                        slide — parada (sem animação) enquanto o autoplay está
                        pausado, já que aí não há contagem correndo pra mostrar.
                        `key` reinicia a animação do zero a cada slide novo. */}
                    {isCurrent && shouldAutoRotate && (
                      <span
                        key={currentIndex}
                        style={{ "--carousel-interval": `${intervalMs}ms` } as React.CSSProperties}
                        className="animate-carousel-progress absolute inset-0 rounded-full bg-white"
                      />
                    )}
                    {isCurrent && !shouldAutoRotate && (
                      <span className="absolute inset-0 rounded-full bg-white" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* WCAG 2.2.2: controle explícito para parar o movimento. */}
            <button
              type="button"
              onClick={() => setIsStopped((value) => !value)}
              aria-label={isStopped ? "Retomar rotação dos banners" : "Pausar rotação dos banners"}
              className="pointer-events-auto absolute bottom-2.5 right-3 rounded-full bg-black/35 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              {isStopped ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </button>
          </div>
        </>
      )}

      {/* Anúncio de troca de slide para leitores de tela. */}
      <div aria-live="polite" aria-atomic className="sr-only">
        {`Banner ${currentIndex + 1} de ${total}`}
      </div>
    </section>
  )
}
