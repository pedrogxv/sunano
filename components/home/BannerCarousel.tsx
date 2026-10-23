"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react"

import { AnimatedCounter } from "@/components/animated-counter"
import { isInternalBannerLink } from "@/lib/banner-link"
import { storageWidthSrcSet } from "@/lib/storage-thumb"
import { cn } from "@/lib/utils"

/**
 * Carrossel de banners do topo da Home.
 *
 * Acessibilidade (o que faz este componente passar em auditoria):
 * - **Botão de pausa explícito** — WCAG 2.2.2 exige um controle para parar
 *   conteúdo que se move sozinho por mais de 5s. Mouse em cima e foco de
 *   teclado também pausam (a barra congela onde está), mas nenhum dos dois
 *   substitui o botão. Toque não pausa: no celular o navegador emula um
 *   `mouseenter` no toque e nunca manda o `mouseleave`, e o carrossel ficava
 *   parado para sempre depois do primeiro swipe ou dot.
 * - Slides fora de tela ficam `inert`: não recebem foco nem clique.
 * - Sem rotação automática para quem pediu menos movimento no sistema
 *   (`prefers-reduced-motion`); a navegação manual continua.
 * - No celular a rotação automática começa PARADA (o botão ▶ a liga). Lá o
 *   hero tem ~340px de altura e um banner 16:5 tem ~125px: cada troca
 *   sozinha subia a página inteira uns 200px, e layout shift sem interação
 *   conta no CLS do Google (era o 0,3 do Lighthouse). Troca por swipe, dot ou
 *   botão é interação e não conta. No desktop as alturas são parecidas.
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

/** Mesmo corte do `md` do Tailwind: daqui pra baixo o layout é o de celular. */
const WIDE_VIEWPORT_QUERY = "(min-width: 768px)"

function useMediaQuery(query: string, serverValue: boolean) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => serverValue
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

/**
 * Roda `callback` com o navegador ocioso, depois do evento `load`. Devolve o
 * cancelamento (para o cleanup do efeito).
 */
function whenIdleAfterLoad(callback: () => void) {
  let idleHandle: number | undefined
  let timeoutHandle: number | undefined

  const schedule = () => {
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(callback, { timeout: 2000 })
    } else {
      timeoutHandle = window.setTimeout(callback, 200)
    }
  }

  if (document.readyState === "complete") schedule()
  else window.addEventListener("load", schedule, { once: true })

  return () => {
    window.removeEventListener("load", schedule)
    if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle)
    if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle)
  }
}

/** Imagem do slide + a camada clicável que a envolve (ou não, se não houver link). */
/** O banner ocupa a largura do conteúdo da Home (`max-w-6xl`). */
const BANNER_SIZES = "(min-width: 1200px) 1152px, 100vw"

function BannerSlide({
  banner,
  isCurrent,
  isArmed,
  index,
  total,
}: {
  banner: Extract<CarouselBanner, { kind: "image" }>
  isCurrent: boolean
  /** Sem isso o slide fica vazio: a imagem só entra quando ele vai ser exibido. */
  isArmed: boolean
  index: number
  total: number
}) {
  if (!isArmed) {
    return <SlideFrame index={index} total={total} isCurrent={isCurrent}>{null}</SlideFrame>
  }

  const image = (
    <picture>
      {banner.imageUrlMobile && (
        <source
          media="(max-width: 767px)"
          srcSet={storageWidthSrcSet(banner.imageUrlMobile) ?? banner.imageUrlMobile}
          sizes="100vw"
        />
      )}
      {/* Por largura: o celular deixa de baixar a arte de 1920px do desktop
          (lib/storage-thumb.ts); tela larga continua recebendo o original. */}
      <img
        src={banner.imageUrl}
        srcSet={storageWidthSrcSet(banner.imageUrl)}
        sizes={BANNER_SIZES}
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
  // Pausa transitória: mouse em cima ou foco de teclado dentro do carrossel.
  const [isHoverPaused, setIsHoverPaused] = useState(false)
  // Pausa deliberada: o visitante apertou o botão. Só ele reverte. `null` =
  // ainda não escolheu, e aí vale o padrão do viewport (parado no celular).
  const [stoppedChoice, setStoppedChoice] = useState<boolean | null>(null)
  // No servidor não dá para saber; assume movimento permitido e tela estreita
  // (o desktop liga a rotação logo depois de hidratar, sem mudar o layout).
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY, false)
  const isWideViewport = useMediaQuery(WIDE_VIEWPORT_QUERY, false)
  const isStopped = stoppedChoice ?? !isWideViewport

  const dragStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const suppressClickRef = useRef(false)

  const total = banners.length
  // Com a rotação ligada, quem troca o slide é o fim da barra do dot atual
  // (`onAnimationEnd`), não um setInterval: a pausa por hover só congela a
  // barra, e ela retoma de onde parou em vez de recomeçar o relógio com a
  // barra pela metade.
  const isAutoplayOn = total > 1 && !isStopped && !prefersReducedMotion

  // Se a lista encolher (banner removido no admin), o índice guardado pode
  // apontar para fora dela — daí o slide exibido ser sempre derivado, não o
  // estado cru.
  const currentIndex = current < total ? current : 0

  // Slides de imagem que já podem ter <img>. Os de fora de tela ficam
  // empilhados sobre o atual (opacidade 0), então o `loading="lazy"` os vê
  // "na tela" e baixa todos de uma vez, com prioridade alta: no celular eram
  // ~320KB de banner invisível disputando banda com a primeira pintura, e o
  // Lighthouse soma tudo que começa antes do LCP na estimativa dele. Agora só
  // o primeiro slide vai no HTML; os vizinhos do atual entram depois do
  // `load`, com o navegador ocioso, a tempo da troca automática ou do swipe.
  const [armedSlides, setArmedSlides] = useState<ReadonlySet<number>>(() => new Set([0]))

  useEffect(() => {
    if (total <= 1) return
    const neighbors = [(currentIndex + 1) % total, (currentIndex - 1 + total) % total]
    return whenIdleAfterLoad(() => {
      setArmedSlides((previous) =>
        neighbors.every((index) => previous.has(index))
          ? previous
          : new Set([...previous, ...neighbors])
      )
    })
  }, [currentIndex, total])

  const goTo = useCallback(
    (index: number) => {
      if (total === 0) return
      setCurrent(((index % total) + total) % total)
    },
    [total]
  )

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
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setIsHoverPaused(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setIsHoverPaused(false)
      }}
      // Só foco de teclado: o clique num dot também foca o botão, e aí a
      // rotação parava depois de qualquer troca manual.
      onFocusCapture={(event) => {
        if ((event.target as Element).matches(":focus-visible")) setIsHoverPaused(true)
      }}
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
              // O slide atual sempre tem imagem, mesmo que a navegação tenha
              // pulado para um ainda não armado (dot distante).
              isArmed={index === currentIndex || armedSlides.has(index)}
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

            <div className="pointer-events-auto absolute inset-x-0 bottom-1 flex items-center justify-center">
              {dots.map(({ id, index }) => {
                const isCurrent = index === currentIndex
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={`Ir para o banner ${index + 1}`}
                    aria-current={isCurrent}
                    // O botão é a área de toque (24×24, mínimo do WCAG 2.5.8 que
                    // o Lighthouse cobra); o ponto de 8px é o <span> de dentro.
                    // Com o botão do tamanho do ponto, os alvos tinham 8px.
                    className="group flex h-6 min-w-6 items-center justify-center px-1 focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        "relative block h-2 overflow-hidden rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none",
                        "group-focus-visible:ring-2 group-focus-visible:ring-white/80 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-black/40",
                        isCurrent ? "w-6 bg-white/25" : "w-2 bg-white/50 group-hover:bg-white/80"
                      )}
                    >
                      {/* No dot ativo, a barra sai do zero e, ao encher, troca o
                          slide. Mouse em cima congela a barra onde está; com a
                          rotação desligada ela fica cheia, sem contagem para
                          mostrar. `key` reinicia do zero a cada slide novo. */}
                      {isCurrent && isAutoplayOn && (
                        <span
                          key={currentIndex}
                          onAnimationEnd={() => goTo(currentIndex + 1)}
                          style={
                            {
                              "--carousel-interval": `${intervalMs}ms`,
                              animationPlayState: isHoverPaused ? "paused" : "running",
                            } as React.CSSProperties
                          }
                          className="animate-carousel-progress absolute inset-0 rounded-full bg-white"
                        />
                      )}
                      {isCurrent && !isAutoplayOn && (
                        <span className="absolute inset-0 rounded-full bg-white" />
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* WCAG 2.2.2: controle explícito para parar o movimento. */}
            <button
              type="button"
              onClick={() => setStoppedChoice(!isStopped)}
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
