"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { Pause, Play } from "lucide-react"

import { isInternalBannerLink } from "@/lib/banner-link"
import { cn } from "@/lib/utils"

/**
 * Carrossel de banners de uma seção da Loja (Mais vendidos / Pré-venda /
 * Pronta entrega / Itens para o site) — imagem ou vídeo de fundo, título,
 * subtítulo e um botão de CTA.
 *
 * Adaptado de `components/home/BannerCarousel.tsx` (autoplay, pausa por
 * hover/foco, swipe, `prefers-reduced-motion`, crossfade via opacidade em
 * grid empilhado, botão explícito de pausa por WCAG 2.2.2), com três
 * diferenças deliberadas:
 * - Sem setas de navegação — só dots (referência de design).
 * - Só o botão de CTA é clicável, não o slide inteiro — evita conflito com
 *   swipe/arraste e deixa a ação do banner explícita.
 * - Suporta vídeo de fundo (autoplay+loop+mudo), com fallback pra imagem se
 *   o vídeo falhar ou não existir. Só o slide atual reproduz vídeo.
 */

export type SectionCarouselBanner = {
  id: string
  imageUrl: string | null
  videoUrl: string | null
  title: string
  subtitle: string | null
  ctaText: string | null
  ctaLink: string | null
}

const DEFAULT_INTERVAL_MS = 8_000

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

/** Botão de CTA — caminho interno navega pelo router, URL externa abre em nova aba. */
function BannerCtaButton({
  ctaText,
  ctaLink,
  tabIndex,
}: {
  ctaText: string
  ctaLink: string
  tabIndex: number
}) {
  const className =
    "inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[13px] font-bold text-black transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 sm:text-sm"

  return isInternalBannerLink(ctaLink) ? (
    <Link href={ctaLink} tabIndex={tabIndex} className={className}>
      {ctaText}
    </Link>
  ) : (
    <a href={ctaLink} target="_blank" rel="noopener noreferrer" tabIndex={tabIndex} className={className}>
      {ctaText}
    </a>
  )
}

/** Mídia de fundo (vídeo com fallback pra imagem) + overlay de título/subtítulo/CTA. */
function BannerSlide({
  banner,
  isCurrent,
  index,
  total,
}: {
  banner: SectionCarouselBanner
  isCurrent: boolean
  index: number
  total: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoFailed, setVideoFailed] = useState(false)
  const showVideo = Boolean(banner.videoUrl) && !videoFailed

  // Só o slide atual reproduz vídeo — evita várias mídias tocando ao mesmo
  // tempo fora de tela. `autoPlay` não reage a mudança de prop depois do
  // mount, então o play/pause é imperativo.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isCurrent) {
      video.currentTime = 0
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [isCurrent])

  const ctaTabIndex = isCurrent ? 0 : -1

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`Banner ${index + 1} de ${total}`}
      aria-hidden={!isCurrent}
      inert={!isCurrent}
      className={cn(
        "relative col-start-1 row-start-1 aspect-[16/9] w-full overflow-hidden transition-opacity duration-700 ease-out motion-reduce:transition-none sm:aspect-[21/7]",
        isCurrent ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      {showVideo && (
        <video
          ref={videoRef}
          src={banner.videoUrl ?? undefined}
          poster={banner.imageUrl ?? undefined}
          muted
          loop
          playsInline
          preload={isCurrent ? "auto" : "none"}
          onError={() => setVideoFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {!showVideo && banner.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={banner.imageUrl}
          alt=""
          loading={index === 0 ? "eager" : "lazy"}
          fetchPriority={index === 0 ? "high" : "auto"}
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      )}

      {/* Véu para o texto ficar legível sobre mídia arbitrária. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

      <div className="relative flex h-full flex-col justify-end gap-1.5 p-5 sm:gap-2.5 sm:p-10">
        <h3 className="font-display text-2xl font-bold leading-tight text-white drop-shadow-sm sm:text-4xl">
          {banner.title}
        </h3>
        {banner.subtitle && (
          <p className="max-w-md text-[13px] text-white/85 sm:text-base">{banner.subtitle}</p>
        )}
        {banner.ctaText && banner.ctaLink && (
          <div className="mt-1.5 sm:mt-2.5">
            <BannerCtaButton ctaText={banner.ctaText} ctaLink={banner.ctaLink} tabIndex={ctaTabIndex} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function SectionBannerCarousel({
  banners,
  intervalMs = DEFAULT_INTERVAL_MS,
  className,
}: {
  banners: SectionCarouselBanner[]
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

  const dots = useMemo(() => banners.map((banner, index) => ({ id: banner.id, index })), [banners])

  if (total === 0) return null

  const hasControls = total > 1

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Banners em destaque"
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
      className={cn(
        "relative touch-pan-y overflow-hidden rounded-3xl border border-border bg-card",
        className
      )}
    >
      {/* Grid com todos os slides na mesma célula: o crossfade acontece via
          opacidade em vez de position: absolute. */}
      <div className="relative grid w-full">
        {banners.map((banner, index) => (
          <BannerSlide
            key={banner.id}
            banner={banner}
            index={index}
            total={total}
            isCurrent={index === currentIndex}
          />
        ))}
      </div>

      {hasControls && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center pb-3.5">
          <div className="pointer-events-auto flex items-center gap-2">
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
                    "h-2 rounded-full transition-all duration-300 motion-reduce:transition-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40",
                    isCurrent ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                  )}
                />
              )
            })}
          </div>

          {/* WCAG 2.2.2: controle explícito para parar o movimento. */}
          <button
            type="button"
            onClick={() => setIsStopped((value) => !value)}
            aria-label={isStopped ? "Retomar rotação dos banners" : "Pausar rotação dos banners"}
            className="pointer-events-auto absolute right-3 rounded-full bg-black/35 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            {isStopped ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
        </div>
      )}

      {/* Anúncio de troca de slide para leitores de tela. */}
      <div aria-live="polite" aria-atomic className="sr-only">
        {`Banner ${currentIndex + 1} de ${total}`}
      </div>
    </section>
  )
}
