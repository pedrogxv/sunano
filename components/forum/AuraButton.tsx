"use client"

import { useState, type CSSProperties } from "react"
import { Flame, Snowflake } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type ParticleStyle = CSSProperties & {
  "--aura-particle-x"?: string
  "--aura-particle-y"?: string
  "--aura-particle-size"?: string
  "--aura-particle-color"?: string
}

export type Reaction = "like" | "dislike" | null

/** Próxima reação após clicar em `kind`: alterna pra null se já era essa, senão vira `kind`. */
export function nextReaction(current: Reaction, kind: "like" | "dislike"): Reaction {
  return current === kind ? null : kind
}

/**
 * Efeito líquido no `aura_count`/saldo do autor ao trocar `current` por
 * `kind` — espelha exatamente a lógica de `toggle_forum_aura`
 * (20260804_aura_rebalance.sql): dar/tirar vale 1, trocar like<->dislike
 * vale 2 (as duas pernas de uma vez). Usado pra atualização otimista antes
 * da resposta da API.
 */
export function nextReactionDelta(current: Reaction, kind: "like" | "dislike"): number {
  if (current === kind) return kind === "like" ? -1 : 1
  if (current === null) return kind === "like" ? 1 : -1
  return kind === "like" ? 2 : -2
}

const PARTICLE_COUNT = 8
// Tons de fogo (like) e de gelo (dislike) — mesma técnica, cores opostas.
const LIKE_PARTICLE_COLORS = ["oklch(0.7 0.2 40)", "oklch(0.75 0.19 55)", "oklch(0.63 0.24 25)"]
const DISLIKE_PARTICLE_COLORS = ["oklch(0.65 0.18 235)", "oklch(0.72 0.14 220)", "oklch(0.58 0.2 250)"]

/** Um dos dois lados do reagir (flame = like, snowflake = dislike). */
function ReactionIcon({
  kind,
  active,
  disabled,
  iconSize,
  particleDistance,
  onClick,
}: {
  kind: "like" | "dislike"
  active: boolean
  disabled: boolean
  iconSize: string
  particleDistance: number
  onClick: () => void
}) {
  const [bursting, setBursting] = useState(false)
  const Icon = kind === "like" ? Flame : Snowflake
  const colors = kind === "like" ? LIKE_PARTICLE_COLORS : DISLIKE_PARTICLE_COLORS
  const floatLabel = kind === "like" ? "+1" : "-1"
  const activeClass = kind === "like" ? "text-primary" : "text-sky-400"

  function handleClick(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    if (!active) {
      setBursting(true)
      setTimeout(() => setBursting(false), 650)
    }
    onClick()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={active}
      className={`relative flex items-center justify-center rounded-full p-1 transition-colors ${
        active ? activeClass : "text-muted-foreground hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span
        className="aura-icon-holder relative flex items-center justify-center"
        data-given={kind === "like" && active}
        data-disliked={kind === "dislike" && active}
        data-burst={bursting}
      >
        <span className="aura-ring" style={{ "--aura-ring-color": colors[0] } as CSSProperties} aria-hidden />
        {bursting && (
          <span className={kind === "like" ? "aura-plus-ten" : "aura-minus-one"} aria-hidden>
            {floatLabel}
          </span>
        )}
        <Icon className={`aura-icon relative ${iconSize}`} fill={active ? "currentColor" : "none"} strokeWidth={active ? 1.5 : 2} />
        {bursting &&
          Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
            const angle = (i / PARTICLE_COUNT) * Math.PI * 2
            const jitter = ((i * 37) % 10) / 10 - 0.5 // variação determinística, sem Math.random em render
            const style: ParticleStyle = {
              "--aura-particle-x": `${Math.cos(angle) * (particleDistance + jitter * 6)}px`,
              "--aura-particle-y": `${Math.sin(angle) * (particleDistance + jitter * 6)}px`,
              "--aura-particle-size": `${3 + (i % 3)}px`,
              "--aura-particle-color": colors[i % colors.length],
              animationDelay: `${i * 18}ms`,
            }
            return <span key={i} className="aura-particle" style={style} />
          })}
      </span>
    </button>
  )
}

/**
 * Par de botões like/dislike (mutuamente exclusivos) de um post ou
 * comentário. `orientation="vertical"` empilha flame / contador / snowflake
 * (coluna de voto, estilo Reddit) e é o padrão para posts;
 * `orientation="horizontal"` (flame, contador, snowflake lado a lado) é
 * usada nos comentários, onde não há coluna lateral.
 *
 * O contador no meio é o placar líquido do alvo (likes − dislikes,
 * `toggle_forum_aura`) — pode ficar negativo se houver mais dislikes que
 * likes. Dar like credita +1 de aura ao autor; dislike, -1; trocar de um
 * para o outro aplica os dois de uma vez.
 */
export function AuraButton({
  auraCount,
  reaction,
  disabled,
  onReact,
  orientation = "horizontal",
}: {
  auraCount: number
  reaction: Reaction
  disabled: boolean
  onReact: (kind: "like" | "dislike") => void
  orientation?: "vertical" | "horizontal"
}) {
  const [bumping, setBumping] = useState(false)

  function handleReact(kind: "like" | "dislike") {
    setBumping(true)
    setTimeout(() => setBumping(false), 500)
    onReact(kind)
  }

  const iconSize = orientation === "vertical" ? "size-5" : "size-3.5"
  const particleDistance = orientation === "vertical" ? 22 : 15

  const tooltipText = disabled
    ? "Entre na sua conta para reagir — like concede +1 de aura, dislike tira -1"
    : reaction === "like"
      ? "Você curtiu isso (+1 de aura pro autor) — toque de novo pra desfazer"
      : reaction === "dislike"
        ? "Você descurtiu isso (-1 de aura pro autor) — toque de novo pra desfazer"
        : "Curtir dá +1 de aura ao autor, descurtir tira -1"

  const count = (
    <span
      className="aura-count text-xs font-bold tabular-nums leading-none text-foreground"
      data-bump={bumping}
    >
      {auraCount}
    </span>
  )

  const iconProps = (kind: "like" | "dislike") => ({
    kind,
    active: reaction === kind,
    disabled,
    iconSize,
    particleDistance,
    onClick: () => handleReact(kind),
  })

  const button =
    orientation === "vertical" ? (
      <div className="flex w-10 shrink-0 flex-col items-center gap-0.5">
        <ReactionIcon {...iconProps("like")} />
        {count}
        <ReactionIcon {...iconProps("dislike")} />
      </div>
    ) : (
      <div className="flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5">
        <ReactionIcon {...iconProps("like")} />
        {count}
        <ReactionIcon {...iconProps("dislike")} />
      </div>
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
