"use client"

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import Image from "next/image"

import { SPEED_CHART_THUMB, SpeedChartPlane, SpeedChartThumb, speedChartPosition } from "@/components/tierlist/SpeedChartPlane"
import { formatSpeedChartValue, readSpeedChartPoint, type SpeedChartPoint } from "@/lib/speed-chart"
import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"

interface EditorItem {
  id: string
  name: string
  brand: string
  image_url: string | null
  specs: Record<string, unknown>
}

type Drag = {
  id: string
  originX: number
  originY: number
  x: number
  y: number
  moved: boolean
  /** Onde o item cai se soltar agora; `null` fora do plano. */
  point: SpeedChartPoint | null
  overTray: boolean
}

// Abaixo disso é clique, não arrastada: sem o limiar, encostar numa foto já a regravava.
const DRAG_THRESHOLD_PX = 4

const IMAGE_BG = { background: "var(--card-image-bg)" }

function within(rect: DOMRect | undefined, x: number, y: number) {
  return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/**
 * Editor da aba "Velocidade" do board: arrastar a foto da bandeja para o plano
 * posiciona, arrastar dentro do plano move, soltar de volta na bandeja tira do
 * gráfico. Desenha pelo mesmo `SpeedChartPlane` da tierlist pública, então a
 * sobreposição que o admin monta aqui é a que o público vê.
 *
 * Pointer events em vez do dnd-kit do resto do board: aqui o que importa é a
 * coordenada exata onde a foto foi solta, não em qual zona ela caiu. O move e o
 * soltar são ouvidos na JANELA, não no elemento: com o handler no elemento,
 * perder a captura do ponteiro no meio da arrastada deixava o soltar cair em
 * outro nó, e a foto ficava presa na prévia sem salvar.
 */
export function SpeedChartEditor({
  items,
  onPlace,
}: {
  items: EditorItem[]
  onPlace: (id: string, point: SpeedChartPoint | null) => void
}) {
  const planeRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)
  // Espelho do estado para os handlers lerem o valor atual sem esperar o re-render.
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // Remove os listeners da janela; chamado ao soltar e ao desmontar no meio da arrastada.
  const stopListeningRef = useRef<(() => void) | null>(null)

  useEffect(() => () => stopListeningRef.current?.(), [])

  const { placed, unplaced } = useMemo(() => {
    const placed: { item: EditorItem; point: SpeedChartPoint }[] = []
    const unplaced: EditorItem[] = []
    for (const item of items) {
      const point = readSpeedChartPoint(item.specs)
      if (point) placed.push({ item, point })
      else unplaced.push(item)
    }
    placed.sort((a, b) => a.item.name.localeCompare(b.item.name))
    unplaced.sort((a, b) => a.name.localeCompare(b.name))
    return { placed, unplaced }
  }, [items])

  const placedIds = useMemo(() => new Set(placed.map(({ item }) => item.id)), [placed])

  function updateDrag(next: Drag | null) {
    dragRef.current = next
    setDrag(next)
  }

  // Soltar na margem do card (fora da área útil) ainda conta: o ponto é preso a 0–100.
  function locate(x: number, y: number) {
    const plot = plotRef.current?.getBoundingClientRect()
    const inPlane = within(planeRef.current?.getBoundingClientRect(), x, y)
    const point =
      inPlane && plot
        ? {
            speed: Math.min(100, Math.max(0, ((x - plot.left) / plot.width) * 100)),
            texture: Math.min(100, Math.max(0, 100 - ((y - plot.top) / plot.height) * 100)),
          }
        : null
    return { point, overTray: within(trayRef.current?.getBoundingClientRect(), x, y) }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>, id: string) {
    if (event.button !== 0 || dragRef.current) return
    event.preventDefault()
    const pointerId = event.pointerId
    updateDrag({
      id,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      point: null,
      overTray: false,
    })

    const handleMove = (moveEvent: PointerEvent) => {
      const current = dragRef.current
      if (!current || moveEvent.pointerId !== pointerId) return
      const moved =
        current.moved ||
        Math.hypot(moveEvent.clientX - current.originX, moveEvent.clientY - current.originY) > DRAG_THRESHOLD_PX
      updateDrag({
        ...current,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
        moved,
        ...locate(moveEvent.clientX, moveEvent.clientY),
      })
    }

    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return
      const current = dragRef.current
      stopListening()
      if (!current?.moved) return
      const { point, overTray } = locate(upEvent.clientX, upEvent.clientY)
      if (point) onPlace(current.id, point)
      else if (overTray && placedIds.has(current.id)) onPlace(current.id, null)
    }

    const handleCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) stopListening()
    }

    function stopListening() {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
      window.removeEventListener("pointercancel", handleCancel)
      stopListeningRef.current = null
      updateDrag(null)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    window.addEventListener("pointercancel", handleCancel)
    stopListeningRef.current = stopListening
  }

  const dragHandlers = (id: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => handlePointerDown(event, id),
  })

  const draggingId = drag?.moved ? drag.id : null
  const draggedItem = draggingId ? items.find((item) => item.id === draggingId) ?? null : null
  const removing = draggedItem !== null && placedIds.has(draggedItem.id) && drag?.overTray === true

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Arraste a foto para o ponto do gráfico. A posição salva assim que você solta, e a Tierlist pública
        mostra a aba Velocidade com o que estiver aqui.
      </p>

      <SpeedChartPlane planeRef={planeRef} plotRef={plotRef}>
        {placed.map(({ item, point }) => {
          // A própria foto anda com o cursor dentro do plano. Fora dele (indo para a bandeja),
          // ela fica apagada no lugar salvo e a cópia flutuante segue o cursor.
          const dragging = draggingId === item.id
          const livePoint = dragging && drag?.point ? drag.point : point
          return (
            <div
              key={item.id}
              title={`${item.name} · velocidade ${formatSpeedChartValue(point.speed)} · textura ${formatSpeedChartValue(point.texture)}`}
              style={speedChartPosition(livePoint)}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none overflow-hidden rounded-md border border-border/70 shadow-[0_4px_12px_rgba(0,0,0,0.45)] active:cursor-grabbing",
                "hover:z-20 hover:ring-2 hover:ring-cyan-400",
                SPEED_CHART_THUMB,
                dragging && drag?.point && "z-30 border-2 border-cyan-400 shadow-lg hover:ring-0",
                dragging && !drag?.point && "opacity-30",
              )}
              {...dragHandlers(item.id)}
            >
              <SpeedChartThumb name={item.name} brand={item.brand} imageUrl={item.image_url} />
            </div>
          )
        })}

        {draggedItem && drag?.point && !placedIds.has(draggedItem.id) && (
          <div
            style={speedChartPosition(drag.point)}
            className={cn(
              "pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border-2 border-cyan-400 shadow-lg",
              SPEED_CHART_THUMB,
            )}
          >
            <SpeedChartThumb name={draggedItem.name} brand={draggedItem.brand} imageUrl={draggedItem.image_url} />
          </div>
        )}
      </SpeedChartPlane>

      <div
        ref={trayRef}
        className={cn(
          "overflow-hidden rounded-xl border transition-colors duration-200",
          CARD_SURFACE,
          draggedItem && placedIds.has(draggedItem.id) && "border-amber-500/30",
          removing && "border-amber-400/70 bg-amber-500/10",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Sem posição no gráfico</p>
            <p className="text-xs text-muted-foreground">
              Arraste daqui para o gráfico. Para tirar um item do gráfico, solte-o de volta aqui.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {unplaced.length}
          </span>
        </div>

        {unplaced.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            Todos os periféricos desta lista já estão no gráfico.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 p-3">
            {unplaced.map((item) => (
              <div
                key={item.id}
                title={item.name}
                className={cn(
                  "cursor-grab touch-none select-none overflow-hidden rounded-lg border border-border/60 bg-secondary/50 transition-colors hover:border-cyan-400/60 active:cursor-grabbing",
                  draggingId === item.id && "opacity-30",
                )}
                {...dragHandlers(item.id)}
              >
                <div className="relative h-14" style={IMAGE_BG}>
                  <Thumb item={item} />
                </div>
                <p className="line-clamp-2 px-2 py-1.5 text-[10px] font-semibold leading-tight text-foreground">
                  {item.name}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fora do plano: a foto segue o cursor (dentro dele, a prévia já está no ponto exato). */}
      {draggedItem && drag && !drag.point && (
        <div
          style={{ left: drag.x, top: drag.y, ...IMAGE_BG }}
          className="pointer-events-none fixed z-50 size-14 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border-2 border-cyan-400 shadow-lg"
        >
          <Thumb item={draggedItem} />
        </div>
      )}

      {draggedItem && drag && (drag.point || removing) && (
        <span
          style={{ left: drag.x + 16, top: drag.y + 16 }}
          className="pointer-events-none fixed z-50 rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-semibold text-foreground shadow-lg"
        >
          {drag.point
            ? `Velocidade ${formatSpeedChartValue(drag.point.speed)} · Textura ${formatSpeedChartValue(drag.point.texture)}`
            : "Soltar para tirar do gráfico"}
        </span>
      )}
    </div>
  )
}

function Thumb({ item }: { item: EditorItem }) {
  return item.image_url ? (
    <Image
      alt={item.name}
      src={item.image_url}
      fill
      draggable={false}
      sizes="96px"
      className="pointer-events-none object-contain p-0.5"
    />
  ) : (
    <span className="flex h-full items-center justify-center text-[10px] font-black text-muted-foreground">
      {item.brand.slice(0, 2).toUpperCase()}
    </span>
  )
}
