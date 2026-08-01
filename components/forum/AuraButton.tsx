"use client"

import { useState, type CSSProperties } from "react"
import { Flame } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type ParticleStyle = CSSProperties & {
  "--aura-particle-x"?: string
  "--aura-particle-y"?: string
  "--aura-particle-size"?: string
  "--aura-particle-color"?: string
}

const PARTICLE_COUNT = 8
// Tons de fogo (vermelho/laranja/âmbar), pra explosão não ficar monocromática.
const PARTICLE_COLORS = ["oklch(0.7 0.2 40)", "oklch(0.75 0.19 55)", "oklch(0.63 0.24 25)"]

/**
 * Botão de dar/remover Aura (like único, sem downvote) de um post ou
 * comentário. `orientation="vertical"` reproduz a antiga coluna de voto —
 * ícone em cima, contador embaixo, lateralizado à esquerda do card — e é o
 * padrão para posts; `orientation="horizontal"` (ícone + contador lado a
 * lado) é usada nos comentários, onde não há coluna lateral.
 *
 * Um tooltip explica a ação (e o que ela custa/rende) e, ao dar aura, um
 * "+10" sobe e desaparece por cima do ícone — reforço visual de que a aura
 * dada vale +10 pontos para o autor (toggle_forum_aura, 20260806_forum_aura.sql).
 */
export function AuraButton({
  auraCount,
  given,
  disabled,
  onToggle,
  orientation = "horizontal",
}: {
  auraCount: number
  given: boolean
  disabled: boolean
  onToggle: () => void
  orientation?: "vertical" | "horizontal"
}) {
  const [bursting, setBursting] = useState(false)

  function handleClick(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    if (!given) {
      setBursting(true)
      setTimeout(() => setBursting(false), 650)
    }
    onToggle()
  }

  const iconSize = orientation === "vertical" ? "size-5" : "size-3.5"
  const particleDistance = orientation === "vertical" ? 22 : 15

  const tooltipText = disabled
    ? "Entre na sua conta para dar aura e conceder +10 de aura ao autor"
    : given
      ? "Você deu aura nisso — toque para remover (o autor perde os +10 de aura)"
      : "Dar aura: o \"like\" do fórum. Cada aura concede +10 de aura ao autor, trocável por medalhas e itens"

  const icon = (
    <span
      className="aura-icon-holder relative flex items-center justify-center"
      data-given={given}
      data-burst={bursting}
    >
      <span className="aura-ring" aria-hidden />
      {bursting && (
        <span className="aura-plus-ten" aria-hidden>
          +10
        </span>
      )}
      <Flame
        className={`aura-icon relative ${iconSize}`}
        fill={given ? "currentColor" : "none"}
        strokeWidth={given ? 1.5 : 2}
      />
      {bursting &&
        Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
          const angle = (i / PARTICLE_COUNT) * Math.PI * 2
          const jitter = ((i * 37) % 10) / 10 - 0.5 // variação determinística, sem Math.random em render
          const style: ParticleStyle = {
            "--aura-particle-x": `${Math.cos(angle) * (particleDistance + jitter * 6)}px`,
            "--aura-particle-y": `${Math.sin(angle) * (particleDistance + jitter * 6)}px`,
            "--aura-particle-size": `${3 + (i % 3)}px`,
            "--aura-particle-color": PARTICLE_COLORS[i % PARTICLE_COLORS.length],
            animationDelay: `${i * 18}ms`,
          }
          return <span key={i} className="aura-particle" style={style} />
        })}
    </span>
  )

  const button =
    orientation === "vertical" ? (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={given}
        className={`flex w-10 shrink-0 flex-col items-center gap-1 rounded-xl py-1.5 transition-colors ${
          given ? "text-primary" : "text-muted-foreground hover:text-primary hover:bg-primary/5"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {icon}
        <span
          className="aura-count text-xs font-bold tabular-nums leading-none"
          data-bump={bursting}
        >
          {auraCount}
        </span>
      </button>
    ) : (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={given}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
          given
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {icon}
        <span className="aura-count tabular-nums" data-bump={bursting}>
          {auraCount}
        </span>
      </button>
    )

  return (
    <Tooltip>
      {/* O <span> por fora do botão (que pode estar disabled) garante que o
          hover ainda dispare o tooltip — botões nativos disabled não
          recebem eventos de ponteiro de forma confiável em todo browser. */}
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent side={orientation === "vertical" ? "right" : "top"} className="max-w-56 text-center">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  )
}
