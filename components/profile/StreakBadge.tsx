import { Bird } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Selo da Ofensiva — pássaro brilhante + dias consecutivos completando as
 * missões diárias (ver `lib/achievements.ts` / `daily_missions`). O brilho
 * (glow) só aparece com ofensiva ativa (`days > 0`); ofensiva zerada mostra
 * o pássaro apagado, sem número, como convite a recomeçar.
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
  className,
}: {
  days: number
  size?: "sm" | "md"
  showInactive?: boolean
  className?: string
}) {
  const active = days > 0

  if (size === "sm") {
    if (!active && !showInactive) return null
    return (
      <span
        title={active ? `${days} dia${days === 1 ? "" : "s"} de ofensiva` : "Complete as missões diárias para começar uma ofensiva"}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
          active ? "bg-amber-400/15 text-amber-400" : "bg-muted/40 text-muted-foreground",
          className
        )}
      >
        <Bird className={cn("size-2.5", active && "drop-shadow-[0_0_3px_rgba(251,191,36,0.8)]")} />
        {active ? days : "Sem ofensiva"}
      </span>
    )
  }

  return (
    <div
      title={active ? `${days} dia${days === 1 ? "" : "s"} de ofensiva` : "Complete as missões diárias para começar uma ofensiva"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium",
        active
          ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
          : "border-border bg-card/60 text-muted-foreground",
        className
      )}
    >
      <Bird
        className={cn("size-4", active && "drop-shadow-[0_0_5px_rgba(251,191,36,0.9)]")}
      />
      <span>{active ? `${days} dia${days === 1 ? "" : "s"}` : "Sem ofensiva"}</span>
    </div>
  )
}
