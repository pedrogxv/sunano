"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  X,
  ZoomIn,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FrozenFrame } from "@/components/ui/image-with-fallback"
import { cn } from "@/lib/utils"

/** Uma imagem dentro do visualizador. */
export interface MediaViewerItem {
  src: string
  /** Texto acessível — vira o `alt` e o título do modal. */
  alt: string
  /**
   * Rótulo curto opcional. Com poucos itens **nomeados** (capa/foto do perfil)
   * ele vira aba de texto; sem rótulo, a navegação usa miniaturas.
   */
  label?: string
  /** Pula a otimização do storage — necessário para GIF animado não perder quadros. */
  unoptimized?: boolean
  /**
   * Mostra só o primeiro quadro num `<canvas>` em vez do GIF animado (ver
   * `needsFreeze` em `resolveProfileMedia`, `lib/account-tier.ts`).
   */
  freeze?: boolean
}

/** Passos de zoom. 1 = imagem inteira na tela; o resto amplia a partir dela. */
const ZOOM_STEPS = [1, 1.5, 2, 3, 4] as const
const MIN_ZOOM = ZOOM_STEPS[0]
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1]

/**
 * Quanto a imagem pode se deslocar ao arrastar, por unidade de zoom. Fixo em
 * px (como já era na galeria de periféricos) em vez de medir o elemento: o
 * suficiente para alcançar qualquer canto sem a imagem escapar da tela.
 */
const PAN_LIMIT_PER_ZOOM = 260

/** Acima disso a navegação vira miniatura em vez de aba de texto. */
const MAX_TEXT_TABS = 3

interface MediaViewerProps {
  items: MediaViewerItem[]
  /** Índice aberto ao acionar este gatilho (ou ao abrir de forma controlada). */
  index?: number
  /**
   * Modo gatilho: envolve o elemento clicável (a própria miniatura). Sem
   * `children`, o visualizador é controlado por `open`/`onOpenChange` — para
   * quem já desenha a própria miniatura/carrossel e só quer o modal.
   */
  children?: React.ReactNode
  triggerClassName?: string
  /** Onde a lupa aparece no hover do gatilho. */
  hintPosition?: "center" | "corner" | "none"
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Visualizador de imagem em tela cheia — a base compartilhada por perfil,
 * fórum, periféricos e loja.
 *
 * Antes existiam quatro implementações independentes com comportamentos
 * diferentes: o perfil não tinha zoom nenhum, o fórum tinha zoom fixo 2× sem
 * arraste, e loja/periféricos tinham 2,5× com arraste — cada um com seu
 * próprio enquadramento, seus próprios controles e seu próprio jeito de
 * fechar. Aqui todos passam a compartilhar:
 *
 * - **Palco de tela cheia** com a imagem sempre contida e centralizada, para
 *   que proporções diferentes (capa deitada, foto quadrada, print de post)
 *   dividam a mesma moldura.
 * - **Zoom em passos** (1× → 4×) com arraste livre, roda do mouse, duplo
 *   clique e barra de controles sempre visível.
 * - **Navegação** entre imagens por setas, teclado e miniaturas — ou por abas
 *   de texto quando os itens têm nome (o caso capa/foto do perfil).
 *
 * O arraste só conta como clique quando o ponteiro praticamente não andou
 * (4px de folga), senão soltar o botão depois de reposicionar a imagem
 * alternava o zoom sem querer.
 */
export function MediaViewer({
  items,
  index = 0,
  children,
  triggerClassName,
  hintPosition = "corner",
  open: openProp,
  onOpenChange,
}: MediaViewerProps) {
  const [openState, setOpenState] = useState(false)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : openState

  const [active, setActive] = useState(index)
  const [zoom, setZoom] = useState<number>(MIN_ZOOM)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [loaded, setLoaded] = useState(false)
  const [dragging, setDragging] = useState(false)

  const dragRef = useRef<{
    startX: number
    startY: number
    panX: number
    panY: number
    moved: boolean
  } | null>(null)

  /**
   * Quem controla de fora pode trocar o índice com o modal já aberto (clicar
   * noutra miniatura da galeria da loja). Ajustar durante a renderização é o
   * padrão recomendado do React para isso — um `useEffect` aqui renderizaria
   * a imagem antiga por um quadro antes de corrigir.
   */
  const [syncedIndex, setSyncedIndex] = useState(index)
  if (open && index !== syncedIndex) {
    setSyncedIndex(index)
    setActive(index)
    setLoaded(false)
    setZoom(MIN_ZOOM)
    setPan({ x: 0, y: 0 })
  }

  // Defensivo: a saída antecipada para lista vazia só pode vir depois dos
  // hooks, então nada acima dela pode assumir que há item — nem que `items`
  // chegou (um chamador desatualizado derrubaria a página no error boundary).
  const list = items ?? []
  const item: MediaViewerItem | undefined = list[active] ?? list[0]
  const hasMultiple = list.length > 1
  const zoomed = zoom > MIN_ZOOM
  // Abas de texto só quando **todos** têm nome e são poucos; caso contrário a
  // navegação é por miniatura, que é o que faz sentido num álbum de post.
  const useTextTabs =
    hasMultiple && list.length <= MAX_TEXT_TABS && list.every((entry) => Boolean(entry.label))

  const resetView = useCallback(() => {
    setZoom(MIN_ZOOM)
    setPan({ x: 0, y: 0 })
  }, [])

  /** Mantém o arraste dentro de um limite proporcional ao zoom atual. */
  const clampPan = useCallback((x: number, y: number, scale: number) => {
    const limit = PAN_LIMIT_PER_ZOOM * (scale - 1)
    return {
      x: Math.min(limit, Math.max(-limit, x)),
      y: Math.min(limit, Math.max(-limit, y)),
    }
  }, [])

  /** Aplica um zoom novo já reajustando o deslocamento ao limite dele. */
  const applyZoom = useCallback(
    (next: number) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
      setZoom(clamped)
      setPan((current) =>
        clamped === MIN_ZOOM ? { x: 0, y: 0 } : clampPan(current.x, current.y, clamped)
      )
    },
    [clampPan]
  )

  /** Próximo/anterior degrau da escala — os botões +/− andam de passo em passo. */
  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      const ordered = direction === 1 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse()
      const next = ordered.find((step) => (direction === 1 ? step > zoom : step < zoom))
      applyZoom(next ?? zoom)
    },
    [applyZoom, zoom]
  )

  const showItem = useCallback(
    (nextIndex: number) => {
      if (list.length === 0) return
      setActive((nextIndex + list.length) % list.length)
      setLoaded(false)
      resetView()
    },
    [list.length, resetView]
  )

  /**
   * Abrir é um evento, não uma sincronização: reabrir por outro gatilho tem
   * que mostrar a imagem *daquele* gatilho, não a que ficou selecionada na vez
   * anterior — e zerar zoom/arraste junto.
   */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!isControlled) setOpenState(next)
      onOpenChange?.(next)
      if (next) {
        setSyncedIndex(index)
        setActive(index)
        setLoaded(false)
        resetView()
      }
    },
    [isControlled, onOpenChange, index, resetView]
  )

  // Teclado: setas trocam de imagem, +/−/0 controlam o zoom. Esc é do Radix.
  // Fica no `window` porque o foco pode estar em qualquer botão da barra.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight" && hasMultiple) {
        event.preventDefault()
        showItem(active + 1)
      } else if (event.key === "ArrowLeft" && hasMultiple) {
        event.preventDefault()
        showItem(active - 1)
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault()
        stepZoom(1)
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault()
        stepZoom(-1)
      } else if (event.key === "0") {
        event.preventDefault()
        resetView()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, active, hasMultiple, showItem, stepZoom, resetView])

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!zoomed) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    }
    setDragging(true)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!zoomed || !drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true
    setPan(clampPan(drag.panX + dx, drag.panY + dy, zoom))
  }

  function handlePointerUp() {
    setDragging(false)
    // Zera no próximo tique para o clique que encerra o arraste ainda enxergar
    // `moved` e não tratar o reposicionamento como toggle de zoom.
    if (dragRef.current?.moved) {
      window.setTimeout(() => {
        dragRef.current = null
      }, 0)
    } else {
      dragRef.current = null
    }
  }

  /** Clique na imagem: entra no zoom, ou volta pro tamanho inteiro. */
  function toggleZoom() {
    if (dragRef.current?.moved) return
    if (zoomed) resetView()
    else applyZoom(2)
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    // Sem `preventDefault`: o listener do React é passivo. Como o palco não
    // rola, basta não deixar o evento subir para a página.
    event.stopPropagation()
    applyZoom(zoom + (event.deltaY < 0 ? 0.5 : -0.5))
  }

  if (!item) return <>{children}</>

  const media = item.freeze ? (
    <FrozenFrame
      key={item.src}
      src={item.src}
      alt={item.alt}
      onError={() => setLoaded(true)}
      className="max-h-[74vh] max-w-[min(1400px,92vw)] rounded-lg object-contain shadow-2xl"
    />
  ) : (
    <Image
      key={item.src}
      src={item.src}
      alt={item.alt}
      width={1600}
      height={1600}
      unoptimized={item.unoptimized}
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
      className={cn(
        "h-auto max-h-[74vh] w-auto max-w-[min(1400px,92vw)] rounded-lg object-contain shadow-2xl transition-opacity duration-200",
        loaded ? "opacity-100" : "opacity-0"
      )}
    />
  )

  const viewer = (
    <DialogPortal>
      <DialogOverlay className="bg-black/90 supports-backdrop-filter:backdrop-blur-sm" />
      {/* O palco ocupa a tela inteira e não usa o `grid`/`max-w` do
          DialogContent padrão: é o que faz imagens de proporções diferentes
          compartilharem a mesma moldura. */}
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="fixed inset-0 top-0 left-0 flex h-full max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{item.alt}</DialogTitle>

        {/* Cabeçalho: abas nomeadas, ou contador quando é um álbum. */}
        <div className="relative z-20 flex shrink-0 items-center justify-between gap-3 p-3 sm:p-4">
          {useTextTabs ? (
            <div
              role="tablist"
              aria-label="Imagens"
              className="flex items-center gap-1 rounded-full bg-white/10 p-1 backdrop-blur-md"
            >
              {list.map((entry, i) => (
                <button
                  key={entry.src + i}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => showItem(i)}
                  className={cn(
                    "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                    i === active
                      ? "bg-white text-black"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
              {hasMultiple ? `${active + 1} / ${list.length}` : (item.label ?? "Imagem")}
            </span>
          )}

          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            aria-label="Fechar"
            className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Palco. Clicar no vazio ao redor fecha; clicar na imagem alterna o
            zoom — por isso o `stopPropagation` no wrapper da mídia. */}
        <div
          onClick={() => handleOpenChange(false)}
          onWheel={handleWheel}
          className="relative flex min-h-0 flex-1 cursor-zoom-out items-center justify-center overflow-hidden px-3 sm:px-6"
        >
          <div
            onClick={(event) => {
              event.stopPropagation()
              toggleZoom()
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              applyZoom(zoomed ? MIN_ZOOM : MAX_ZOOM)
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              // Sem transição durante o arraste: interpolar cada quadro do
              // ponteiro faz a imagem "escorrer" atrás do cursor.
              transition: dragging ? "none" : "transform 200ms ease-out",
            }}
            className={cn(
              "touch-none select-none",
              zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
            )}
          >
            {media}
          </div>

          {!loaded && !item.freeze && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="size-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            </span>
          )}

          {hasMultiple && (
            <>
              <StageArrow side="left" onClick={() => showItem(active - 1)} />
              <StageArrow side="right" onClick={() => showItem(active + 1)} />
            </>
          )}
        </div>

        {/* Rodapé: miniaturas (álbum) + barra de controles. */}
        <div className="relative z-20 flex shrink-0 flex-col items-center gap-2 p-3 sm:p-4">
          {hasMultiple && !useTextTabs && (
            <div className="flex max-w-full gap-2 overflow-x-auto rounded-2xl bg-white/10 p-2 backdrop-blur-md">
              {list.map((entry, i) => (
                <button
                  key={entry.src + i}
                  type="button"
                  onClick={() => showItem(i)}
                  aria-label={`Ver imagem ${i + 1}`}
                  aria-current={i === active}
                  className={cn(
                    "relative size-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-opacity",
                    i === active
                      ? "border-white opacity-100"
                      : "border-transparent opacity-55 hover:opacity-90"
                  )}
                >
                  <Image
                    src={entry.src}
                    alt=""
                    fill
                    unoptimized={entry.unoptimized}
                    sizes="56px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 rounded-full bg-white/10 p-1 text-white backdrop-blur-md">
            <ControlButton
              onClick={() => stepZoom(-1)}
              disabled={zoom <= MIN_ZOOM}
              label="Diminuir zoom"
            >
              <Minus className="size-4" />
            </ControlButton>

            <span className="min-w-14 text-center text-xs font-semibold tabular-nums">
              {Math.round(zoom * 100)}%
            </span>

            <ControlButton
              onClick={() => stepZoom(1)}
              disabled={zoom >= MAX_ZOOM}
              label="Aumentar zoom"
            >
              <Plus className="size-4" />
            </ControlButton>

            <span className="mx-1 h-5 w-px bg-white/20" aria-hidden />

            <ControlButton
              onClick={resetView}
              disabled={!zoomed && pan.x === 0 && pan.y === 0}
              label="Restaurar tamanho"
            >
              <RotateCcw className="size-4" />
            </ControlButton>

            <ControlButton onClick={() => applyZoom(MAX_ZOOM)} label="Zoom máximo">
              <Maximize2 className="size-4" />
            </ControlButton>

            <a
              href={item.src}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir imagem original"
              title="Abrir imagem original"
              className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/20"
            >
              <Download className="size-4" />
            </a>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  )

  // Modo controlado: quem chamou já desenha a própria miniatura.
  if (!children) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {viewer}
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn("group/lightbox block cursor-zoom-in", triggerClassName)}
          aria-label={`Ampliar ${item.alt}`}
        >
          <span className="relative block">
            {children}
            {/* Affordance: sem isso nada indica que a imagem abre. Só no hover
                para não poluir a página em repouso, e `pointer-events-none`
                para o clique continuar sendo do botão inteiro. */}
            {hintPosition !== "none" && (
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute z-20 flex size-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-150 group-hover/lightbox:opacity-100 group-focus-visible/lightbox:opacity-100",
                  hintPosition === "corner"
                    ? "right-3 bottom-3"
                    : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                )}
              >
                <ZoomIn className="size-4" />
              </span>
            )}
          </span>
        </button>
      </DialogTrigger>
      {viewer}
    </Dialog>
  )
}

/** Seta de navegação do palco — some no hover do vazio, sempre clicável. */
function StageArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      aria-label={side === "left" ? "Imagem anterior" : "Próxima imagem"}
      className={cn(
        "absolute top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/25",
        side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4"
      )}
    >
      <Icon className="size-6" />
    </button>
  )
}

/** Botão redondo da barra de controles — só para não repetir as classes. */
function ControlButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
