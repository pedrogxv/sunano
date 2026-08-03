"use client"

import Image from "next/image"
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Move, RotateCcw, ZoomIn } from "lucide-react"

import {
  DEFAULT_ADJUST,
  isDefaultAdjust,
  MAX_ZOOM,
  MIN_ZOOM,
  mediaAdjustStyle,
  type MediaAdjust,
} from "@/lib/profile-media-adjust"
import { cn } from "@/lib/utils"

/**
 * Quanto o arrasto de um pixel move o foco, em pontos percentuais.
 *
 * Fixo, e não derivado do tamanho do quadro: o mesmo gesto precisa render o
 * mesmo tanto no quadro largo do banner e no quadro pequeno da foto, senão
 * arrastar a foto parece "pesado" perto de arrastar o banner.
 */
const DRAG_SENSITIVITY = 0.35

/**
 * Enquadra uma imagem já enviada: arrastar move o foco, o slider aproxima.
 *
 * Não recorta o arquivo — grava só as coordenadas (ver
 * `lib/profile-media-adjust.ts`). É o que mantém o GIF de um membro VIP
 * animando: um recorte de verdade passaria a imagem por um canvas e ela
 * voltaria como um quadro só.
 *
 * O quadro aqui tem a mesma proporção do lugar onde a imagem vai aparecer, e
 * aplica exatamente o mesmo CSS da exibição — o que a pessoa vê arrastando é o
 * resultado final, não uma aproximação.
 */
export function MediaAdjuster({
  src,
  animated,
  value,
  onChange,
  aspect = "banner",
  disabled = false,
}: {
  src: string
  /** GIF de conta com direito a mídia animada — desliga o otimizador. */
  animated: boolean
  value: MediaAdjust
  onChange: (next: MediaAdjust) => void
  /** Formato do quadro, espelhando onde a imagem é exibida. */
  aspect?: "banner" | "mini" | "avatar"
  disabled?: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null)

  const clampPercent = (n: number) => Math.min(100, Math.max(0, n))

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return
      // Captura no próprio elemento: o cursor pode sair do quadro no meio do
      // arrasto sem que o gesto se perca.
      event.currentTarget.setPointerCapture(event.pointerId)
      origin.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        x: value.x,
        y: value.y,
      }
      setDragging(true)
    },
    [disabled, value.x, value.y]
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = origin.current
      if (!start) return
      // Sinal invertido de propósito: arrastar a imagem para a esquerda deve
      // revelar o lado direito dela, que é como o foco precisa andar.
      const dx = (start.pointerX - event.clientX) * DRAG_SENSITIVITY
      const dy = (start.pointerY - event.clientY) * DRAG_SENSITIVITY
      onChange({
        ...value,
        x: Math.round(clampPercent(start.x + dx) * 10) / 10,
        y: Math.round(clampPercent(start.y + dy) * 10) / 10,
      })
    },
    [onChange, value]
  )

  const endDrag = useCallback(() => {
    origin.current = null
    setDragging(false)
  }, [])

  const frame = {
    banner: "aspect-[1024/224] w-full",
    mini: "aspect-[256/96] w-full max-w-64",
    avatar: "aspect-square w-32 rounded-full",
  }[aspect]

  return (
    <div className="space-y-2">
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          "relative select-none overflow-hidden border border-border bg-muted/20",
          aspect === "avatar" ? "rounded-full" : "rounded-xl",
          frame,
          disabled ? "cursor-default opacity-60" : dragging ? "cursor-grabbing" : "cursor-grab"
        )}
      >
        <Image
          src={src}
          alt=""
          fill
          unoptimized={animated}
          sizes="512px"
          draggable={false}
          style={mediaAdjustStyle(value)}
          className="pointer-events-none object-cover"
        />

        {!dragging && !disabled && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-background/70 py-1 text-[10px] font-medium text-muted-foreground">
            <Move className="size-3" />
            Arraste para enquadrar
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <ZoomIn className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.1}
          value={value.zoom}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, zoom: Number(e.target.value) })}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          aria-label="Aproximação da imagem"
        />
        <button
          type="button"
          disabled={disabled || isDefaultAdjust(value)}
          onClick={() => onChange(DEFAULT_ADJUST)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <RotateCcw className="size-3" />
          Centralizar
        </button>
      </div>
    </div>
  )
}
