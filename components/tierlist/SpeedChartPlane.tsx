"use client"

import { Fragment, type ReactNode, type Ref } from "react"
import Image from "next/image"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"

import { speedChartLabel } from "@/lib/speed-chart"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"

/**
 * Plano do gráfico de velocidade × textura: os dois eixos tracejados cruzando
 * no centro e os quatro rótulos. A aba pública (`SpeedChart`) e o editor do
 * admin (`SpeedChartEditor`) desenham por aqui, para o admin posicionar no
 * mesmo plano que o público vê.
 *
 * Os filhos são posicionados em % dentro de `plotRef` (`left` = velocidade,
 * `top` = 100 - textura). A área útil tem margem para dentro do card: um item
 * em 0 ou 100 fica com a foto inteira à vista, sem cortar na borda.
 *
 * Os eixos têm escala de 0 a 10 (`formatSpeedChartValue`), desenhada DENTRO da
 * área útil: é ela que define onde fica cada %, então marca desenhada no card
 * inteiro sairia desalinhada da foto que está naquele valor.
 */
export function SpeedChartPlane({
  children,
  planeRef,
  plotRef,
  className,
}: {
  children: ReactNode
  planeRef?: Ref<HTMLDivElement>
  plotRef?: Ref<HTMLDivElement>
  className?: string
}) {
  const t = useT()
  const labels = t.tierlist.speedChart

  return (
    <div
      ref={planeRef}
      className={cn(
        "relative aspect-[4/5] w-full overflow-hidden rounded-xl border sm:aspect-[16/9]",
        CARD_SURFACE,
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-y-3 left-1/2 border-l-2 border-dashed border-muted-foreground/35" />
      <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t-2 border-dashed border-muted-foreground/35" />
      <ChevronUp className="pointer-events-none absolute left-1/2 top-1 size-4 -translate-x-1/2 text-muted-foreground/60" />
      <ChevronDown className="pointer-events-none absolute bottom-1 left-1/2 size-4 -translate-x-1/2 text-muted-foreground/60" />
      <ChevronLeft className="pointer-events-none absolute left-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
      <ChevronRight className="pointer-events-none absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />

      <div ref={plotRef} className="absolute inset-x-[8%] inset-y-[7%] sm:inset-x-[5%] sm:inset-y-[8%]">
        {/* Número nos pares e só o tracinho nos ímpares: 11 números por eixo poluíam, e o 5
            cairia no cruzamento das linhas. Números acima do eixo X e à esquerda do Y, do lado
            oposto aos rótulos Lento/Rápido e Texturizado/Liso, para não baterem. */}
        {AXIS_TICKS.map((tick) => (
          <Fragment key={tick}>
            <span className={cn(TICK, "top-1/2 h-1.5 w-px")} style={{ left: `${tick * 10}%` }} />
            <span className={cn(TICK, "left-1/2 h-px w-1.5")} style={{ top: `${100 - tick * 10}%` }} />
            {tick % 2 === 0 && (
              <>
                <span className={cn(TICK_LABEL, "top-1/2 -translate-x-1/2 -translate-y-[calc(100%+5px)]")} style={{ left: `${tick * 10}%` }}>
                  {tick}
                </span>
                <span className={cn(TICK_LABEL, "left-1/2 -translate-x-[calc(100%+6px)] -translate-y-1/2")} style={{ top: `${100 - tick * 10}%` }}>
                  {tick}
                </span>
              </>
            )}
          </Fragment>
        ))}
        {children}
      </div>

      {/* Depois da área útil e com fundo: os pads perto da borda cobriam o rótulo. */}
      <span className={cn(AXIS_LABEL, "left-1/2 top-1.5 ml-2.5")}>{labels.textured}</span>
      <span className={cn(AXIS_LABEL, "bottom-1.5 left-1/2 ml-2.5")}>{labels.smooth}</span>
      <span className={cn(AXIS_LABEL, "left-2 top-1/2 mt-1.5")}>{labels.slow}</span>
      <span className={cn(AXIS_LABEL, "right-2 top-1/2 mt-1.5")}>{labels.fast}</span>
    </div>
  )
}

const AXIS_TICKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const TICK = "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 bg-muted-foreground/60"

const TICK_LABEL = "pointer-events-none absolute text-[10px] font-medium tabular-nums leading-none text-muted-foreground"

const AXIS_LABEL =
  "pointer-events-none absolute z-10 rounded bg-background/70 px-1.5 py-0.5 text-xs font-bold text-foreground backdrop-blur-sm sm:text-sm"

/** Posição de um item dentro de `plotRef`, centrado no ponto. */
export function speedChartPosition(point: { speed: number; texture: number }) {
  return { left: `${point.speed}%`, top: `${100 - point.texture}%` }
}

/**
 * Caixa do marcador no plano, com largura relativa à área útil. Público e
 * editor usam a mesma (e o mesmo `SpeedChartThumb`), senão a sobreposição que
 * o admin monta não é a que o público vê.
 */
export const SPEED_CHART_THUMB = "w-[16%] min-w-11 bg-secondary sm:w-[8%]"

/**
 * Corpo do marcador: foto em cima, nome embaixo, como um card da tierlist em
 * miniatura. Sem o nome, só dava para saber qual pad era passando o mouse, e
 * no celular nem isso. A foto de pad é mais larga que alta: num quadrado ela
 * deixava uma faixa vazia embaixo, e é nela que o nome entra, quase sem
 * aumentar o marcador.
 */
export function SpeedChartThumb({ name, brand, imageUrl }: { name: string; brand: string; imageUrl: string | null }) {
  return (
    <>
      <div className="relative aspect-[4/3] w-full" style={{ background: "var(--card-image-bg)" }}>
        {imageUrl ? (
          <Image
            alt={name}
            src={imageUrl}
            fill
            loading="lazy"
            draggable={false}
            sizes="(max-width: 640px) 16vw, 96px"
            className="pointer-events-none object-contain p-0.5"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-[10px] font-black text-muted-foreground">
            {brand.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <p className="line-clamp-3 px-1 py-0.5 text-center text-[8px] font-semibold leading-tight text-foreground sm:text-[9px]">
        {speedChartLabel(name, brand)}
      </p>
    </>
  )
}
