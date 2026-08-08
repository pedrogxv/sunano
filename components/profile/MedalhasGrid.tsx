"use client"

import Image from "next/image"
import { Award } from "lucide-react"

import { MEDAL_RARITY_SOLID, MEDAL_RARITY_STYLES, type ShowcaseMedal } from "@/lib/profile-showcase"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface MedalhasGridProps {
  /** Já filtradas: só as conquistadas e selecionadas pelo usuário (ver `selectVisibleMedals`). */
  medals: ShowcaseMedal[]
  /** Repassado ao container das medalhas — usado para centralizar na versão empilhada de celular. */
  className?: string
}

/**
 * Grid de medalhas. Mostra só o que o usuário selecionou para o perfil — sem
 * slots vazios nem indicador de medalhas ocultas ou não selecionadas, então
 * a seção some sempre que não há nenhuma medalha para exibir.
 */
export function MedalhasGrid({ medals, className }: MedalhasGridProps) {
  if (medals.length === 0) return null

  return (
    <section>
      <div className={cn("flex flex-wrap gap-4", className)}>
        {medals.map((medal) => (
          <Tooltip key={medal.id}>
            <TooltipTrigger asChild>
              <div
                style={{ "--glow-color": MEDAL_RARITY_SOLID[medal.rarity] } as React.CSSProperties}
                className={cn(
                  "event-card-glow relative flex size-16 shrink-0 items-center justify-center rounded-xl border transition-transform hover:-translate-y-0.5",
                  MEDAL_RARITY_STYLES[medal.rarity]
                )}
              >
                {medal.icon_url ? (
                  <Image
                    src={medal.icon_url}
                    alt={medal.name}
                    width={40}
                    height={40}
                    className="size-10 object-contain"
                  />
                ) : (
                  <Award className="size-7" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="flex items-center gap-1.5 font-semibold">
                {medal.name}
                {medal.category === "event" && (
                  <span className="rounded-sm bg-primary/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary">
                    Evento
                  </span>
                )}
              </p>
              {medal.description && (
                <p className="text-xs text-muted-foreground">{medal.description}</p>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </section>
  )
}
