import { Bird, Snowflake } from "lucide-react"

import { formatStreakMultiplier, streakHeatTier, STREAK_HEAT_STYLES } from "@/lib/streak-multiplier"
import { cn } from "@/lib/utils"

/**
 * Selo da Ofensiva — pássaro brilhante + dias consecutivos completando as
 * missões diárias (ver `lib/achievements.ts` / `daily_missions`). O brilho
 * (glow) só aparece com ofensiva ativa (`days > 0`); ofensiva zerada mostra
 * o pássaro apagado, sem número, como convite a recomeçar.
 *
 * A cor sobe de âmbar para vermelho conforme a ofensiva cresce (ver
 * `streakHeatTier`/`STREAK_HEAT_STYLES` em `lib/streak-multiplier.ts`) — o
 * mesmo eixo que define o bônus de Aura da ofensiva, então quanto mais
 * "quente" a cor, maior o multiplicador.
 *
 * `frozen`: a ofensiva só está de pé porque uma "Proteção de Ofensiva"
 * guardada (escudo, ver `user_streak_shields`) está cobrindo um dia
 * perdido. Nesse caso o ícone vira um floco azul-gelo, sem glow quente, e o
 * tooltip explica a proteção — minimalista, sem banner fixo em lugar
 * nenhum. `frozenUntil` é o prazo para completar as missões e resgatar.
 *
 * `size="sm"` é a versão inline usada ao lado do nome do autor em
 * comentários, no mini-perfil e na linha de badges do perfil completo — sem
 * label, só ícone + número. Por padrão some quando zerada (`days === 0`),
 * já que numa lista de comentários toda ofensiva-zero de todo mundo viraria
 * ruído; `showInactive` liga o estado "Sem ofensiva" apagado para os lugares
 * onde a ausência é ela mesma uma informação (ex: o próprio cabeçalho do
 * perfil, onde a badge sempre aparece nesse eixo de nome/tier/rank).
 */
export function StreakBadge({
  days,
  size = "md",
  showInactive = false,
  frozen = false,
  frozenUntil = null,
  className,
}: {
  days: number
  size?: "sm" | "md"
  showInactive?: boolean
  /** Ofensiva sustentada por um escudo ("Proteção de Ofensiva") hoje. */
  frozen?: boolean
  /** Prazo (YYYY-MM-DD) para completar as missões e resgatar, para o tooltip. */
  frozenUntil?: string | null
  className?: string
}) {
  const active = days > 0
  const isFrozen = active && frozen
  const heat = STREAK_HEAT_STYLES[streakHeatTier(days)]

  const frozenUntilLabel = frozenUntil
    ? new Date(`${frozenUntil}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : null

  const title = isFrozen
    ? `Ofensiva protegida por um escudo${frozenUntilLabel ? ` — complete as missões até ${frozenUntilLabel} para não perder os ${days} dia${days === 1 ? "" : "s"}` : ` — você não perde os ${days} dia${days === 1 ? "" : "s"}`}`
    : active
      ? `${days} dia${days === 1 ? "" : "s"} de ofensiva — +${formatStreakMultiplier(days)} de Aura`
      : "Complete as missões diárias para começar uma ofensiva"

  if (size === "sm") {
    if (!active && !showInactive) return null
    return (
      <span
        title={title}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
          isFrozen
            ? "bg-sky-400/10 text-sky-300"
            : active
              ? cn(heat.bg, heat.text)
              : "bg-muted/40 text-muted-foreground",
          className
        )}
      >
        {isFrozen ? (
          <Snowflake className="size-2.5" />
        ) : (
          <Bird className={cn("size-2.5", active && heat.glow)} />
        )}
        {active ? days : "Sem ofensiva"}
      </span>
    )
  }

  return (
    <div
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium",
        isFrozen
          ? "border-sky-400/40 bg-sky-400/10 text-sky-300"
          : active
            ? cn(heat.border, heat.bg, heat.text)
            : "border-border bg-card/60 text-muted-foreground",
        className
      )}
    >
      {isFrozen ? (
        <Snowflake className="size-4" />
      ) : (
        <Bird className={cn("size-4", active && heat.glow)} />
      )}
      <span>{active ? `${days} dia${days === 1 ? "" : "s"}` : "Sem ofensiva"}</span>
      {active && !isFrozen && <span className="opacity-70">· +{formatStreakMultiplier(days)}</span>}
      {isFrozen && <span className="opacity-70">· congelada</span>}
    </div>
  )
}
