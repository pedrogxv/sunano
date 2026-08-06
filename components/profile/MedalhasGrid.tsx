"use client"

import Image from "next/image"
import { Award } from "lucide-react"

import { getMedalLimit, type AccountTier } from "@/lib/account-tier"
import { MEDAL_RARITY_SOLID, MEDAL_RARITY_STYLES, type ShowcaseMedal } from "@/lib/profile-showcase"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface MedalhasGridProps {
  /** Já filtradas: só as conquistadas e selecionadas pelo usuário (ver `selectVisibleMedals`). */
  medals: ShowcaseMedal[]
  total: number
  tier: AccountTier
  isOwner?: boolean
}

/**
 * Grid de medalhas. Mostra só o que o usuário selecionou para o perfil — sem
 * slots vazios nem indicador de medalhas ocultas, então a seção some quando
 * não há nada selecionado.
 */
export function MedalhasGrid({ medals, total, tier, isOwner = false }: MedalhasGridProps) {
  const limit = getMedalLimit(tier)

  // Visitante não vê nada a destacar; só o dono ganha uma dica para ir
  // selecionar, já que ele tem medalhas conquistadas mas nenhuma escolhida.
  if (medals.length === 0) {
    if (!isOwner || total === 0) return null
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Medalhas
        </h2>
        <p className="text-sm text-muted-foreground/60">
          Você tem {total} medalha{total === 1 ? "" : "s"} conquistada{total === 1 ? "" : "s"}, mas
          nenhuma selecionada para o perfil. Escolha quais destacar nas configurações.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Medalhas
        </h2>
        <span className="text-xs text-muted-foreground/60">
          {medals.length} de {limit} slots · {total} conquistada{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex flex-wrap gap-4">
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
              <p className="font-semibold">{medal.name}</p>
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
